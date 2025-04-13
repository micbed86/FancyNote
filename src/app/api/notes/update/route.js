import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';

// Helper function to get Supabase client with user's auth context
async function getSupabaseClient(request) {
    const token = request.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) {
        throw new Error('Authentication token is missing.');
    }

    // Validate token and get user
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
        console.error('Auth error or no user:', userError);
        throw new Error('Invalid token or user not found.');
    }

    // Return the user object along with a Supabase client instance
    // Note: For row-level security, Supabase client usually uses the token implicitly.
    // However, we explicitly validated the user here.
    return { supabase, user };
}

export async function POST(request) {
    console.log("Received request at /api/notes/update");
    let supabaseClient; // Define here to be accessible in finally block if needed

    try {
        const { supabase: client, user } = await getSupabaseClient(request);
        supabaseClient = client; // Assign to outer scope variable

        const formData = await request.formData();
        const noteId = formData.get('noteId');
        const newText = formData.get('text'); // May be null if only attachments changed

        if (!noteId) {
            return NextResponse.json({ error: 'Note ID is required.' }, { status: 400 });
        }

        console.log(`Processing update for note ID: ${noteId}, User ID: ${user.id}`);

        // --- Fetch current note data ---
        const { data: currentNote, error: fetchError } = await supabaseClient
            .from('notes')
            .select('files, images, text') // Select fields to update/append to
            .eq('id', noteId)
            .eq('user_id', user.id)
            .single();

        if (fetchError) {
            if (fetchError.code === 'PGRST116') {
                return NextResponse.json({ error: 'Note not found or access denied.' }, { status: 404 });
            }
            console.error("Error fetching current note:", fetchError);
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
                const fileExtension = file.name.split('.').pop();
                const uniqueFileName = `${uuidv4()}.${fileExtension}`;
                const filePath = `${user.id}/${noteId}/${uniqueFileName}`; // Storage path

                console.log(`Uploading file: ${file.name} to path: ${filePath}`);

                const { data: uploadData, error: uploadError } = await supabaseClient.storage
                    .from('note-attachments') // Ensure this bucket exists and has policies set up
                    .upload(filePath, file);

                if (uploadError) {
                    console.error(`Error uploading file ${file.name}:`, uploadError);
                    // Decide if you want to stop or continue with other uploads
                    // For now, we'll throw to indicate failure
                    throw new Error(`Failed to upload ${file.name}: ${uploadError.message}`);
                }

                console.log(`File ${file.name} uploaded successfully:`, uploadData);

                // Determine if it's an image or a general file based on MIME type
                const isImage = file.type.startsWith('image/');
                const metadata = {
                    name: file.name,
                    path: filePath, // Store the storage path, not the full URL initially
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
            const { data: updatedNoteData, error: updateError } = await supabaseClient
                .from('notes')
                .update(updates)
                .eq('id', noteId)
                .eq('user_id', user.id)
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

    } catch (error) {
        console.error('Error in /api/notes/update:', error);
        // Ensure sensitive details aren't leaked in production
        const errorMessage = error.message || 'An unexpected error occurred.';
        const status = error.message.includes('Authentication') || error.message.includes('Invalid token') ? 401
                     : error.message.includes('Note not found') ? 404
                     : 500;
        return NextResponse.json({ error: `Failed to update note: ${errorMessage}` }, { status });
    }
}