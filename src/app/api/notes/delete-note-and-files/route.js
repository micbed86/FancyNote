// src/app/api/notes/delete-note-and-files/route.js
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { posix as posixPath } from 'path';
import { sftpService } from '@/lib/sftp-service';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  console.log("[API delete-note-and-files] Received request.");
  // Initialize Supabase clients
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
  const supabaseAuth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  console.log("[API delete-note-and-files] Supabase clients initialized.");
  // --- Token Authentication ---
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.split('Bearer ')[1];
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized: Missing token' }, { status: 401 });
  }
  console.log("[API delete-note-and-files] Authenticating token...");
  const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(token);
  if (userError || !user) {
    console.error("[API delete-note-and-files] Authentication failed:", userError);
    return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
  }
  const userId = user.id;
  console.log(`[API delete-note-and-files] Authenticated user: ${userId}`);
  // --- End Token Authentication ---

  let sftpClient;
  const sftpErrors = []; // To collect errors during file deletion

  try {
    console.log("[API delete-note-and-files] Parsing request body...");
    const { noteId } = await request.json();
    console.log(`[API delete-note-and-files] Received noteId: ${noteId}`);

    if (!noteId) {
      console.error("[API delete-note-and-files] Missing noteId in request.");
      return NextResponse.json({ error: 'Missing required parameter: noteId' }, { status: 400 });
    }

    console.log(`[API delete-note-and-files] Attempting to delete note ${noteId} and associated files for user ${userId}`);

    // 1. Fetch note details (including file paths) using Admin client
    console.log(`[API delete-note-and-files] Fetching note data for noteId: ${noteId}`);
    const { data: noteData, error: fetchError } = await supabaseAdmin
      .from('notes')
      .select('files, images, voice') // Select only attachment arrays
      .eq('id', noteId)
      .eq('user_id', userId) // Verify ownership
      .single();
    console.log(`[API delete-note-and-files] Fetched note data (or error):`, { noteData, fetchError });

    if (fetchError) {
      // Handle case where note doesn't exist or user doesn't own it
      if (fetchError.code === 'PGRST116') { // PostgREST code for "Not Found"
         console.warn(`[API delete-note-and-files] Note ${noteId} not found or user ${userId} does not have permission.`);
         // Decide if this should be an error or if we proceed to delete (in case DB is inconsistent)
         // For now, let's treat it as "nothing to delete" on the DB side, but maybe files exist?
         // Or return a 404? Let's return 404 for clarity.
         return NextResponse.json({ error: 'Note not found or permission denied.' }, { status: 404 });
      }
      console.error(`[API delete-note-and-files] Error fetching note ${noteId} for deletion:`, fetchError);
      throw new Error('[API delete-note-and-files] Failed to retrieve note data before deletion.');
    }

    // Combine all attachment paths into a single list
    const allAttachmentPaths = [
      ...(noteData.files || []).map(f => f.path),
      ...(noteData.images || []).map(i => i.path),
      ...(noteData.voice || []).map(v => v.path),
    ].filter(Boolean); // Filter out any null/undefined paths
    console.log(`[API delete-note-and-files] Combined attachment paths for note ${noteId}:`, allAttachmentPaths);

    // 2. Delete files from SFTP
    if (allAttachmentPaths.length > 0) {
      const sftpBasePath = process.env.SFTP_BASE_PATH;
      console.log(`[API delete-note-and-files] SFTP_BASE_PATH: ${sftpBasePath}`);
      if (!sftpBasePath) {
        console.error("[API delete-note-and-files] SFTP_BASE_PATH environment variable is not set.");
        throw new Error('[API delete-note-and-files] SFTP_BASE_PATH environment variable is not set.');
      }

      try {
        console.log("[API delete-note-and-files] SFTP: Attempting connection...");
        sftpClient = await sftpService.connect();
        console.log(`[API delete-note-and-files] SFTP: Connected. Deleting ${allAttachmentPaths.length} files for note ${noteId}...`);

        for (const attachmentPath of allAttachmentPaths) {
          // Security Check: Ensure path belongs to the user OR is a backup path for the user
          const isDirectUserPath = attachmentPath.startsWith(userId + '/');
          const isBackupPathForUser = attachmentPath.startsWith(`note_backups/${userId}/`);

          if (!isDirectUserPath && !isBackupPathForUser) {
              console.warn(`[API delete-note-and-files] SFTP: Skipping deletion of potential invalid path: ${attachmentPath} for user ${userId}`);
              sftpErrors.push(`Skipped potentially invalid path: ${attachmentPath}`);
              continue; // Skip this file
          }

          const fullSftpPath = posixPath.join(sftpBasePath, attachmentPath);
          try {
            console.log(`[API delete-note-and-files] SFTP: Attempting to delete ${fullSftpPath}`);
            await sftpClient.delete(fullSftpPath);
            console.log(`[API delete-note-and-files] SFTP: Successfully deleted ${fullSftpPath}`);
          } catch (sftpError) {
            if (sftpError.code === 'ENOENT') {
              console.warn(`[API delete-note-and-files] SFTP: File not found during delete (ignoring): ${fullSftpPath}`);
              // Optionally add to sftpErrors if you want to report missing files
            } else {
              console.error(`[API delete-note-and-files] SFTP: Error deleting ${fullSftpPath}:`, sftpError);
              sftpErrors.push(`Failed to delete ${attachmentPath}: ${sftpError.message}`);
              // Decide if we should stop or continue deleting other files. Let's continue.
            }
          }
        }
        console.log(`[API delete-note-and-files] SFTP: Finished deleting individual files for note ${noteId}. Errors encountered: ${sftpErrors.length}`);

        // --- Attempt to delete the note-specific backup directory ---
        const noteBackupDirPath = posixPath.join(sftpBasePath, 'note_backups', userId, noteId);
        try {
          // Check if the directory exists before attempting to delete
          const dirExists = await sftpClient.exists(noteBackupDirPath);
          if (dirExists === 'd') { // Ensure it's a directory
             console.log(`[API delete-note-and-files] SFTP: Attempting to remove backup directory: ${noteBackupDirPath}`);
             // Use rmdir with recursive option (true)
             await sftpClient.rmdir(noteBackupDirPath, true);
             console.log(`[API delete-note-and-files] SFTP: Successfully removed backup directory: ${noteBackupDirPath}`);
          } else if (dirExists) {
             console.warn(`[API delete-note-and-files] SFTP: Path exists but is not a directory, cannot remove: ${noteBackupDirPath}`);
             sftpErrors.push(`Path exists but is not a directory: ${noteBackupDirPath}`);
          } else {
             console.log(`[API delete-note-and-files] SFTP: Backup directory not found, skipping removal: ${noteBackupDirPath}`);
          }
        } catch (rmdirError) {
          console.error(`[API delete-note-and-files] SFTP: Error removing backup directory ${noteBackupDirPath}:`, rmdirError);
          sftpErrors.push(`Failed to remove backup directory ${noteBackupDirPath}: ${rmdirError.message}`);
        }
        // --- End backup directory deletion ---

      } catch (connectError) {
          console.error("[API delete-note-and-files] SFTP: Failed to connect:", connectError);
          // If we can't connect, we can't delete files. Should we stop the whole process?
          // Let's stop and report the error.
          throw new Error(`[API delete-note-and-files] SFTP Connection failed: ${connectError.message}`);
      } finally {
        if (sftpClient) {
          await sftpService.disconnect(sftpClient);
          sftpClient = null;
          console.log("[API delete-note-and-files] SFTP: Disconnected.");
        }
      }
    } else {
        console.log(`[API delete-note-and-files] Note ${noteId} has no attachments to delete from SFTP.`);
    }

    // 3. Delete the note record from Supabase
    console.log(`[API delete-note-and-files] Supabase: Attempting to delete note record ${noteId}`);
    const { error: deleteError } = await supabaseAdmin
      .from('notes')
      .delete()
      .eq('id', noteId)
      .eq('user_id', userId); // Ensure user owns the note one last time

    if (deleteError) {
      console.error(`[API delete-note-and-files] Supabase: Error deleting note record ${noteId}:`, deleteError);
      // Even if DB delete fails, we might have deleted files. Report SFTP errors if any.
      const errorMessage = `Failed to delete note record from database: ${deleteError.message}`;
      const status = 500;
      return NextResponse.json({
          error: errorMessage,
          sftpErrors: sftpErrors.length > 0 ? sftpErrors : undefined,
       }, { status });
    }

    console.log(`[API delete-note-and-files] Supabase: Successfully deleted note record ${noteId}`);

    // Return success, potentially including SFTP errors if any occurred but weren't fatal
    const responsePayload = {
        message: 'Note and associated files deletion process completed.', // Adjusted message
        sftpErrors: sftpErrors.length > 0 ? sftpErrors : undefined, // Report non-fatal SFTP issues
    };
    console.log("[API delete-note-and-files] Returning success response:", responsePayload);
    return NextResponse.json(responsePayload);

  } catch (error) {
    const requestBodyForError = request.body ? JSON.stringify(request.body) : 'N/A'; // Safely get body for logging
    console.error(`[API delete-note-and-files] Error in endpoint for noteId (if available): ${requestBodyForError}`, error);
    // Ensure SFTP client is closed if an error occurred unexpectedly
    if (sftpClient) {
      try { await sftpService.disconnect(sftpClient); } catch (e) { console.error("[API delete-note-and-files] SFTP: Error during emergency disconnect:", e); }
    }
    const errorResponsePayload = {
        error: error.message || 'An unexpected error occurred during note deletion.',
        sftpErrors: sftpErrors.length > 0 ? sftpErrors : undefined,
    };
    console.error("[API delete-note-and-files] Returning error response:", errorResponsePayload);
    return NextResponse.json(errorResponsePayload, { status: 500 });
  }
}