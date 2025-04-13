// src/app/api/notes/delete-note-and-files/route.js
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { posix as posixPath } from 'path';
import { sftpService } from '@/lib/sftp-service';

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
    return NextResponse.json({ error: 'Unauthorized: Missing token' }, { status: 401 });
  }
  const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(token);
  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
  }
  const userId = user.id;
  // --- End Token Authentication ---

  let sftpClient;
  const sftpErrors = []; // To collect errors during file deletion

  try {
    const { noteId } = await request.json();

    if (!noteId) {
      return NextResponse.json({ error: 'Missing required parameter: noteId' }, { status: 400 });
    }

    console.log(`Attempting to delete note ${noteId} and associated files for user ${userId}`);

    // 1. Fetch note details (including file paths) using Admin client
    const { data: noteData, error: fetchError } = await supabaseAdmin
      .from('notes')
      .select('files, images, voice') // Select only attachment arrays
      .eq('id', noteId)
      .eq('user_id', userId) // Verify ownership
      .single();

    if (fetchError) {
      // Handle case where note doesn't exist or user doesn't own it
      if (fetchError.code === 'PGRST116') { // PostgREST code for "Not Found"
         console.warn(`Note ${noteId} not found or user ${userId} does not have permission.`);
         // Decide if this should be an error or if we proceed to delete (in case DB is inconsistent)
         // For now, let's treat it as "nothing to delete" on the DB side, but maybe files exist?
         // Or return a 404? Let's return 404 for clarity.
         return NextResponse.json({ error: 'Note not found or permission denied.' }, { status: 404 });
      }
      console.error(`Error fetching note ${noteId} for deletion:`, fetchError);
      throw new Error('Failed to retrieve note data before deletion.');
    }

    // Combine all attachment paths into a single list
    const allAttachmentPaths = [
      ...(noteData.files || []).map(f => f.path),
      ...(noteData.images || []).map(i => i.path),
      ...(noteData.voice || []).map(v => v.path),
    ].filter(Boolean); // Filter out any null/undefined paths

    // 2. Delete files from SFTP
    if (allAttachmentPaths.length > 0) {
      const sftpBasePath = process.env.SFTP_BASE_PATH;
      if (!sftpBasePath) {
        throw new Error('SFTP_BASE_PATH environment variable is not set.');
      }

      try {
        sftpClient = await sftpService.connect();
        console.log(`SFTP: Connected. Deleting ${allAttachmentPaths.length} files for note ${noteId}...`);

        for (const attachmentPath of allAttachmentPaths) {
          // Basic security check: Ensure path belongs to the user
          if (!attachmentPath.startsWith(userId + '/')) {
              console.warn(`SFTP: Skipping deletion of potential invalid path: ${attachmentPath} for user ${userId}`);
              sftpErrors.push(`Skipped potentially invalid path: ${attachmentPath}`);
              continue; // Skip this file
          }

          const fullSftpPath = posixPath.join(sftpBasePath, attachmentPath);
          try {
            console.log(`SFTP: Deleting ${fullSftpPath}`);
            await sftpClient.delete(fullSftpPath);
            console.log(`SFTP: Deleted ${fullSftpPath}`);
          } catch (sftpError) {
            if (sftpError.code === 'ENOENT') {
              console.warn(`SFTP: File not found during delete (ignoring): ${fullSftpPath}`);
              // Optionally add to sftpErrors if you want to report missing files
            } else {
              console.error(`SFTP: Error deleting ${fullSftpPath}:`, sftpError);
              sftpErrors.push(`Failed to delete ${attachmentPath}: ${sftpError.message}`);
              // Decide if we should stop or continue deleting other files. Let's continue.
            }
          }
        }
      } catch (connectError) {
          console.error("SFTP: Failed to connect:", connectError);
          // If we can't connect, we can't delete files. Should we stop the whole process?
          // Let's stop and report the error.
          throw new Error(`SFTP Connection failed: ${connectError.message}`);
      } finally {
        if (sftpClient) {
          await sftpService.disconnect(sftpClient);
          sftpClient = null;
          console.log("SFTP: Disconnected.");
        }
      }
    } else {
        console.log(`Note ${noteId} has no attachments to delete from SFTP.`);
    }

    // 3. Delete the note record from Supabase
    console.log(`Supabase: Deleting note record ${noteId}`);
    const { error: deleteError } = await supabaseAdmin
      .from('notes')
      .delete()
      .eq('id', noteId)
      .eq('user_id', userId); // Ensure user owns the note one last time

    if (deleteError) {
      console.error(`Supabase: Error deleting note record ${noteId}:`, deleteError);
      // Even if DB delete fails, we might have deleted files. Report SFTP errors if any.
      const errorMessage = `Failed to delete note record from database: ${deleteError.message}`;
      const status = 500;
      return NextResponse.json({
          error: errorMessage,
          sftpErrors: sftpErrors.length > 0 ? sftpErrors : undefined,
       }, { status });
    }

    console.log(`Supabase: Successfully deleted note record ${noteId}`);

    // Return success, potentially including SFTP errors if any occurred but weren't fatal
    return NextResponse.json({
        message: 'Note and associated files deleted successfully.',
        sftpErrors: sftpErrors.length > 0 ? sftpErrors : undefined, // Report non-fatal SFTP issues
    });

  } catch (error) {
    console.error(`Error in delete-note-and-files endpoint for noteId (if available): ${request.body?.noteId}`, error);
    // Ensure SFTP client is closed if an error occurred unexpectedly
    if (sftpClient) {
      try { await sftpService.disconnect(sftpClient); } catch (e) { console.error("SFTP: Error during emergency disconnect:", e); }
    }
    return NextResponse.json({
        error: error.message || 'An unexpected error occurred during note deletion.',
        sftpErrors: sftpErrors.length > 0 ? sftpErrors : undefined,
    }, { status: 500 });
  }
}