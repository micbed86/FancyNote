import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js'; // Import standard client for service role
import { cookies } from 'next/headers';
import { v4 as uuidv4 } from 'uuid'; // For generating unique filenames
import path, { posix as posixPath } from 'path'; // Import posix version for SFTP paths
import { sftpService } from '@/lib/sftp-service'; // Import our SFTP service
import { scrapeUrlContent, extractDomain, sanitizeFilename } from '@/lib/scraping-service'; // Import scraping functions

export const dynamic = 'force-dynamic'; // Force dynamic execution for auth

// Old FTP helper function removed


export async function POST(request) {
  // Initialize Supabase client using SERVICE ROLE for database operations
  // This bypasses RLS policies after we've already authenticated the user via token.
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } } // No need to persist session for service role
  );
  // --- DEBUG: Check if service key is loaded ---
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("FATAL: SUPABASE_SERVICE_ROLE_KEY environment variable is missing!");
    // Optionally return an error here, but logging might be enough for debug
  } else {
    console.log("Service role key seems loaded (length check)."); // Don't log the key itself!
  }
  // --- END DEBUG ---
  // Keep the route handler client specifically for token validation if needed elsewhere,
  // but we'll use supabaseAdmin for the insert.
  const supabaseAuth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY); // Use anon key for auth helper

  // --- Token Authentication ---
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.split('Bearer ')[1];

  if (!token) {
    console.log('No auth token provided');
    return NextResponse.json({ error: 'Unauthorized: Missing token' }, { status: 401 });
  }

  // Validate token using the auth client instance
  const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(token);

  if (userError || !user) {
    console.error('Token validation error:', userError);
    return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
  }
  const userId = user.id; // Get user ID from token validation
  console.log(`Authenticated user ${userId} via token.`);
  // --- End Token Authentication ---

  let sftpClient; // To hold the SFTP client instance for cleanup

  try {
    // 1. SFTP Base Path Configuration
    const sftpBasePath = process.env.SFTP_BASE_PATH;
    if (!sftpBasePath) {
        console.error('SFTP_BASE_PATH environment variable is not set.');
        return NextResponse.json({ error: 'Server SFTP configuration error.' }, { status: 500 });
    }
    // Note: User-specific directory creation is handled by the upload function

    // 2. Connect to SFTP
    // SFTP connection uses key from env vars, no need to fetch profile settings here for connection
    sftpClient = await sftpService.connect(); // Assign to outer scope for finally block

    // 3. Parse FormData
    const formData = await request.formData();
    const manualText = formData.get('manualText') || '';
    const noteTitle = formData.get('noteTitle') || 'New Note'; // Get title from form, default if missing
    // const audioBlob = formData.get('audioBlob'); // Removed: Now handling multiple voice recordings
    // const attachments = formData.getAll('attachments'); // Removed: Now handling indexed attachments
    const attachmentContextFlags = JSON.parse(formData.get('attachmentContextFlags') || '[]'); // Keep context flags
    const webUrlsString = formData.get('webUrls');
    const webUrls = webUrlsString ? JSON.parse(webUrlsString) : [];

    console.log('Received manualText:', !!manualText);
    // console.log('Received audioBlob:', !!audioBlob); // Removed
    // console.log('Received attachments count:', attachments.length); // Will log individually now
    console.log('Received context flags:', attachmentContextFlags);
    console.log('Received webUrls:', webUrls);


    // 4. Process and Upload Files/Audio/Web Content
    const uploadedFilePaths = { files: [], images: [], voice: [] }; // Store relative paths
    const scrapingErrors = []; // To store errors from scraping
    // const llmWebResources = []; // Prepare for LLM (though not saved directly here)

    // Upload Audio & Attachments by iterating through FormData
    let attachmentIndex = 0; // To correlate with context flags if needed
    for (const [key, value] of formData.entries()) {
      // Check for Voice Recordings
      if (key.startsWith('voiceRecording_') && value instanceof Blob && value.size > 0) {
        const voiceBlob = value;
        const originalName = voiceBlob.name || 'recording.webm'; // Use blob name if available
        const uniqueVoiceName = `${uuidv4()}_${originalName}`;
        const relativeVoicePath = posixPath.join(userId, 'voice', uniqueVoiceName);
        if (!sftpBasePath) throw new Error("SFTP Base Path not configured");
        const remoteVoicePath = posixPath.join(sftpBasePath, relativeVoicePath);
        const voiceBuffer = Buffer.from(await voiceBlob.arrayBuffer());

        console.log(`Uploading voice recording via SFTP to: ${remoteVoicePath}`);
        await sftpService.uploadFile(sftpClient, voiceBuffer, remoteVoicePath);
        console.log('SFTP Voice recording uploaded successfully.');

        uploadedFilePaths.voice.push({ path: relativeVoicePath, name: originalName, size: voiceBlob.size });
      }
      // Check for General Attachments (Files/Images)
      else if (key.startsWith('attachment_') && value instanceof Blob && value.size > 0) {
        const file = value;
        // Determine context flag based on index (assuming order is preserved)
        const includeInContext = attachmentContextFlags[attachmentIndex] !== undefined ? attachmentContextFlags[attachmentIndex] : true;
        attachmentIndex++; // Increment index for the next attachment

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
        if (!sftpBasePath) throw new Error("SFTP Base Path not configured");
        const remoteFilePath = posixPath.join(sftpBasePath, relativeFilePath);

        console.log(`Uploading ${targetDir} file via SFTP to: ${remoteFilePath}`);
        await sftpService.uploadFile(sftpClient, fileBuffer, remoteFilePath);
        console.log('SFTP File uploaded successfully.');

        pathList.push({ path: relativeFilePath, name: file.name, size: file.size, includeInContext });
      }
    }

    // --- End Combined Upload Loop ---

    // --- Process Web URLs ---
    if (webUrls && webUrls.length > 0) {
      console.log(`Processing ${webUrls.length} web URLs...`);
      for (let i = 0; i < webUrls.length; i++) {
        const url = webUrls[i];
        console.log(`Scraping URL ${i + 1}: ${url}`);
        const scrapeResult = await scrapeUrlContent(url);

        if (scrapeResult.success) {
          try {
            const pageTitle = scrapeResult.title || extractDomain(url);
            const baseFilename = sanitizeFilename(pageTitle) || `web_content_${i + 1}`;
            const uniqueFilename = `${uuidv4()}_${baseFilename}.txt`;
            const fileContent = `Original URL: ${url}\n\n${scrapeResult.content}`;
            const fileBuffer = Buffer.from(fileContent, 'utf-8');
            const fileSize = fileBuffer.length;

            const targetDir = 'files'; // Save scraped content as regular files
            const relativeFilePath = posixPath.join(userId, targetDir, uniqueFilename);
            if (!sftpBasePath) throw new Error("SFTP Base Path not configured");
            const remoteFilePath = posixPath.join(sftpBasePath, relativeFilePath);

            console.log(`Uploading scraped content via SFTP to: ${remoteFilePath}`);
            await sftpService.uploadFile(sftpClient, fileBuffer, remoteFilePath);
            console.log('SFTP Scraped content uploaded successfully.');

            // Add metadata to the files list
            uploadedFilePaths.files.push({
              path: relativeFilePath,
              name: `${baseFilename}.txt`, // Use the generated name
              size: fileSize,
              includeInContext: true, // Assume scraped content should be included by default
              originalUrl: url // Store original URL for potential future use
            });

            // Prepare LLM resource string (though not saved in this step)
            // const llmResource = `<web_page_resource_${i + 1}>\nurl = {\n[${url}]\n},\ncontent = {\n[${scrapeResult.content}]\n}\n</web_page_resource_${i + 1}>`;
            // llmWebResources.push(llmResource);

          } catch (uploadError) {
            console.error(`Error uploading scraped content for ${url}:`, uploadError);
            scrapingErrors.push({ url: url, error: `Failed to save scraped content: ${uploadError.message}` });
          }
        } else {
          console.warn(`Scraping failed for URL: ${url}, Error: ${scrapeResult.error}`);
          scrapingErrors.push({ url: url, error: scrapeResult.error || 'Unknown scraping error' });
        }
      }
    }
    // --- End Process Web URLs ---


    // 5. Prepare Note Data for Supabase
    const noteData = {
      user_id: userId,
      title: noteTitle, // Use title from form data
      text: manualText, // Keep text content
      // Store the relative paths and metadata (files array now includes scraped content)
      files: uploadedFilePaths.files,
      images: uploadedFilePaths.images,
      voice: uploadedFilePaths.voice,
      // transcripts: '', // To be added later
      // title: '', // To be added later or generated
      // summary: '', // To be added later
      // raw_llm_response: {}, // To be added later
      processing_status: 'processing', // Set initial status using correct column name
    };

    // 6. Save Note to Supabase
    console.log('Saving note data to Supabase:', noteData);
    // Use the ADMIN client (service role) to perform the insert, bypassing RLS check
    const { data: newNote, error: insertError } = await supabaseAdmin
      .from('notes')
      .insert(noteData)
      .select('id') // Select the ID of the newly created note
      .single();

    if (insertError) {
      console.error('Supabase insert error:', insertError);
      throw new Error(insertError.message || 'Failed to save note to database.');
    }

    console.log('Note saved successfully with ID:', newNote.id);

    // 7. Return Success Response (e.g., the new note ID)
    // 7. Return Success Response (including scraping errors)
    return NextResponse.json({
        message: 'Note processed successfully!',
        noteId: newNote.id,
        scrapingErrors: scrapingErrors // Include scraping errors in the response
    });

  } catch (error) {
    console.error('Error processing note:', error);
    return NextResponse.json({ error: error.message || 'An unexpected error occurred during note processing.' }, { status: 500 });
  } finally {
    // Ensure SFTP client is closed
    if (sftpClient) {
      await sftpService.disconnect(sftpClient);
    }
  }
}