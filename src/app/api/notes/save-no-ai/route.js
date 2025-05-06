import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { posix as posixPath } from 'path';
import { sftpService } from '@/lib/sftp-service';
import { scrapeUrlContent, extractDomain, sanitizeFilename } from '@/lib/scraping-service';

export const dynamic = 'force-dynamic'; // Force dynamic execution for auth



export async function POST(request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
  const supabaseAuth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.split('Bearer ')[1];

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized: Missing token' }, { status: 401 });
  }

  const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(token);

  if (userError || !user) {
    console.error('Token validation error:', userError);
    return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
  }
  const userId = user.id;
  console.log(`Authenticated user ${userId} for no-AI save.`);

  let sftpClient;

  try {
    const sftpBasePath = process.env.SFTP_BASE_PATH;
    if (!sftpBasePath) {
        console.error('SFTP_BASE_PATH environment variable is not set.');
        return NextResponse.json({ error: 'Server SFTP configuration error.' }, { status: 500 });
    }

    sftpClient = await sftpService.connect();

    const formData = await request.formData();
    const manualText = formData.get('manualText') || '';
    let noteTitle = formData.get('noteTitle') || 'New Note'; // Get title from form
    const transcribeAudio = formData.get('transcribeAudio') === 'true';
    const webUrlsString = formData.get('webUrls');
    const webUrls = webUrlsString ? JSON.parse(webUrlsString) : [];
    const noteIdToUpdate = formData.get('noteId'); // Check if it's an update

    if (noteIdToUpdate) {
      console.log(`Received request to update note ID ${noteIdToUpdate} with no-AI save.`);
    } else {
      console.log('Received request to create new note with no-AI save.');
    }
    console.log('Details: manualText:', !!manualText, 'transcribeAudio:', transcribeAudio, 'webUrls:', webUrls);

    const uploadedFilePaths = { files: [], images: [], voice: [] };
    const scrapingErrors = [];

    // Process and Upload Files/Audio
    for (const [key, value] of formData.entries()) {
      if (key.startsWith('voiceRecording_') && value instanceof Blob && value.size > 0) {
        const voiceBlob = value;
        const originalName = voiceBlob.name || 'recording.webm';
        const uniqueVoiceName = `${uuidv4()}_${originalName}`;
        const relativeVoicePath = posixPath.join(userId, 'voice', uniqueVoiceName);
        const remoteVoicePath = posixPath.join(sftpBasePath, relativeVoicePath);
        const voiceBuffer = Buffer.from(await voiceBlob.arrayBuffer());

        await sftpService.uploadFile(sftpClient, voiceBuffer, remoteVoicePath);
        uploadedFilePaths.voice.push({ path: relativeVoicePath, name: originalName, size: voiceBlob.size });
        console.log(`Uploaded voice recording: ${originalName} to ${remoteVoicePath}`);

        // The 'transcribeAudio' flag from FormData is noted,
        // but the actual decision and process of transcription happens in process-async.
        // This route ('save-no-ai') only saves the raw audio file.
        // The 'transcribeAudio' flag will be implicitly handled by 'process-async'
        // if it checks the note's properties or if we decide to pass it explicitly.
        // For now, 'process-async' handles transcription based on its own logic for audio files.
        // No placeholder .txt file is created here.
        if (transcribeAudio) {
            console.log(`Transcription requested for ${originalName}. This will be handled by process-async.`);
        }
      } else if (key.startsWith('attachment_') && value instanceof Blob && value.size > 0) {
        const file = value;
        const safeFileName = file.name.replace(/[/\\]/g, '_');
        const uniqueFileName = `${uuidv4()}_${safeFileName}`;
        const fileBuffer = Buffer.from(await file.arrayBuffer());
        let targetDir = 'files';
        let pathList = uploadedFilePaths.files;

        if (file.type.startsWith('image/')) {
          targetDir = 'images';
          pathList = uploadedFilePaths.images;
        }

        const relativeFilePath = posixPath.join(userId, targetDir, uniqueFileName);
        const remoteFilePath = posixPath.join(sftpBasePath, relativeFilePath);
        await sftpService.uploadFile(sftpClient, fileBuffer, remoteFilePath);
        pathList.push({ path: relativeFilePath, name: file.name, size: file.size });
        console.log(`Uploaded attachment: ${file.name} to ${remoteFilePath}`);
      }
    }

    // Process Web URLs
    if (webUrls && webUrls.length > 0) {
      console.log(`Processing ${webUrls.length} web URLs for no-AI save...`);
      for (let i = 0; i < webUrls.length; i++) {
        const url = webUrls[i];
        const scrapeResult = await scrapeUrlContent(url);
        if (scrapeResult.success) {
          try {
            const pageTitle = scrapeResult.title || extractDomain(url);
            const baseFilename = sanitizeFilename(pageTitle) || `web_content_${i + 1}`;
            const uniqueFilename = `${uuidv4()}_${baseFilename}.txt`;
            const fileContent = `Original URL: ${url}\n\n${scrapeResult.content}`;
            const fileBuffer = Buffer.from(fileContent, 'utf-8');
            const relativeFilePath = posixPath.join(userId, 'files', uniqueFilename);
            const remoteFilePath = posixPath.join(sftpBasePath, relativeFilePath);
            await sftpService.uploadFile(sftpClient, fileBuffer, remoteFilePath);
            uploadedFilePaths.files.push({
              path: relativeFilePath,
              name: `${baseFilename}.txt`,
              size: fileBuffer.length,
              originalUrl: url
            });
            console.log(`Uploaded scraped content for ${url} to ${remoteFilePath}`);
          } catch (uploadError) {
            scrapingErrors.push({ url: url, error: `Failed to save scraped content: ${uploadError.message}` });
          }
        } else {
          scrapingErrors.push({ url: url, error: scrapeResult.error || 'Unknown scraping error' });
        }
      }
    }

    // Title and excerpt will be generated by the process-async route.
    // The noteTitle from the form is a user-suggestion or default.

    let noteDataForDb;
    let savedNoteId;
    let dbError;

    if (noteIdToUpdate) {
      // --- UPDATE EXISTING NOTE ---
      const { data: existingNote, error: fetchError } = await supabaseAdmin
        .from('notes')
        .select('text, files, images, voice')
        .eq('id', noteIdToUpdate)
        .eq('user_id', userId)
        .single();

      if (fetchError) {
        console.error(`Failed to fetch existing note ${noteIdToUpdate} for update:`, fetchError);
        throw new Error(`Failed to fetch existing note: ${fetchError.message}`);
      }

      // Merge new content with existing content
      const mergedText = (existingNote.text || '') + (manualText ? `\n\n${manualText}` : ''); // Append new text
      const mergedFiles = [...(existingNote.files || []), ...uploadedFilePaths.files];
      const mergedImages = [...(existingNote.images || []), ...uploadedFilePaths.images];
      const mergedVoice = [...(existingNote.voice || []), ...uploadedFilePaths.voice];

      noteDataForDb = {
        user_id: userId,
        title: noteTitle, // User-provided or default title, process-async will handle final title
        text: mergedText,
        files: mergedFiles,
        images: mergedImages,
        voice: mergedVoice,
        processing_status: 'processing', // Standard initial status
        updated_at: new Date().toISOString(),
      };

      console.log('Preparing merged note data for Supabase update (no-AI):', JSON.stringify(noteDataForDb, null, 2));
      const { error: updateError } = await supabaseAdmin
        .from('notes')
        .update(noteDataForDb)
        .eq('id', noteIdToUpdate); // userId check already done when fetching

      if (updateError) {
        console.error(`Supabase update error for note ${noteIdToUpdate} (no-AI save):`, updateError);
        dbError = updateError;
      } else {
        savedNoteId = noteIdToUpdate;
        console.log(`Note ${noteIdToUpdate} updated successfully with merged content (no-AI save).`);
      }

    } else {
      // --- INSERT NEW NOTE ---
      noteDataForDb = {
        user_id: userId,
        title: noteTitle, // User-provided or default title
        text: manualText, // Raw text
        files: uploadedFilePaths.files,
        images: uploadedFilePaths.images,
        voice: uploadedFilePaths.voice,
        processing_status: 'processing', // Standard initial status
      };
      console.log('Preparing new note data for Supabase insert (no-AI):', JSON.stringify(noteDataForDb, null, 2));
      const { data: newNote, error: insertError } = await supabaseAdmin
        .from('notes')
        .insert(noteDataForDb)
        .select('id')
        .single();

      if (insertError) {
        console.error('Supabase insert error (initial no-AI save):', insertError);
        dbError = insertError;
      } else {
        savedNoteId = newNote.id;
        console.log('Initial note (no-AI) saved successfully with ID:', savedNoteId);
      }
    }

    if (dbError) {
      // Attempt to delete uploaded files if DB insert fails
      // This is a simplified cleanup. A more robust solution might involve a transaction or a cleanup queue.
      try {
          const allFilesToDelete = [
              ...uploadedFilePaths.files.map(f => f.path),
              ...uploadedFilePaths.images.map(f => f.path),
              ...uploadedFilePaths.voice.map(f => f.path)
          ];
          for (const filePath of allFilesToDelete) {
              const remotePath = posixPath.join(sftpBasePath, filePath);
              console.log(`Attempting to delete orphaned file: ${remotePath}`);
              await sftpService.deleteFile(sftpClient, remotePath);
          }
      } catch (cleanupError) {
          console.error("Error during cleanup of orphaned files:", cleanupError);
      }
      throw new Error(dbError.message || 'Failed to save note to database.');
    }

    // Trigger async processing for title, excerpt, and any other standard post-processing
    // Add a flag to tell process-async to skip main content LLM restructuring
    const processResponse = await fetch(`${request.nextUrl.origin}/api/notes/process-async`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`, // Pass the original token
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        noteId: savedNoteId, // Use the ID from insert or update
        processType: 'no_ai_content_structuring' // Flag for process-async
      }),
    });

    if (!processResponse.ok) {
      const processErrorResult = await processResponse.json();
      console.error(`Async processing request failed for no-AI note ${savedNoteId}:`, processErrorResult);
      return NextResponse.json({
        message: `Note ${noteIdToUpdate ? 'updated' : 'saved'}, but failed to trigger async processing. Please check server logs.`,
        noteId: savedNoteId,
        scrapingErrors: scrapingErrors,
        asyncError: processErrorResult.error || 'Unknown async trigger error'
      }, { status: 207 }); // Multi-Status
    }

    console.log(`Async processing triggered successfully for no-AI note ${savedNoteId}.`);

    return NextResponse.json({
        message: `Note ${noteIdToUpdate ? 'updated' : 'saved'} and async processing for title/excerpt initiated.`,
        noteId: savedNoteId,
        scrapingErrors: scrapingErrors
    });

  } catch (error) {
    console.error('Error in save-no-ai endpoint:', error);
    return NextResponse.json({ error: error.message || 'An unexpected error occurred.' }, { status: 500 });
  } finally {
    if (sftpClient) {
      await sftpService.disconnect(sftpClient);
    }
  }
}