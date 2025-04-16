// src/app/api/notes/process-async/route.js
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { posix as posixPath } from 'path';
import { sftpService } from '@/lib/sftp-service';
import fs from 'fs/promises';
import fsStandard from 'fs'; // Import standard fs module for createReadStream
import os from 'os';
import path from 'path';
import Groq from 'groq-sdk';

export const dynamic = 'force-dynamic';

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
    console.log('No auth token provided');
    return NextResponse.json({ error: 'Unauthorized: Missing token' }, { status: 401 });
  }

  // Validate token using the auth client instance
  const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(token);

  if (userError || !user) {
    console.error('Token validation error:', userError);
    return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
  }
  const userId = user.id;
  console.log(`Authenticated user ${userId} via token.`);
  // --- End Token Authentication ---

  try {
    // Parse request body
    const { noteId } = await request.json();
    
    if (!noteId) {
      return NextResponse.json({ error: 'Missing noteId parameter' }, { status: 400 });
    }

    // Fetch the note data
    const { data: noteData, error: noteError } = await supabaseAdmin
      .from('notes')
      .select('*')
      .eq('id', noteId)
      .eq('user_id', userId)
      .single();

    if (noteError) {
      console.error('Error fetching note:', noteError);
      return NextResponse.json({ error: 'Failed to fetch note data' }, { status: 500 });
    }

    // Fetch user's AI settings
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('ai_settings')
      .eq('id', userId)
      .single();

    if (profileError) {
      console.error('Error fetching user profile:', profileError);
      return NextResponse.json({ error: 'Failed to fetch user AI settings' }, { status: 500 });
    }

    // Parse AI settings
    let aiSettings;
    try {
      aiSettings = typeof profile.ai_settings === 'string' 
        ? JSON.parse(profile.ai_settings) 
        : profile.ai_settings;
    } catch (error) {
      console.error('Error parsing AI settings:', error);
      return NextResponse.json({ error: 'Invalid AI settings format' }, { status: 500 });
    }

    // Start background processing
    // In a production environment, this would be handled by a queue system
    // For this implementation, we'll start the process and return immediately
    processNoteInBackground(noteId, noteData, userId, aiSettings, supabaseAdmin, token);

    // Return success response immediately
    return NextResponse.json({ 
      message: 'Note processing started', 
      noteId: noteId 
    });

  } catch (error) {
    console.error('Error initiating note processing:', error);
    return NextResponse.json({ 
      error: error.message || 'An unexpected error occurred' 
    }, { status: 500 });
  }
}

async function processNoteInBackground(noteId, noteData, userId, aiSettings, supabaseAdmin, token) {
  let sftpClient;
  const transcriptions = [];
  const transcriptionsWithMetadata = [];
  const fileContents = [];
  const transcriptionFiles = []; // Array to store transcription file information
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fancynote-'));
  
  try {
    console.log(`Starting background processing for note ${noteId}`);
    
    // 1. Process voice recordings for transcription
    if (noteData.voice && noteData.voice.length > 0) {
      console.log(`Processing ${noteData.voice.length} voice recordings`);
      
      // Connect to SFTP
      sftpClient = await sftpService.connect();
      const sftpBasePath = process.env.SFTP_BASE_PATH;
      
      // Process each voice recording
      let recordingIndex = 1;
      for (const recording of noteData.voice) {
        // Only process recordings that have includeInContext flag set to true or undefined (for backward compatibility)
        if (recording.includeInContext !== false) {
          const remotePath = posixPath.join(sftpBasePath, recording.path);
          const localPath = path.join(tempDir, path.basename(recording.path));
          
          // Download the file
          console.log(`Downloading voice recording from ${remotePath}`);
          await sftpClient.fastGet(remotePath, localPath);
          
          // Transcribe using qroq API
          const transcription = await transcribeAudio(localPath, aiSettings);
          transcriptions.push(transcription);
          
          // Store transcription with metadata for formatted message
          transcriptionsWithMetadata.push({
            index: recordingIndex,
            content: transcription
          });
          recordingIndex++;
          
          // Save transcription to a text file on SFTP
          const transcriptionFileName = `${path.basename(recording.path, path.extname(recording.path))}.txt`;
          const transcriptionPath = posixPath.join(userId, 'transcriptions', transcriptionFileName);
          const remoteTranscriptionPath = posixPath.join(sftpBasePath, transcriptionPath);
          
          // Ensure directory exists
          await sftpService.ensureDirExists(sftpClient, posixPath.dirname(remoteTranscriptionPath));
          
          // Upload transcription file
          await sftpClient.put(Buffer.from(transcription), remoteTranscriptionPath);
          console.log(`Saved transcription to ${remoteTranscriptionPath}`);
          
          // Store the transcription file info to add as an attachment later
          const transcriptionFileInfo = {
            path: transcriptionPath,
            name: transcriptionFileName,
            size: Buffer.from(transcription).length,
            includeInContext: true
          };
          transcriptionFiles.push(transcriptionFileInfo);
        }
      }
    }
    
    // 2. Process file attachments (read content of non-image files)
    if (noteData.files && noteData.files.length > 0) {
      console.log(`Processing ${noteData.files.length} file attachments`);
      
      // Connect to SFTP if not already connected
      if (!sftpClient) {
        sftpClient = await sftpService.connect();
      }
      const sftpBasePath = process.env.SFTP_BASE_PATH;
      
      // Process each file attachment
      let fileIndex = 1;
      for (const file of noteData.files) {
        // Only process files that have includeInContext flag set to true
        if (file.includeInContext) {
          const remotePath = posixPath.join(sftpBasePath, file.path);
          const localPath = path.join(tempDir, path.basename(file.path));
          
          try {
            // Download the file
            console.log(`Downloading file attachment from ${remotePath}`);
            await sftpClient.fastGet(remotePath, localPath);
            
            // Read file content
            const fileContent = await fs.readFile(localPath, 'utf8');
            
            // Store file content with metadata for formatted message
            fileContents.push({
              index: fileIndex,
              name: file.name,
              content: fileContent
            });
            fileIndex++;
          } catch (error) {
            console.error(`Error processing file attachment ${file.name}:`, error);
          }
        }
      }
    }
    
    // 3. Process with LLM
    let llmResponse = '';
    if (transcriptionsWithMetadata.length > 0 || noteData.text || fileContents.length > 0 || (noteData.images && noteData.images.some(img => img.includeInContext))) {
      console.log('Processing content with LLM');
      llmResponse = await processWithLLM(transcriptionsWithMetadata, noteData.text, fileContents, noteData.images, aiSettings, token);
    } else {
      console.log('No content to process with LLM');
    }

    // Note: Title and Excerpt generation moved to AFTER the initial content update

    // 3b. Update the note with processed content, title, and excerpt
    // Prepare update payload - always update status and timestamp
    const currentFiles = noteData.files || [];
    const updatedFiles = [...currentFiles, ...transcriptionFiles];
    const updatePayload = {
      text: llmResponse || noteData.text, // Use LLM response if available, else original text
      transcripts: transcriptions.join('\n\n'),
      files: updatedFiles,
      processing_status: 'ready', // Update status to ready
      processed_at: new Date().toISOString()
    };

    // --- Initial Update: Save core processed content ---
    console.log(`Performing initial update for note ${noteId}`);
    const { error: initialUpdateError } = await supabaseAdmin
      .from('notes')
      .update(updatePayload)
      .eq('id', noteId);

    if (initialUpdateError) {
      throw new Error(`Failed to perform initial update for note: ${initialUpdateError.message}`);
    }
    console.log(`Initial update successful for note ${noteId}`);

    // --- Generate Title & Excerpt using FINAL content ---
    const contentForGroq = updatePayload.text; // Use the final text saved in the DB
    let generatedTitle = null;
    let generatedExcerpt = null;
    const language = aiSettings?.language || 'en';
    let finalTitle = noteData.title || 'New Note'; // Default final title

    if (noteData.title === 'New Note' && contentForGroq) {
        try {
            console.log(`Generating title for note ${noteId} using final content...`);
            generatedTitle = await generateNoteTitle(contentForGroq, language);
            if (generatedTitle) {
              console.log(`Generated title: ${generatedTitle}`);
              finalTitle = generatedTitle; // Update final title if generation successful
            } else {
              console.log('Title generation returned null or empty.');
            }
        } catch (error) {
            console.error(`Error generating title for note ${noteId}:`, error);
        }
    } else {
        finalTitle = noteData.title; // Use original title if not 'New Note'
    }


    if (contentForGroq) {
         try {
            console.log(`Generating excerpt for note ${noteId} using final content...`);
            generatedExcerpt = await generateNoteExcerpt(contentForGroq, language);
             if (generatedExcerpt) {
               console.log(`Generated excerpt: ${generatedExcerpt}`);
             } else {
               console.log('Excerpt generation returned null or empty.');
             }
        } catch (error) {
            console.error(`Error generating excerpt for note ${noteId}:`, error);
        }
    }

    // --- Second Update: Add Title and Excerpt if generated ---
    if (generatedTitle || generatedExcerpt) {
      const secondUpdatePayload = {};
      if (generatedTitle) {
        secondUpdatePayload.title = generatedTitle;
      }
      if (generatedExcerpt) {
        secondUpdatePayload.excerpt = generatedExcerpt;
      }

      console.log(`Performing second update for note ${noteId} with title/excerpt`);
      const { error: secondUpdateError } = await supabaseAdmin
        .from('notes')
        .update(secondUpdatePayload)
        .eq('id', noteId);

      if (secondUpdateError) {
        // Log error but don't necessarily throw, as main content is saved
        console.error(`Failed to perform second update (title/excerpt) for note ${noteId}: ${secondUpdateError.message}`);
      } else {
        console.log(`Second update (title/excerpt) successful for note ${noteId}`);
      }
    }
    
    // 4. Add notification
    // Determine the final title for the notification
    // finalTitle is already determined above based on generation success

    // Add notification
    const { error: notificationError } = await supabaseAdmin
      .from('notifications')
      .insert({
        user_id: userId,
        type: 'note_processed',
        content: {
          noteId: noteId,
          title: finalTitle, // Use the potentially updated title
          message: 'Your note has been processed successfully!'
        },
        read: false,
        created_at: new Date().toISOString()
      });

    if (notificationError) {
      console.error('Failed to create notification:', notificationError);
    } else {
      console.log(`Created notification for user ${userId} about note ${noteId} with title "${finalTitle}"`);
    }
    
  } catch (error) {
    console.error(`Error in background processing for note ${noteId}:`, error);
    
    // Update note with error status
    try {
      await supabaseAdmin
        .from('notes')
        .update({ 
          processing_status: 'error',
          processing_error: error.message
        })
        .eq('id', noteId);
    } catch (updateError) {
      console.error('Failed to update note with error status:', updateError);
    }
    
    // Add error notification
    try {
      await supabaseAdmin
        .from('notifications')
        .insert({
          user_id: userId,
          type: 'note_processing_error',
          content: {
            noteId: noteId,
            title: noteData.title || 'New Note', // Keep original title for error notification
            message: 'There was an error processing your note.'
          },
          read: false,
          created_at: new Date().toISOString()
        });
    } catch (notificationError) {
      console.error('Failed to create error notification:', notificationError);
    }
  } finally {
    // Clean up
    if (sftpClient) {
      await sftpService.disconnect(sftpClient);
    }
    
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (cleanupError) {
      console.error('Error cleaning up temp directory:', cleanupError);
    }
  } // Close finally block
} // Close processNoteInBackground function

async function transcribeAudio(filePath, aiSettings) {
  try {
    console.log(`Transcribing audio file: ${filePath}`);
    
    // Initialize the Groq client with API key from environment variables
    const groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });
    
    console.log('Using Groq API for transcription with whisper-large-v3');
    
    // Create a readable stream from the file using standard fs module (not fs/promises)
    const fileStream = fsStandard.createReadStream(filePath);
    
    // Call Groq API for transcription
    const transcription = await groq.audio.transcriptions.create({
      file: fileStream,
      model: "whisper-large-v3",
      // Detect language automatically, or use a specific language if provided in settings
      language: aiSettings?.language || "pl"
    });
    
    console.log('Transcription completed successfully');
    return transcription.text || '';
  } catch (error) {
    console.error('Error transcribing audio with Groq API:', error);
    return `[Transcription Error: ${error.message}]`;
  }
}

// Helper function to generate note title using Groq API
async function generateNoteTitle(content, language) {
if (!content || !content.trim()) {
  console.log('Skipping title generation: No content provided.');
  return null;
}

try {
  console.log(`Generating title with Groq for language: ${language}`);
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  const languageNames = {
    'en': 'English',
    'pl': 'Polish',
    'it': 'Italian',
    'de': 'German'
  };
  const targetLanguage = languageNames[language] || 'English';

  const chatCompletion = await groq.chat.completions.create({
    messages: [
      {
        role: "system",
        content: `You are Titles Creator. The user sends you a note content. As a response return ONLY (no replies, no comments) one short (up to 6 words) title in the **${targetLanguage}** language for the note.`
      },
      {
        role: "user",
        content: content
      }
    ],
    model: "meta-llama/llama-4-maverick-17b-128e-instruct", // Using a standard Groq model suitable for this
    temperature: 0.7, // Adjusted for title generation
    max_tokens: 30, // Limit tokens for a short title
    top_p: 1,
    stream: false, // Get the full response at once
    stop: null
  });

  const title = chatCompletion.choices[0]?.message?.content?.trim() || null;
  console.log(`Groq generated title: ${title}`);
  // Basic filter for potentially empty or placeholder responses
  if (title && title.toLowerCase() !== 'null' && title.length > 1) {
      // Remove potential markdown like surrounding asterisks
      return title.replace(/^\*+|\*+$/g, '').trim();
  }
  return null;

} catch (error) {
  console.error('Error generating title with Groq API:', error);
  return null; // Return null on error
}
}

// Helper function to generate note excerpt using Groq API
async function generateNoteExcerpt(content, language) {
if (!content || !content.trim()) {
  console.log('Skipping excerpt generation: No content provided.');
  return null;
}

try {
  console.log(`Generating excerpt with Groq for language: ${language}`);
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  const languageNames = {
    'en': 'English',
    'pl': 'Polish',
    'it': 'Italian',
    'de': 'German'
  };
  const targetLanguage = languageNames[language] || 'English';

  const chatCompletion = await groq.chat.completions.create({
    messages: [
      {
        role: "system",
        content: `You are Descriptions Creator. The user sends you a note content. As a response return ONLY (no replies, no comments) one short (up to 40 words) description in the **${targetLanguage}** language of what the note is about.`
      },
      {
        role: "user",
        content: content
      }
    ],
    model: "meta-llama/llama-4-maverick-17b-128e-instruct", // Using a standard Groq model suitable for this
    temperature: 0.8, // Slightly higher for descriptive text
    max_tokens: 200, // Limit tokens for a short excerpt
    top_p: 1,
    stream: false, // Get the full response at once
    stop: null
  });

  const excerpt = chatCompletion.choices[0]?.message?.content?.trim() || null;
  console.log(`Groq generated excerpt: ${excerpt}`);
   // Basic filter for potentially empty or placeholder responses
  if (excerpt && excerpt.toLowerCase() !== 'null' && excerpt.length > 1) {
      return excerpt;
  }
  return null;

} catch (error) {
  console.error('Error generating excerpt with Groq API:', error);
  return null; // Return null on error
}
}

// Helper function to validate and format model IDs according to OpenRouter standards
function validateModelId(modelId) {
  if (!modelId) return null;
  
  // If model ID already contains a provider prefix (contains '/'), return as is
  if (modelId.includes('/')) {
    return modelId;
  }
  
  // For model IDs without provider, assume OpenAI as default provider
  // This handles legacy model IDs that might be stored without provider prefix
  return `openai/${modelId}`;
}

async function processWithLLM(transcriptions, additionalText, fileContents, images, aiSettings, token) {
  try {
    console.log('Processing content with LLM');
    
    // Format the user message according to the specified schema
    let formattedMessage = '';
    
    // 1. Add voice recording transcriptions with proper numbering
    if (transcriptions && transcriptions.length > 0) {
      transcriptions.forEach(transcript => {
        formattedMessage += `\n<voice_recording_transcription_part_${transcript.index}>\n${transcript.content}\n</voice_recording_transcription_part_${transcript.index}>\n\n`;
      });
    }
    
    // 2. Add manual text if available
    if (additionalText && additionalText.trim()) {
      formattedMessage += `\n<added_text>\n${additionalText}\n</added_text>\n\n`;
    }
    
    // 3. Add file attachments with proper numbering
    if (fileContents && fileContents.length > 0) {
      fileContents.forEach(file => {
        formattedMessage += `\n<attachment_${file.index}>\n${file.content}\n</attachment_${file.index}>\n\n`;
      });
    }
    
    // Trim any extra whitespace
    formattedMessage = formattedMessage.trim();
    
    // Check if we have the required API key
    if (!aiSettings.apiKey && !process.env.OPENROUTER_API_KEY) {
      throw new Error('No OpenRouter API key provided in settings or environment variables');
    }
    
    // Format system prompt based on language preference
    let systemPrompt = aiSettings.systemPrompt || 'You are a helpful assistant that organizes and summarizes notes.';
    const language = aiSettings.language || 'en';
    
    // Add language instruction to system prompt if not already included
    if (!systemPrompt.toLowerCase().includes('language') && !systemPrompt.toLowerCase().includes(language)) {
      const languageNames = {
        'en': 'English',
        'pl': 'Polish',
        'it': 'Italian',
        'de': 'German'
      };
      systemPrompt += `\n\nCrucially, since the user has selected **${languageNames[language] || 'English'}** as their preferred language, you MUST always generate your responses in ${languageNames[language] || 'English'} *regardless* of the language of provided instructions and of the source materials.`;
    }
    
    // Prepare the messages array
    const messages = [
      {
        role: 'system',
        content: systemPrompt
      }
    ];
    
    // Create the user message content
    // If there are images to include, we need to use a content array instead of a string
    if (images && images.length > 0 && images.some(img => img.includeInContext)) {
      const userMessageContent = [];
      
      // Add text content if available
      if (formattedMessage) {
        userMessageContent.push({
          type: 'text',
          text: formattedMessage
        });
      }
      
      // Add images with includeInContext flag set to true
      images.forEach(image => {
        if (image.includeInContext) {
          // Construct the full URL to the image using the attachment API with token authentication
          // This ensures the OpenRouter API can access the image directly from SFTP storage
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://fancynote.up.railway.app';
          const imageUrl = `${baseUrl}/api/notes/attachment/${image.path}?token=${token}`;
          
          userMessageContent.push({
            type: 'image_url',
            image_url: {
              url: imageUrl
            }
          });
        }
      });
      
      // Add the user message with content array
      messages.push({
        role: 'user',
        content: userMessageContent
      });
    } else {
      // No images, just add the text content
      messages.push({
        role: 'user',
        content: formattedMessage || 'Please analyze this note.'
      });
    }
    
    // Define models with fallbacks
    const primaryModel = validateModelId(aiSettings.model) || 'google/gemini-2.5-pro-exp-03-25:free'; // Use logged model as default
    const fallbackModels = [
      'google/gemini-2.0-flash-thinking-exp:free',
      'google/gemini-2.0-flash-lite-001'
    ];
    const modelsToTry = [primaryModel, ...fallbackModels];

    let lastError = null;

    for (const model of modelsToTry) {
      // Prepare the request payload for the current model
      const payload = {
        model: model,
        messages: messages,
        temperature: 0.7,
        max_tokens: 4000,
        top_p: 0.9
      };

      console.log(`Attempting LLM processing with model: ${model}`);
      // Log the full payload for debugging purposes
      // console.log('OpenRouter API Payload:', JSON.stringify(payload, null, 2)); // Keep commented unless debugging needed

      try {
        // Call OpenRouter API
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
          // More robust response handling
          if (data.choices && data.choices.length > 0 && data.choices[0]?.message?.content) {
            console.log(`Successfully processed with model: ${model}`);
            return data.choices[0].message.content; // Success! Return the content.
          } else {
            // Log the problematic response data for debugging
            console.error(`OpenRouter API response missing choices or content for model ${model}:`, JSON.stringify(data, null, 2));
            lastError = new Error(`Invalid response format from LLM API (model: ${model}): Missing or empty choices/content`);
            // Continue to next model if format is invalid, might be a temporary model issue
            continue;
          }
        } else {
          // Handle specific errors
          const errorData = await response.json().catch(() => ({ error: { message: response.statusText } }));
          console.error(`OpenRouter API error (model: ${model}, status: ${response.status}):`, errorData);
          lastError = new Error(`LLM API error (model: ${model}): ${errorData.error?.message || response.statusText}`);

          // If it's a quota error (429), try the next model
          if (response.status === 429) {
            console.warn(`Quota exceeded for model ${model}. Trying next model...`);
            continue; // Go to the next iteration of the loop
          } else {
            // For other errors, stop trying and throw
            throw lastError;
          }
        }
      } catch (fetchError) {
        // Catch network errors or errors during fetch/json parsing
        console.error(`Fetch error during LLM processing (model: ${model}):`, fetchError);
        lastError = fetchError; // Store the error
        // Decide if we should retry or fail immediately. For now, let's retry on general fetch errors.
        // If it was the last model, the loop will end and the error will be thrown below.
        continue;
      }
    } // End of model loop

    // If the loop finished without returning, all models failed.
    console.error('All LLM models failed.', lastError);
    throw lastError || new Error('All LLM models failed to process the request.');

  } catch (error) {
    // Catch errors from outside the loop (e.g., initial setup errors) or re-thrown errors
    console.error('Error processing with LLM:', error);
    // Return a user-friendly error message embedded in the text field
    return `[LLM Processing Error: ${error.message}]\n\nOriginal content was formatted according to the specified schema.`;
  }
}