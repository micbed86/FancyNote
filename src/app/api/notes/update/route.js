import { NextResponse } from 'next/server';
// Removed createServerClient and cookies imports
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import path, { posix as posixPath } from 'path'; // Import path and posix version
import { sftpService } from '@/lib/sftp-service'; // Import SFTP service

export async function POST(request) {
    console.log("[API Update] Received request at /api/notes/update");

    // --- Instantiate Clients ---
    // Client for Auth validation (using anon key)
    const supabaseAuth = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        { auth: { persistSession: false } }
    );
    // Admin Client for DB/Storage operations (using service role key)
    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false } }
    );
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        console.error("[API Update] FATAL: SUPABASE_SERVICE_ROLE_KEY environment variable is missing!");
        return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 });
    }
    // --- End Clients ---
let sftpClient; // Define SFTP client variable for cleanup

try {
    // --- SFTP Base Path Check ---
    const sftpBasePath = process.env.SFTP_BASE_PATH;
    if (!sftpBasePath) {
        console.error('[API Update] SFTP_BASE_PATH environment variable is not set.');
        return NextResponse.json({ error: 'Server SFTP configuration error.' }, { status: 500 });
    }
    // --- End SFTP Base Path Check ---

    // --- Connect to SFTP ---
    console.log('[API Update] Connecting to SFTP...');
    sftpClient = await sftpService.connect();
    console.log('[API Update] SFTP Connected.');
    // --- End Connect to SFTP ---
    // Remove unnecessary inner try block
        // --- Token Authentication (like /process route) ---
        const authHeader = request.headers.get('Authorization');
        const token = authHeader?.split('Bearer ')[1];

        if (!token) {
            console.log('[API Update] No auth token provided');
            return NextResponse.json({ error: 'Unauthorized: Missing token' }, { status: 401 });
        }

        // Validate token using the auth client instance
        const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(token);

        if (userError || !user) {
            console.error('[API Update] Token validation error:', userError);
            return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
        }
        // --- End Token Authentication ---

        const formData = await request.formData();
        const noteId = formData.get('noteId');
        const newText = formData.get('text'); // May be null if only attachments changed

        if (!noteId) {
            return NextResponse.json({ error: 'Note ID is required.' }, { status: 400 });
        }

        console.log(`[API Update] Processing update for note ID: ${noteId}, User ID: ${user.id}`);

        // Redundant block removed in previous step, ensure this area is clean.
        // --- Fetch current note data using ADMIN client (as before) ---
        // We've already verified the user owns the token, now fetch the note bypassing RLS
        // to ensure we find it if it exists, regardless of RLS issues with the user-context client.
        // We still include user_id in the query as a safeguard.
        console.log(`[API Update] Attempting to fetch note with id=${noteId} and user_id=${user.id} using ADMIN client`);
        const { data: currentNote, error: fetchError } = await supabaseAdmin
            .from('notes')
            .select('files, images, text') // Select fields to update/append to
            .eq('id', noteId)
            .eq('user_id', user.id) // Keep user_id check for safety
            .single();

        if (fetchError) {
             console.error(`[API Update] ADMIN Error fetching note (id=${noteId}, user_id=${user.id}):`, JSON.stringify(fetchError, null, 2));
            if (fetchError.code === 'PGRST116') { // Note not found even with admin client (and matching user_id)
                 console.error(`[API Update] ADMIN Fetch failed - Note truly not found or user_id mismatch.`);
                 // Return the same user-facing error, but log indicates it wasn't RLS this time.
                return NextResponse.json({ error: 'Note not found or access denied.' }, { status: 404 });
            }
            console.error("[API Update] Unexpected error fetching current note:", fetchError);
            throw fetchError; // Throw other errors
        }

        const updates = {};
        let newFilesMetadata = currentNote.files || [];
        let newImagesMetadata = currentNote.images || [];
        let textUpdated = false;

        // --- Handle Text Update ---
        // Check if 'text' field exists in FormData and is different from current
        if (formData.has('text') && newText !== currentNote.text) {
            updates.text = newText;
            textUpdated = true;
            console.log("Text content will be updated.");
        }

        // --- Handle File Uploads ---
        const attachmentEntries = Array.from(formData.entries()).filter(([key]) => key.startsWith('attachment_'));
        console.log(`Found ${attachmentEntries.length} potential new attachments.`);

        for (const [key, file] of attachmentEntries) {
            if (file instanceof File) {
                // Remove old Supabase Storage path generation
                // --- SFTP Upload Logic ---
                const safeFileName = file.name.replace(/[/\\]/g, '_'); // Sanitize filename
                const uniqueFileName = `${uuidv4()}_${safeFileName}`;
                const fileBuffer = Buffer.from(await file.arrayBuffer());

                let targetDir = 'files'; // Default SFTP subdirectory
                if (file.type.startsWith('image/')) {
                    targetDir = 'images';
                }

                // Construct the relative path for DB storage and the full remote path for SFTP
                // Using userId/noteId/targetDir/uniqueFileName structure
                const relativeFilePath = posixPath.join(user.id, noteId, targetDir, uniqueFileName);
                const remoteFilePath = posixPath.join(sftpBasePath, relativeFilePath);

                console.log(`[API Update] Uploading ${targetDir} file via SFTP to: ${remoteFilePath}`);
                await sftpService.uploadFile(sftpClient, fileBuffer, remoteFilePath);
                console.log(`[API Update] SFTP File ${file.name} uploaded successfully.`);
                // --- End SFTP Upload Logic ---

                // The variable 'relativeFilePath' holds the correct path for metadata.
                // Assign it to a consistent variable name used in metadata creation.
                const sftpRelativePath = relativeFilePath;
                // Determine if it's an image or a general file based on MIME type
                const isImage = file.type.startsWith('image/');
                const metadata = {
                    name: file.name,
                    path: sftpRelativePath, // Use the relative SFTP path for metadata
                    size: file.size,
                    type: file.type,
                    // Add created_at or other relevant metadata if needed
                };

                if (isImage) {
                    newImagesMetadata.push(metadata);
                } else {
                    newFilesMetadata.push(metadata);
                }
            }
        }

        // Add updated file/image arrays to the updates object if they changed
        if (newFilesMetadata.length > (currentNote.files?.length || 0)) {
            updates.files = newFilesMetadata;
            console.log("Files array will be updated.");
        }
        if (newImagesMetadata.length > (currentNote.images?.length || 0)) {
            updates.images = newImagesMetadata;
             console.log("Images array will be updated.");
        }

        // --- Perform Database Update ---
        if (Object.keys(updates).length > 0) {
            console.log("Applying updates to the database:", updates);
            // Use the ADMIN client to perform the update, bypassing RLS
            // We already confirmed the user owns the note via the initial fetch check
            const { data: updatedNoteData, error: updateError } = await supabaseAdmin
                .from('notes')
                .update(updates)
                .eq('id', noteId)
                .eq('user_id', user.id) // Keep user_id check for safety
                .select('*') // Select the updated note data to return
                .single();

            if (updateError) {
                console.error("Error updating note in database:", updateError);
                throw updateError;
            }

            console.log("Note updated successfully in database.");
            // Return the updated note data
            return NextResponse.json({ message: 'Note updated successfully.', updatedNote: updatedNoteData }, { status: 200 });

        } else {
            console.log("No changes detected to update in the database.");
            // Return the current note data if no DB update was needed, but maybe attachments were processed?
            // Or just a success message indicating no DB change.
             return NextResponse.json({ message: 'No database changes applied.', updatedNote: currentNote }, { status: 200 });
        }

    // Catch block for the main try (starting line 31)
    } catch (error) {
        console.error('[API Update] Error in /api/notes/update:', error);
        const errorMessage = error.message || 'An unexpected error occurred.';
        const status = error.message.includes('Authentication') || error.message.includes('Invalid token') ? 401
                     : error.message.includes('Note not found') ? 404
                     : error.message.includes('SFTP') ? 500
                     : 500;
        return NextResponse.json({ error: `Failed to update note: ${errorMessage}` }, { status });
    // Finally block for the main try (starting line 31)
    } finally {
        // Ensure SFTP client is disconnected regardless of success or failure
        if (sftpClient) {
            console.log('[API Update] Disconnecting SFTP client...');
            await sftpService.disconnect(sftpClient);
        }
    }
}
