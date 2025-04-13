import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import path, { posix as posixPath } from 'path';
import { sftpService } from '@/lib/sftp-service';

export async function POST(request) {
    console.log("[API AddAttachment] Received request");

    // --- Instantiate Clients ---
    const supabaseAuth = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        { auth: { persistSession: false } }
    );
    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false } }
    );
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        console.error("[API AddAttachment] FATAL: SUPABASE_SERVICE_ROLE_KEY missing!");
        return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 });
    }
    // --- End Clients ---

    let sftpClient;

    try {
        // --- SFTP Base Path Check ---
        const sftpBasePath = process.env.SFTP_BASE_PATH;
        if (!sftpBasePath) {
            console.error('[API AddAttachment] SFTP_BASE_PATH missing!');
            return NextResponse.json({ error: 'Server SFTP configuration error.' }, { status: 500 });
        }
        // --- End SFTP Base Path Check ---

        // --- Token Authentication ---
        const authHeader = request.headers.get('Authorization');
        const token = authHeader?.split('Bearer ')[1];
        if (!token) {
            console.log('[API AddAttachment] No auth token provided');
            return NextResponse.json({ error: 'Unauthorized: Missing token' }, { status: 401 });
        }
        const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(token);
        if (userError || !user) {
            console.error('[API AddAttachment] Token validation error:', userError);
            return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
        }
        // --- End Token Authentication ---

        // --- Parse FormData ---
        const formData = await request.formData();
        const noteId = formData.get('noteId');
        const file = formData.get('attachment'); // Expecting a single file named 'attachment'

        if (!noteId) {
            return NextResponse.json({ error: 'Note ID is required.' }, { status: 400 });
        }
        // Check for both File and Blob instances to support different environments
        if ((!file || !(file instanceof Blob) || file.size === 0)) {
             return NextResponse.json({ error: 'Valid attachment file is required.' }, { status: 400 });
        }
        console.log(`[API AddAttachment] Processing for note ID: ${noteId}, User ID: ${user.id}, File: ${file.name}`);
        // --- End Parse FormData ---

        // --- Connect to SFTP ---
        console.log('[API AddAttachment] Connecting to SFTP...');
        sftpClient = await sftpService.connect();
        console.log('[API AddAttachment] SFTP Connected.');
        // --- End Connect to SFTP ---

        // --- Upload File via SFTP ---
        const safeFileName = file.name.replace(/[/\\]/g, '_');
        const uniqueFileName = `${uuidv4()}_${safeFileName}`;
        const fileBuffer = Buffer.from(await file.arrayBuffer());
        let targetDir = file.type.startsWith('image/') ? 'images' : 'files';
        const relativeFilePath = posixPath.join(user.id, noteId, targetDir, uniqueFileName);
        const remoteFilePath = posixPath.join(sftpBasePath, relativeFilePath);

        console.log(`[API AddAttachment] Uploading ${targetDir} file via SFTP to: ${remoteFilePath}`);
        await sftpService.uploadFile(sftpClient, fileBuffer, remoteFilePath);
        console.log(`[API AddAttachment] SFTP File ${file.name} uploaded successfully.`);
        // --- End Upload File via SFTP ---

        // --- Prepare Metadata ---
        const newAttachmentMetadata = {
            name: file.name,
            path: relativeFilePath, // Store relative path
            size: file.size,
            type: file.type,
            // Add created_at or other relevant metadata if needed
            // created_at: new Date().toISOString(),
        };
        // --- End Prepare Metadata ---

        // --- Fetch Current Note & Update ---
        console.log(`[API AddAttachment] Fetching current note data (id=${noteId}) using ADMIN client`);
        const { data: currentNote, error: fetchError } = await supabaseAdmin
            .from('notes')
            .select('files, images') // Only select arrays we need to modify
            .eq('id', noteId)
            .eq('user_id', user.id)
            .single();

        if (fetchError) {
            console.error(`[API AddAttachment] ADMIN Error fetching note:`, JSON.stringify(fetchError, null, 2));
            if (fetchError.code === 'PGRST116') {
                return NextResponse.json({ error: 'Note not found or access denied.' }, { status: 404 });
            }
            throw fetchError; // Throw other errors
        }

        // Prepare the update object
        const updates = {};
        if (targetDir === 'images') {
            updates.images = [...(currentNote.images || []), newAttachmentMetadata];
        } else {
            updates.files = [...(currentNote.files || []), newAttachmentMetadata];
        }

        console.log("[API AddAttachment] Applying updates to the database:", updates);
        const { data: updatedNoteData, error: updateError } = await supabaseAdmin
            .from('notes')
            .update(updates)
            .eq('id', noteId)
            .eq('user_id', user.id)
            .select('files, images') // Select only the updated arrays to return
            .single();

        if (updateError) {
            console.error("[API AddAttachment] Error updating note in database:", updateError);
            throw updateError;
        }

        console.log("[API AddAttachment] Note updated successfully in database.");
        // --- End Fetch Current Note & Update ---

        // --- Return Success Response ---
        // Return the specific metadata added and the updated arrays
        return NextResponse.json({
            message: 'Attachment added successfully.',
            addedAttachment: newAttachmentMetadata,
            updatedNoteArrays: updatedNoteData // Contains updated 'files' and 'images' arrays
        }, { status: 200 });
        // --- End Return Success Response ---

    } catch (error) {
        console.error('[API AddAttachment] Error:', error);
        const errorMessage = error.message || 'An unexpected error occurred.';
        const status = error.message.includes('Authentication') || error.message.includes('Invalid token') ? 401
                     : error.message.includes('Note not found') ? 404
                     : error.message.includes('SFTP') ? 500
                     : 500;
        return NextResponse.json({ error: `Failed to add attachment: ${errorMessage}` }, { status });
    } finally {
        if (sftpClient) {
            console.log('[API AddAttachment] Disconnecting SFTP client...');
            await sftpService.disconnect(sftpClient);
        }
    }
}