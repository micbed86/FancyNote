import { NextResponse } from 'next/server';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { Client } from 'basic-ftp';
import { v4 as uuidv4 } from 'uuid'; // For generating unique filenames

// Helper function to connect and ensure directories exist
async function connectAndPrepareFtp(ftpConfig, userId) {
  const client = new Client();
  // client.ftp.verbose = true; // Enable for debugging

  try {
    if (!ftpConfig || !ftpConfig.host || !ftpConfig.user || !ftpConfig.password) {
      throw new Error('Incomplete FTP configuration in profile.');
    }

    await client.access({
      host: ftpConfig.host,
      user: ftpConfig.user,
      password: ftpConfig.password,
      port: ftpConfig.port || 21,
      secure: false, // Plain FTP
    });
    console.log(`FTP connected for user ${userId}`);

    // Determine base path
    let basePath = ftpConfig.remote_path || `/mindpen_data/${userId}`;
    // Ensure base path ends with a slash
    if (!basePath.endsWith('/')) {
        basePath += '/';
    }

    console.log(`Ensuring base path: ${basePath}`);
    await client.ensureDir(basePath); // Create base path if it doesn't exist

    // Ensure subdirectories exist
    const subDirs = ['files', 'images', 'voice'];
    for (const dir of subDirs) {
      const fullDirPath = basePath + dir;
      console.log(`Ensuring sub directory: ${fullDirPath}`);
      await client.ensureDir(fullDirPath);
    }

    console.log('FTP directories prepared.');
    return { client, basePath }; // Return connected client and base path

  } catch (error) {
    console.error(`FTP connection or directory preparation failed for user ${userId}:`, error);
    // Close client if connection was partially successful but failed later
    if (!client.closed) {
      await client.close();
    }
    throw new Error(`FTP Error: ${error.message}`); // Re-throw for the main handler
  }
}


export async function POST(request) {
  const supabase = createServerComponentClient({ cookies });
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  let ftpClient; // To hold the FTP client instance for cleanup

  try {
    // 1. Fetch User's FTP Settings
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('ftp_settings')
      .eq('id', userId)
      .single();

    if (profileError || !profile || !profile.ftp_settings) {
      console.error('Error fetching profile or FTP settings:', profileError);
      return NextResponse.json({ error: 'FTP settings not configured or profile not found.' }, { status: 400 });
    }

    // TODO: Need a way to get the FTP password securely.
    // For now, assuming it might be temporarily passed or needs another mechanism.
    // THIS IS A PLACEHOLDER AND INSECURE if password isn't handled properly.
    // Maybe the password needs to be fetched from a secure store or re-entered?
    // Let's assume for now it's part of ftp_settings for the sake of structure,
    // but highlight this is a major security gap to be addressed.
    const ftpConfig = profile.ftp_settings;
    if (!ftpConfig.password) {
        // In a real app, you'd likely prompt the user or use a secure vault.
        // Forcing a password check here.
         return NextResponse.json({ error: 'FTP password missing in configuration for processing.' }, { status: 400 });
    }


    // 2. Connect to FTP and Prepare Directories
    const { client, basePath } = await connectAndPrepareFtp(ftpConfig, userId);
    ftpClient = client; // Assign to outer scope for finally block

    // 3. Parse FormData
    const formData = await request.formData();
    const manualText = formData.get('manualText') || '';
    const audioBlob = formData.get('audioBlob'); // Assuming blob is sent with this key
    const attachments = formData.getAll('attachments'); // Assuming files are sent with this key
    const attachmentContextFlags = JSON.parse(formData.get('attachmentContextFlags') || '[]'); // Need to send context flags

    console.log('Received manualText:', !!manualText);
    console.log('Received audioBlob:', !!audioBlob);
    console.log('Received attachments count:', attachments.length);
    console.log('Received context flags:', attachmentContextFlags);


    // 4. Process and Upload Files/Audio
    const uploadedFiles = { files: [], images: [], voice: [] };

    // Upload Audio
    if (audioBlob && audioBlob.size > 0) {
        const uniqueAudioName = `${uuidv4()}.webm`; // Assuming webm format
        const remoteAudioPath = `${basePath}voice/${uniqueAudioName}`;
        const audioBuffer = Buffer.from(await audioBlob.arrayBuffer()); // Convert blob to buffer

        console.log(`Uploading audio to: ${remoteAudioPath}`);
        await ftpClient.uploadFrom(audioBuffer, remoteAudioPath);
        console.log('Audio uploaded successfully.');

        // Construct URL (adjust protocol/format as needed)
        const audioUrl = `ftp://${ftpConfig.host}${remoteAudioPath}`; // Simplistic URL construction
        uploadedFiles.voice.push({ url: audioUrl, name: 'recording.webm', size: audioBlob.size }); // Add duration later?
    }

    // Upload Attachments
    for (let i = 0; i < attachments.length; i++) {
        const file = attachments[i];
        const includeInContext = attachmentContextFlags[i] !== undefined ? attachmentContextFlags[i] : true; // Default to true if flag missing

        if (file && file.size > 0) {
            const uniqueFileName = `${uuidv4()}_${file.name}`;
            const fileBuffer = Buffer.from(await file.arrayBuffer());
            let targetDir = 'files';
            let urlList = uploadedFiles.files;

            if (file.type.startsWith('image/')) {
                targetDir = 'images';
                urlList = uploadedFiles.images;
            }
            // Add more checks? e.g., audio types to voice?

            const remoteFilePath = `${basePath}${targetDir}/${uniqueFileName}`;
            console.log(`Uploading ${targetDir} file to: ${remoteFilePath}`);
            await ftpClient.uploadFrom(fileBuffer, remoteFilePath);
            console.log('File uploaded successfully.');

            const fileUrl = `ftp://${ftpConfig.host}${remoteFilePath}`;
            urlList.push({ url: fileUrl, name: file.name, size: file.size, includeInContext });
        }
    }

    // 5. Prepare Note Data for Supabase
    const noteData = {
      user_id: userId,
      text: manualText,
      files: uploadedFiles.files,
      images: uploadedFiles.images,
      voice: uploadedFiles.voice,
      // transcripts: '', // To be added later
      // title: '', // To be added later or generated
      // summary: '', // To be added later
      // raw_llm_response: {}, // To be added later
    };

    // 6. Save Note to Supabase
    console.log('Saving note data to Supabase:', noteData);
    const { data: newNote, error: insertError } = await supabase
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
    return NextResponse.json({ message: 'Note processed successfully!', noteId: newNote.id });

  } catch (error) {
    console.error('Error processing note:', error);
    return NextResponse.json({ error: error.message || 'An unexpected error occurred during note processing.' }, { status: 500 });
  } finally {
    // Ensure FTP client is closed
    if (ftpClient && !ftpClient.closed) {
      console.log('Closing FTP connection in finally block.');
      await ftpClient.close();
    }
  }
}