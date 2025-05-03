import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { v4 as uuidv4 } from 'uuid';
import { posix as posixPath } from 'path'; // Use posix for consistent SFTP paths
import { sftpService } from '@/lib/sftp-service';
import { scrapeUrlContent, extractDomain, sanitizeFilename } from '@/lib/scraping-service'; // Import scraping functions
import dayjs from 'dayjs'; // For timestamp formatting
import fs from 'fs/promises'; // For temp file operations
import fsStandard from 'fs'; // For createReadStream
import os from 'os'; // For temp directory
import path from 'path'; // For local path operations
import Groq from 'groq-sdk'; // For transcription
import { v4 as uuidv4 } from 'uuid'; // Ensure uuid is imported if not already (it is)

export const dynamic = 'force-dynamic'; // Force dynamic execution for auth

// --- Helper Functions (Copied from process-async/route.js) ---

async function transcribeAudio(filePath, aiSettings) {
  try {
    console.log(`Transcribing audio file: ${filePath}`);
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    console.log('Using Groq API for transcription with whisper-large-v3');
    const fileStream = fsStandard.createReadStream(filePath);
    const transcription = await groq.audio.transcriptions.create({
      file: fileStream,
      model: "whisper-large-v3",
      language: aiSettings?.language || "pl" // Default to Polish or use setting
    });
    console.log('Transcription completed successfully');
    return transcription.text || '';
  } catch (error) {
    console.error('Error transcribing audio with Groq API:', error);
    return `[Transcription Error: ${error.message}]`;
  }
}

function validateModelId(modelId) {
  if (!modelId) return null;
  if (modelId.includes('/')) return modelId;
  return `openai/${modelId}`; // Assume OpenAI default if no provider
}

async function processWithLLM(systemPrompt, formattedUserContent, images, aiSettings, token) {
  // Note: Adapted to take the full systemPrompt directly
  try {
    console.log('Processing content with LLM via OpenRouter');

    if (!aiSettings.apiKey && !process.env.OPENROUTER_API_KEY) {
      throw new Error('No OpenRouter API key provided');
    }

    const messages = [{ role: 'system', content: systemPrompt }];

    // Handle images if present (assuming 'images' contains NEW images for the update context)
    if (images && images.length > 0 && images.some(img => img.includeInContext)) {
      const userMessageContent = [];
      if (formattedUserContent) {
        userMessageContent.push({ type: 'text', text: formattedUserContent });
      }
      images.forEach(image => {
        if (image.includeInContext) {
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://fancynote.up.railway.app';
          const imageUrl = `${baseUrl}/api/notes/attachment/${image.path}?token=${token}`; // Use the provided token
          userMessageContent.push({ type: 'image_url', image_url: { url: imageUrl } });
        }
      });
      messages.push({ role: 'user', content: userMessageContent });
    } else {
      messages.push({ role: 'user', content: formattedUserContent || 'Please analyze this note update.' });
    }

    const primaryModel = validateModelId(aiSettings.model) || 'google/gemini-2.5-pro-exp-03-25:free';
    const fallbackModels = ['google/gemini-2.0-flash-thinking-exp:free', 'google/gemini-2.0-flash-lite-001'];
    const modelsToTry = [primaryModel, ...fallbackModels];
    let lastError = null;

    for (const model of modelsToTry) {
      const payload = { model: model, messages: messages, temperature: 0.7, max_tokens: 4000, top_p: 0.9 };
      console.log(`Attempting LLM processing with model: ${model}`);

      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${aiSettings.apiKey || process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://fancynote.up.railway.app/',
            'X-Title': 'FancyNote App'
          },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          const data = await response.json();
          if (data.choices && data.choices.length > 0 && data.choices[0]?.message?.content) {
            console.log(`Successfully processed with model: ${model}`);
            return data.choices[0].message.content; // Success
          } else {
            console.error(`OpenRouter API response missing choices/content for model ${model}:`, JSON.stringify(data, null, 2));
            lastError = new Error(`Invalid response format from LLM API (model: ${model})`);
            continue;
          }
        } else {
          const errorData = await response.json().catch(() => ({ error: { message: response.statusText } }));
          console.error(`OpenRouter API error (model: ${model}, status: ${response.status}):`, errorData);
          lastError = new Error(`LLM API error (model: ${model}): ${errorData.error?.message || response.statusText}`);
          if (response.status === 429) {
            console.warn(`Quota exceeded for model ${model}. Trying next model...`);
            continue;
          } else {
            throw lastError; // Fail fast on non-quota errors
          }
        }
      } catch (fetchError) {
        console.error(`Fetch error during LLM processing (model: ${model}):`, fetchError);
        lastError = fetchError;
        continue; // Try next model on fetch error
      }
    } // End model loop

    console.error('All LLM models failed.', lastError);
    throw lastError || new Error('All LLM models failed to process the request.');

  } catch (error) {
    console.error('Error processing with LLM:', error);
    return `[LLM Processing Error: ${error.message}]\n\n(The update could not be fully processed by the AI.)`;
  }
}

// --- End Helper Functions ---


export async function POST(request) {
  // Initialize Supabase clients
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
  const supabaseAuth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  // --- Token Authentication ---
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
  console.log(`Authenticated user ${userId} for note update.`);
  // --- End Token Authentication ---

  // Fetch user's AI settings early
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('ai_settings')
    .eq('id', userId)
    .single();

  if (profileError) {
    console.error('Error fetching user profile for AI settings:', profileError);
    return NextResponse.json({ error: 'Failed to fetch user AI settings' }, { status: 500 });
  }

  let aiSettings;
  try {
    aiSettings = typeof profile.ai_settings === 'string'
      ? JSON.parse(profile.ai_settings)
      : profile.ai_settings;
    if (!aiSettings) throw new Error("AI settings are null or invalid.");
  } catch (error) {
    console.error('Error parsing AI settings:', error);
    return NextResponse.json({ error: 'Invalid AI settings format' }, { status: 500 });
  }

  let sftpClient;
  let tempDir; // Define tempDir in the outer scope for cleanup

  try {
    // Create temp directory for processing new files
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fancynote-update-'));
    console.log(`Created temp directory: ${tempDir}`);
    // 1. SFTP Base Path Configuration
    const sftpBasePath = process.env.SFTP_BASE_PATH;
    if (!sftpBasePath) {
      throw new Error('SFTP_BASE_PATH environment variable is not set.');
    }

    // 2. Connect to SFTP
    sftpClient = await sftpService.connect();

    // 3. Parse FormData
    const formData = await request.formData();
    const noteId = formData.get('noteId'); // Get the ID of the note to update
    const manualText = formData.get('manualText') || ''; // New text input
    const noteTitle = formData.get('noteTitle') || 'Untitled Note'; // Potentially updated title
    const attachmentContextFlags = JSON.parse(formData.get('attachmentContextFlags') || '[]');
    const webUrlsString = formData.get('webUrls');
    const webUrls = webUrlsString ? JSON.parse(webUrlsString) : []; // Parse new web URLs

    if (!noteId) {
      return NextResponse.json({ error: 'Bad Request: Missing noteId' }, { status: 400 });
    }
    console.log(`Processing update for note ID: ${noteId}`);

    // 4. Fetch Current Note Data
    const { data: currentNote, error: fetchError } = await supabaseAdmin
      .from('notes')
      .select('text, title, files, images, voice') // Select necessary fields
      .eq('id', noteId)
      .eq('user_id', userId) // Ensure user owns the note
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') { // Not found or no access
        return NextResponse.json({ error: 'Note not found or access denied.' }, { status: 404 });
      }
      console.error('Error fetching current note:', fetchError);
      throw new Error('Failed to fetch current note data.');
    }
    console.log("Current note data fetched successfully.");
    const currentNoteText = currentNote.text || '';

    // 5. Save Previous Version to SFTP
    const timestamp = dayjs().format('YYYYMMDD_HHMMSS');
    const backupFilename = `NoteBackup_${timestamp}.txt`;
    const backupDir = posixPath.join(sftpBasePath, 'note_backups', userId, noteId);
    const remoteBackupPath = posixPath.join(backupDir, backupFilename);
    const backupContent = Buffer.from(currentNoteText, 'utf-8');

    console.log(`Attempting to save backup to: ${remoteBackupPath}`);
    // uploadFile internally calls ensureDirExists, no need for the extra 'true' argument here
    await sftpService.uploadFile(sftpClient, backupContent, remoteBackupPath);
    console.log('Note backup saved successfully.');

    const backupFileDetails = {
      name: backupFilename,
      path: posixPath.join('note_backups', userId, noteId, backupFilename), // Store relative path for DB
      size: backupContent.length,
      type: 'backup/text', // Indicate type
      created_at: new Date().toISOString(),
    };

    // 6. Process and Upload *New* Attachments & Prepare Content for AI
    const newUploadedFilePaths = { files: [], images: [], voice: [] };
    const newTranscriptions = []; // Store { index: number, content: string }
    const newFileContents = []; // Store { index: number, name: string, content: string }
    const newImagesForContext = []; // Store image details for processWithLLM
    const scrapingErrors = []; // To store errors from scraping
    let attachmentIndex = 0;
    let voiceIndex = 1;
    let textFileIndex = 1;
    const audioExtensions = ['.mp3', '.wav', '.m4a', '.ogg', '.aac', '.opus', '.flac']; // Define audio extensions

    for (const [key, value] of formData.entries()) {
      // --- Process New Voice Recordings ---
      if (key.startsWith('voiceRecording_') && value instanceof Blob && value.size > 0) {
        const voiceBlob = value;
        const originalName = voiceBlob.name || 'recording.webm';
        const uniqueVoiceName = `${uuidv4()}_${originalName}`;
        const relativeVoicePath = posixPath.join(userId, 'voice', uniqueVoiceName);
        const remoteVoicePath = posixPath.join(sftpBasePath, relativeVoicePath);
        const localPath = path.join(tempDir, uniqueVoiceName);

        // Upload first
        const voiceBuffer = Buffer.from(await voiceBlob.arrayBuffer());
        console.log(`Uploading new voice recording to: ${remoteVoicePath}`);
        await sftpService.uploadFile(sftpClient, voiceBuffer, remoteVoicePath);
        const uploadedVoiceInfo = { path: relativeVoicePath, name: originalName, size: voiceBlob.size, created_at: new Date().toISOString(), includeInContext: true }; // Assume voice included in context
        newUploadedFilePaths.voice.push(uploadedVoiceInfo);

        // Save locally for transcription
        await fs.writeFile(localPath, voiceBuffer);

        // Transcribe
        console.log(`Transcribing new voice recording: ${originalName}`);
        const transcription = await transcribeAudio(localPath, aiSettings);
        newTranscriptions.push({ index: voiceIndex++, content: transcription });
        // Note: Not saving transcription file separately for updates, unlike create flow
      }
      // --- Process New File/Image Attachments ---
      else if (key.startsWith('attachment_') && value instanceof Blob && value.size > 0) {
        const file = value;
        const includeInContext = attachmentContextFlags[attachmentIndex] !== undefined ? attachmentContextFlags[attachmentIndex] : true;
        attachmentIndex++;

        const safeFileName = file.name.replace(/[/\\]/g, '_');
        const uniqueFileName = `${uuidv4()}_${safeFileName}`;
        const fileBuffer = Buffer.from(await file.arrayBuffer());
        const localPath = path.join(tempDir, uniqueFileName);

        let targetDir = 'files';
        let pathList = newUploadedFilePaths.files;
        let isImage = file.type.startsWith('image/');
        const fileExt = path.extname(file.name).toLowerCase();
        let isAudio = audioExtensions.includes(fileExt);

        if (isImage) {
          targetDir = 'images';
          pathList = newUploadedFilePaths.images;
        } else if (isAudio) {
          targetDir = 'voice'; // Store audio files under voice dir
          pathList = newUploadedFilePaths.voice;
        }

        const relativeFilePath = posixPath.join(userId, targetDir, uniqueFileName);
        const remoteFilePath = posixPath.join(sftpBasePath, relativeFilePath);

        // Upload first
        console.log(`Uploading new ${targetDir} file to: ${remoteFilePath}`);
        await sftpService.uploadFile(sftpClient, fileBuffer, remoteFilePath);
        const uploadedFileInfo = { path: relativeFilePath, name: file.name, size: file.size, includeInContext, created_at: new Date().toISOString() };
        pathList.push(uploadedFileInfo);

        // If included in context, process content
        if (includeInContext) {
          await fs.writeFile(localPath, fileBuffer); // Save locally for processing

          if (isImage) {
             newImagesForContext.push(uploadedFileInfo);
          } else if (isAudio) {
            console.log(`Transcribing new audio attachment: ${file.name}`);
            const transcription = await transcribeAudio(localPath, aiSettings);
            newTranscriptions.push({ index: voiceIndex++, content: transcription });
          } else {
            // Process as text file
            console.log(`Processing new text attachment: ${file.name}`);
            let fileContent = '';
            try {
              fileContent = await fs.readFile(localPath, 'utf8');
            } catch (readError) {
              console.warn(`Could not read file ${file.name} as UTF-8 text. Skipping content. Error: ${readError.message}`);
              fileContent = `[Could not read content of file: ${file.name}]`;
            }
            newFileContents.push({ index: textFileIndex++, name: file.name, content: fileContent });
          }
        }
      }
    }
    console.log("New attachments processed, uploaded, and content prepared for AI.");

    // --- Process *New* Web URLs ---
    if (webUrls && webUrls.length > 0) {
      console.log(`Processing ${webUrls.length} new web URLs for update...`);
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

            // Add metadata to the *new* files list for merging later
            newUploadedFilePaths.files.push({
              path: relativeFilePath,
              name: `${baseFilename}.txt`,
              size: fileSize,
              includeInContext: true, // Assume included by default for updates too
              originalUrl: url,
              created_at: new Date().toISOString() // Add timestamp
            });
            // NOTE: Scraped content is NOT added to formattedNewContent for the LLM update prompt.
            // It's treated as a new file attachment.

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


    // 7. Format New User Content for AI (Excluding scraped web content)
    let formattedNewContent = '';
    if (newTranscriptions.length > 0) {
      newTranscriptions.forEach(t => {
        formattedNewContent += `\n<new_voice_recording_transcription_part_${t.index}>\n${t.content}\n</new_voice_recording_transcription_part_${t.index}>\n\n`;
      });
    }
    if (manualText && manualText.trim()) {
      formattedNewContent += `\n<newly_added_text>\n${manualText}\n</newly_added_text>\n\n`;
    }
    if (newFileContents.length > 0) {
      newFileContents.forEach(f => {
        formattedNewContent += `\n<new_attachment_${f.index}>\n${f.content}\n</new_attachment_${f.index}>\n\n`;
      });
    }
    formattedNewContent = formattedNewContent.trim();

    // 8. Construct Final System Prompt
    let baseSystemPrompt = aiSettings.systemPrompt || 'You are a helpful assistant that organizes and summarizes notes.';
    const language = aiSettings.language || 'en';
    // Add language instruction if needed
    if (!baseSystemPrompt.toLowerCase().includes('language') && !baseSystemPrompt.toLowerCase().includes(language)) {
      const languageNames = { 'en': 'English', 'pl': 'Polish', 'it': 'Italian', 'de': 'German' };
      baseSystemPrompt += `\n\nCrucially, since the user has selected **${languageNames[language] || 'English'}** as their preferred language, you MUST always generate your responses in ${languageNames[language] || 'English'} *regardless* of the language of provided instructions and *regardless* of the language of the user's content, transcription or attachments.`;
    }

    const updateInstructions = `
# THIS IS THE NOTE THAT YOU HAVE ALREADY CREATED:
<current_note>
${currentNoteText}
</current_note>

# THIS IS YOUR CURRENT AND ONLY TASK:
<current_task_instructions>
- Analyze the user's new content as an addition or modification to the current note content shown above, according to your general purpose defined in the initial system prompt.
- Based on the new content provided by the user and the current note, decide whether to append the new information to the end of the current note or integrate it seamlessly into the appropriate sections of the existing content, in either case maintaining the original style and structure.
- In the response, return ONLY the updated version of the note text.
- IMPORTANT: *DO NOT MISS ANYTHING FROM THE CURRENT NOTE*. Ensure all original content is preserved unless explicitly replaced or modified by the new user input.
</current_task_instructions>
`;

    const finalSystemPrompt = `${baseSystemPrompt}\n\n${updateInstructions}`;


    // 9. Call AI Model (Using actual implementation)
    const updatedNoteText = await processWithLLM(
        finalSystemPrompt,
        formattedNewContent,
        newImagesForContext, // Pass new images included in context
        aiSettings,
        token // Pass the auth token for image URL access
    );


    // 10. Prepare Database Update Data
    // Merge existing attachments with newly uploaded ones
    const mergedFiles = [...(currentNote.files || []), ...newUploadedFilePaths.files, backupFileDetails];
    const mergedImages = [...(currentNote.images || []), ...newUploadedFilePaths.images];
    const mergedVoice = [...(currentNote.voice || []), ...newUploadedFilePaths.voice];

    const updateData = {
      // title: noteTitle, // DO NOT update title during content update process
      text: updatedNoteText, // Use the AI's response
      files: mergedFiles,
      images: mergedImages,
      voice: mergedVoice,
      updated_at: new Date().toISOString(),
      processing_status: 'idle', // Mark as idle after successful update
      processing_error: null, // Clear previous processing error if any
    };

    // 11. Update Note in Supabase
    console.log('Updating note in Supabase with ID:', noteId);
    const { error: updateError } = await supabaseAdmin
      .from('notes')
      .update(updateData)
      .eq('id', noteId)
      .eq('user_id', userId);

    if (updateError) {
      console.error('Supabase update error:', updateError);
      throw new Error(updateError.message || 'Failed to update note in database.');
    }
    console.log('Note updated successfully in Supabase.');

    // 12. Deduct Credits (Integrated Logic)
    try {
        const { data: currentProfileData, error: currentProfileError } = await supabaseAdmin
            .from('profiles')
            .select('project_credits')
            .eq('id', userId)
            .single();

        if (currentProfileError) {
            console.error('Failed to fetch current project credits for deduction:', currentProfileError);
        } else {
            const newCredits = Math.max(0, (currentProfileData.project_credits || 0) - 1); // Prevent negative credits
            const { error: creditUpdateError } = await supabaseAdmin
                .from('profiles')
                .update({ project_credits: newCredits })
                .eq('id', userId);

            if (creditUpdateError) {
                console.error('Failed to update user credits:', creditUpdateError);
            } else {
                console.log(`User credits updated for user ${userId}. New balance: ${newCredits}`);
            }
        }
    } catch (creditError) {
        console.error("Error during credit deduction block:", creditError);
    }
    // --- End Credit Deduction ---


    // 13. Return Success Response (including scraping errors)
    return NextResponse.json({
        message: 'Note updated successfully!',
        noteId: noteId,
        scrapingErrors: scrapingErrors // Include scraping errors
    });

  } catch (error) {
    console.error('Error processing note update:', error);
    // Attempt to disconnect SFTP even on error
    if (sftpClient) {
      try { await sftpService.disconnect(sftpClient); } catch (e) { console.error("SFTP disconnect error during error handling:", e); }
    }
     // Attempt to update note status to error
    try {
        // Need noteId here, which might not be available if parsing formData failed
        // Let's try getting it from formData again inside the catch block if needed
        const errorNoteId = formData?.get('noteId');
        if (errorNoteId) {
            await supabaseAdmin
                .from('notes')
                .update({ processing_status: 'error', processing_error: error.message })
                .eq('id', errorNoteId);
        } else {
             console.error('Could not update note status to error: noteId unavailable in catch block.');
        }
    } catch (updateError) {
        console.error('Failed to update note status to error:', updateError);
    }
    // Return error response
    return NextResponse.json({ error: error.message || 'An unexpected error occurred during note update.' }, { status: 500 });
  } finally {
    // Ensure SFTP client is closed
    if (sftpClient) {
      try { await sftpService.disconnect(sftpClient); console.log("SFTP client disconnected in finally block."); } catch (e) { console.error("SFTP disconnect error in finally:", e); }
    }
    // Clean up temp directory
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
        console.log(`Removed temp directory: ${tempDir}`);
      } catch (cleanupError) {
        console.error('Error cleaning up temp directory:', cleanupError);
      }
    }
  }
}