// src/app/api/notes/delete-batch/route.js
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { posix as posixPath } from 'path';
import { sftpService } from '@/lib/sftp-service';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  console.log("[API delete-batch] Received request.");
  // Initialize Supabase clients
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
  const supabaseAuth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  console.log("[API delete-batch] Supabase clients initialized.");

  // --- Token Authentication ---
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.split('Bearer ')[1];
  if (!token) {
    console.error("[API delete-batch] Unauthorized: Missing token");
    return NextResponse.json({ error: 'Unauthorized: Missing token' }, { status: 401 });
  }
  console.log("[API delete-batch] Authenticating token...");
  const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(token);
  if (userError || !user) {
    console.error("[API delete-batch] Authentication failed:", userError);
    return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
  }
  const userId = user.id;
  console.log(`[API delete-batch] Authenticated user: ${userId}`);
  // --- End Token Authentication ---

  let sftpClient;
  const sftpErrors = []; // To collect errors during file deletion
  let noteIdsToDelete = []; // Store validated note IDs

  try {
    console.log("[API delete-batch] Parsing request body...");
    const { noteIds } = await request.json();
    console.log(`[API delete-batch] Received noteIds:`, noteIds);

    if (!Array.isArray(noteIds) || noteIds.length === 0) {
      console.error("[API delete-batch] Missing or invalid noteIds array in request.");
      return NextResponse.json({ error: 'Missing or invalid required parameter: noteIds (must be a non-empty array)' }, { status: 400 });
    }

    console.log(`[API delete-batch] Attempting to delete ${noteIds.length} notes and associated files for user ${userId}`);

    // 1. Fetch note details (including file paths) for all specified notes using Admin client
    console.log(`[API delete-batch] Fetching note data for noteIds:`, noteIds);
    const { data: notesData, error: fetchError } = await supabaseAdmin
      .from('notes')
      .select('id, files, images, voice') // Select ID and attachment arrays
      .in('id', noteIds) // Use 'in' filter for multiple IDs
      .eq('user_id', userId); // Verify ownership for all notes

    console.log(`[API delete-batch] Fetched ${notesData?.length || 0} notes for user ${userId}. Fetch error:`, fetchError);

    if (fetchError) {
      console.error(`[API delete-batch] Error fetching notes for deletion:`, fetchError);
      throw new Error('[API delete-batch] Failed to retrieve note data before deletion.');
    }

    if (!notesData || notesData.length === 0) {
        console.warn(`[API delete-batch] No matching notes found for the provided IDs owned by user ${userId}.`);
        // Return a specific message indicating nothing was found/deleted
        return NextResponse.json({ message: 'No matching notes found to delete for the current user.' }, { status: 200 }); // Or 404 if preferred
    }

    // Aggregate all attachment paths and collect valid note IDs to delete
    const allAttachmentPaths = [];
    noteIdsToDelete = notesData.map(note => {
        allAttachmentPaths.push(
            ...(note.files || []).map(f => f.path),
            ...(note.images || []).map(i => i.path),
            ...(note.voice || []).map(v => v.path)
        );
        return note.id; // Collect the ID of notes confirmed to belong to the user
    });
    const uniqueAttachmentPaths = [...new Set(allAttachmentPaths.flat().filter(Boolean))]; // Flatten, filter nulls, get unique

    console.log(`[API delete-batch] Found ${noteIdsToDelete.length} valid notes to delete.`);
    console.log(`[API delete-batch] Combined unique attachment paths:`, uniqueAttachmentPaths);

    // 2. Delete files from SFTP
    if (uniqueAttachmentPaths.length > 0) {
      const sftpBasePath = process.env.SFTP_BASE_PATH;
      console.log(`[API delete-batch] SFTP_BASE_PATH: ${sftpBasePath}`);
      if (!sftpBasePath) {
        console.error("[API delete-batch] SFTP_BASE_PATH environment variable is not set.");
        throw new Error('[API delete-batch] SFTP_BASE_PATH environment variable is not set.');
      }

      try {
        console.log("[API delete-batch] SFTP: Attempting connection...");
        sftpClient = await sftpService.connect();
        console.log(`[API delete-batch] SFTP: Connected. Deleting ${uniqueAttachmentPaths.length} unique files...`);

        for (const attachmentPath of uniqueAttachmentPaths) {
          // Basic security check: Ensure path belongs to the user
          if (!attachmentPath.startsWith(userId + '/')) {
              console.warn(`[API delete-batch] SFTP: Skipping deletion of potential invalid path: ${attachmentPath} for user ${userId}`);
              sftpErrors.push(`Skipped potentially invalid path: ${attachmentPath}`);
              continue; // Skip this file
          }

          const fullSftpPath = posixPath.join(sftpBasePath, attachmentPath);
          try {
            console.log(`[API delete-batch] SFTP: Attempting to delete ${fullSftpPath}`);
            await sftpClient.delete(fullSftpPath);
            console.log(`[API delete-batch] SFTP: Successfully deleted ${fullSftpPath}`);
          } catch (sftpError) {
            if (sftpError.code === 'ENOENT') {
              console.warn(`[API delete-batch] SFTP: File not found during delete (ignoring): ${fullSftpPath}`);
            } else {
              console.error(`[API delete-batch] SFTP: Error deleting ${fullSftpPath}:`, sftpError);
              sftpErrors.push(`Failed to delete ${attachmentPath}: ${sftpError.message}`);
            }
          }
        }
        console.log(`[API delete-batch] SFTP: Finished deleting files. Errors encountered: ${sftpErrors.length}`);
      } catch (connectError) {
          console.error("[API delete-batch] SFTP: Failed to connect:", connectError);
          throw new Error(`[API delete-batch] SFTP Connection failed: ${connectError.message}`);
      } finally {
        if (sftpClient) {
          await sftpService.disconnect(sftpClient);
          sftpClient = null;
          console.log("[API delete-batch] SFTP: Disconnected.");
        }
      }
    } else {
        console.log(`[API delete-batch] No attachments found for the selected notes to delete from SFTP.`);
    }

    // 3. Delete the note records from Supabase
    console.log(`[API delete-batch] Supabase: Attempting to delete ${noteIdsToDelete.length} note records:`, noteIdsToDelete);
    const { error: deleteError } = await supabaseAdmin
      .from('notes')
      .delete()
      .in('id', noteIdsToDelete) // Use 'in' filter
      .eq('user_id', userId); // Final ownership check

    if (deleteError) {
      console.error(`[API delete-batch] Supabase: Error deleting note records:`, deleteError);
      const errorMessage = `Failed to delete note records from database: ${deleteError.message}`;
      const status = 500;
      return NextResponse.json({
          error: errorMessage,
          sftpErrors: sftpErrors.length > 0 ? sftpErrors : undefined,
       }, { status });
    }

    console.log(`[API delete-batch] Supabase: Successfully deleted ${noteIdsToDelete.length} note records.`);

    // Return success
    const responsePayload = {
        message: `Successfully deleted ${noteIdsToDelete.length} notes and associated files.`,
        deletedNoteIds: noteIdsToDelete,
        sftpErrors: sftpErrors.length > 0 ? sftpErrors : undefined,
    };
    console.log("[API delete-batch] Returning success response:", responsePayload);
    return NextResponse.json(responsePayload);

  } catch (error) {
    const requestBodyForError = request.body ? JSON.stringify(request.body) : 'N/A';
    console.error(`[API delete-batch] Error in endpoint. Input noteIds (if available): ${requestBodyForError}`, error);
    // Ensure SFTP client is closed
    if (sftpClient) {
      try { await sftpService.disconnect(sftpClient); } catch (e) { console.error("[API delete-batch] SFTP: Error during emergency disconnect:", e); }
    }
    const errorResponsePayload = {
        error: error.message || 'An unexpected error occurred during batch note deletion.',
        sftpErrors: sftpErrors.length > 0 ? sftpErrors : undefined,
    };
    console.error("[API delete-batch] Returning error response:", errorResponsePayload);
    return NextResponse.json(errorResponsePayload, { status: 500 });
  }
}