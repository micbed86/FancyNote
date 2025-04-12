// src/app/api/notes/delete-attachment/route.js
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers'; // Still needed for client init, even if not used for auth
import path, { posix as posixPath } from 'path';
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

  try {
    const { noteId, attachmentType, attachmentPath } = await request.json();

    // Basic validation
    if (!noteId || !attachmentType || !attachmentPath) {
      return NextResponse.json({ error: 'Missing required parameters (noteId, attachmentType, attachmentPath)' }, { status: 400 });
    }
    if (!['files', 'images', 'voice'].includes(attachmentType)) {
        return NextResponse.json({ error: 'Invalid attachment type' }, { status: 400 });
    }
    // Security: Very basic check to ensure the path seems to belong to the user
    if (!attachmentPath.startsWith(userId + '/')) {
        console.warn(`Potential path mismatch: User ${userId} trying to delete path ${attachmentPath}`);
        return NextResponse.json({ error: 'Invalid attachment path' }, { status: 400 });
    }

    console.log(`Attempting to delete ${attachmentType} attachment: ${attachmentPath} for note ${noteId}`);

    // 1. Delete from SFTP
    const sftpBasePath = process.env.SFTP_BASE_PATH;
    if (!sftpBasePath) {
      throw new Error('SFTP_BASE_PATH environment variable is not set.');
    }
    const fullSftpPath = posixPath.join(sftpBasePath, attachmentPath);

    sftpClient = await sftpService.connect();
    try {
        console.log(`SFTP: Deleting file ${fullSftpPath}`);
        await sftpClient.delete(fullSftpPath);
        console.log(`SFTP: File ${fullSftpPath} deleted successfully.`);
    } catch (sftpError) {
        // Log error but potentially continue if file not found (maybe already deleted?)
        if (sftpError.code === 'ENOENT') {
             console.warn(`SFTP file not found during delete (continuing to DB update): ${fullSftpPath}`);
        } else {
            console.error(`SFTP delete error for ${fullSftpPath}:`, sftpError);
            throw new Error(`Failed to delete file from storage: ${sftpError.message}`);
        }
    } finally {
        await sftpService.disconnect(sftpClient);
        sftpClient = null; // Reset client variable
    }

    // 2. Update Supabase Record (Remove item from JSONB array)
    // Fetch the current array, filter out the item, update the record
    const { data: noteData, error: fetchError } = await supabaseAdmin
      .from('notes')
      .select(attachmentType) // Select only the relevant array column
      .eq('id', noteId)
      .eq('user_id', userId) // Ensure user owns the note (using admin client, but good practice)
      .single();

    if (fetchError) {
      console.error(`Error fetching note ${noteId} for update:`, fetchError);
      throw new Error('Failed to retrieve note data for update.');
    }
    if (!noteData) {
        throw new Error('Note not found for update.');
    }

    const currentItems = noteData[attachmentType] || [];
    const updatedItems = currentItems.filter(item => item.path !== attachmentPath);

    // Check if items actually changed before updating
    if (updatedItems.length === currentItems.length) {
        console.warn(`Attachment path ${attachmentPath} not found in note ${noteId} ${attachmentType} array. No DB update needed.`);
    } else {
        const updatePayload = {};
        updatePayload[attachmentType] = updatedItems; // e.g., { files: updatedItems }

        const { error: updateError } = await supabaseAdmin
          .from('notes')
          .update(updatePayload)
          .eq('id', noteId);

        if (updateError) {
          console.error(`Error updating note ${noteId} in Supabase:`, updateError);
          throw new Error('Failed to update note record after deleting attachment.');
        }
        console.log(`Successfully removed attachment reference from note ${noteId} in Supabase.`);
    }

    return NextResponse.json({ message: 'Attachment deleted successfully.' });

  } catch (error) {
    console.error('Error deleting attachment:', error);
    // Ensure SFTP client is closed if an error occurred before the finally block
    if (sftpClient) {
        await sftpService.disconnect(sftpClient);
    }
    return NextResponse.json({ error: error.message || 'An unexpected error occurred.' }, { status: 500 });
  }
}