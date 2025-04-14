'use client';

import { useState, useEffect, use, useCallback, useRef } from 'react'; // Import use, useCallback, useRef
import { useRouter } from 'next/navigation';
import Image from 'next/image'; // Import Next.js Image component
import { supabase } from '@/lib/supabase';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import DashboardLayout from '../../components/DashboardLayout';
import { TrashIcon, EditIcon, MoreIcon, FileIcon, ImageIcon, CameraIcon, SaveIcon, ShareIcon, MicrophoneIcon, PlayIcon, CheckCircle } from '@/lib/icons'; // Added MicrophoneIcon, PlayIcon, Changed CheckIcon to CheckCircle
import './note.css'; // Renamed CSS file

export default function NotePage({ params }) { // Renamed component
  const router = useRouter();
  // Correctly unwrap params using React.use()
  const unwrappedParams = use(params);
  const { id: noteId } = unwrappedParams; // Renamed variable

  const [loading, setLoading] = useState(true);
  const [noteTitle, setNoteTitle] = useState('Loading...');
  const [noteText, setNoteText] = useState(''); // State for text content
  const [noteFiles, setNoteFiles] = useState([]); // State for file attachments
  const [noteImages, setNoteImages] = useState([]); // State for image attachments
  const [noteVoice, setNoteVoice] = useState([]); // State for voice recordings
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [showMenu, setShowMenu] = useState(false); // State for delete menu
  const [error, setError] = useState(null);
  const [authToken, setAuthToken] = useState(null); // State to hold auth token for URLs
  const [isEditingText, setIsEditingText] = useState(false); // State for text editing mode
  const [editedText, setEditedText] = useState(''); // State for the edited text content
  // isSaving and newAttachments states are removed.
  const cameraInputRef = useRef(null); // Ref for the hidden camera input

  useEffect(() => {
    // Define the async function directly inside useEffect
    const checkUserAndFetchNote = async () => {
      setLoading(true);
      setError(null);

      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        console.error('Auth error or no user:', authError);
        router.push('/auth');
        return;
      }
      // Store the token for use in attachment URLs
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || null;
      setAuthToken(token);
      console.log("Auth Token Set:", token ? 'Token available' : 'Token MISSING'); // Log token status
      // Removed extra closing brace that broke the function scope

      if (!noteId) { // Use renamed variable
        console.error('Note ID is missing');
        setError('Note ID is missing.');
        setLoading(false);
        return;
      }

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(noteId)) { // Use renamed variable
        console.error('Invalid Note ID format');
        setError('Invalid Note ID format.');
        setLoading(false);
        return;
      }

      try {
        // TODO: Fetch full note data (title, content, attachments, etc.)
        const { data: noteData, error: fetchError } = await supabase
          .from('notes') // Use 'notes' table
          .select('*') // Fetch all fields for now
          .eq('id', noteId) // Use renamed variable
          .eq('user_id', user.id)
          .single();

        if (fetchError) {
          if (fetchError.code === 'PGRST116') {
             console.error('Note not found or access denied:', fetchError);
             setError('Note not found or you do not have permission to view it.');
           } else {
            throw fetchError;
          }
        }

        if (noteData) {
          setNoteTitle(noteData.title || 'Untitled Note');
          const fetchedText = noteData.text || '';
          setNoteText(fetchedText); // Set text content
          setEditedText(fetchedText); // Initialize edited text state
          setNoteFiles(noteData.files || []); // Set file attachments
          setNoteImages(noteData.images || []); // Set image attachments
          setNoteVoice(noteData.voice || []); // Set voice recordings
        } else if (!fetchError) {
           setError('Note not found.');
        }

      } catch (err) {
        console.error('Error loading note:', err);
        setError(`Failed to load note: ${err.message}`);
      } finally {
        setLoading(false);
      }
    }; // End of checkUserAndFetchNote async function

    checkUserAndFetchNote(); // Call the function

  }, [noteId, router]); // useEffect dependency array remains the same

  // --- Title Editing Handlers ---
  const handleTitleEdit = () => {
    setIsEditingTitle(true);
  };

  const handleTitleSave = async () => {
    setIsEditingTitle(false);
    const trimmedTitle = noteTitle.trim(); // Use renamed state
    if (!trimmedTitle) {
        setNoteTitle('Untitled Note'); // Reset if empty, use renamed state/default
        return; // Or save 'Untitled Item' if preferred
    }

    try {
      const { error } = await supabase
        .from('notes') // Use 'notes' table
        .update({ title: trimmedTitle })
        .eq('id', noteId); // Use renamed variable

      if (error) throw error;
      // Optionally show success message
    } catch (error) {
      console.error('Error updating note title:', error);
      alert(`Failed to update note title: ${error.message}`);
      // Optionally revert title state
    }
  };

  const handleTitleChange = (e) => { // Use renamed state
    setNoteTitle(e.target.value);
  };

  const handleTitleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleTitleSave();
    } else if (e.key === 'Escape') {
      setIsEditingTitle(false);
      // Optionally refetch title to revert changes if needed
    }
  };
  // --- End Title Editing Handlers ---

  // --- Delete Menu Handlers ---
  const toggleMenu = () => {
    setShowMenu(!showMenu);
  };

  const handleDeleteNote = async () => {
    console.log("[handleDeleteNote] Function called."); // Log 1: Function start
    setShowMenu(false); // Close menu
    if (confirm('Are you sure you want to delete this note and all its associated files? This action cannot be undone.')) {
      console.log("[handleDeleteNote] Confirmation received."); // Log 2: Confirmation
      try {
        // Get auth token
        console.log("[handleDeleteNote] Attempting to get session..."); // Log 3: Before session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session) {
          console.error("[handleDeleteNote] Error getting session:", sessionError);
          throw new Error('Could not get user session for authentication.');
        }
        const accessToken = session.access_token;
        console.log("[handleDeleteNote] Session and token obtained."); // Log 4: After session

        const apiUrl = '/api/notes/delete-note-and-files';
        const requestBody = { noteId: noteId };
        const requestOptions = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify(requestBody),
        };
        console.log(`[handleDeleteNote] Calling API: ${apiUrl}`, requestOptions); // Log 5: Before fetch
        const response = await fetch(apiUrl, requestOptions);
        console.log(`[handleDeleteNote] API response received. Status: ${response.status}, OK: ${response.ok}`); // Log 6: After fetch

        const result = await response.json();
        console.log("[handleDeleteNote] API response JSON parsed:", result); // Log 7: After JSON parse

        if (!response.ok) {
          // Include SFTP errors in the alert if they exist
          const errorMessage = result.error || `HTTP error! status: ${response.status}`;
          const sftpErrors = result.sftpErrors ? `\nSFTP Issues:\n- ${result.sftpErrors.join('\n- ')}` : '';
          throw new Error(`${errorMessage}${sftpErrors}`);
        }

        console.log('Note and files deleted successfully via API:', result.message);
        if (result.sftpErrors) {
            console.warn('SFTP issues encountered during deletion:', result.sftpErrors);
            // Optionally inform the user about non-fatal SFTP issues here
            alert(`Note deleted, but some files might not have been removed from storage. Please check manually if needed. Issues:\n- ${result.sftpErrors.join('\n- ')}`);
        }

        router.push('/notes'); // Redirect after successful deletion

      } catch (error) {
        console.error('[handleDeleteNote] Error caught:', error); // Log 8: Catch block
        alert(`Failed to delete note: ${error.message}`);
      }
    }
  };
  // --- End Delete Menu Handlers ---

  // --- Attachment Deletion Handler ---
  const handleDeleteAttachment = async (type, index) => {
    // type: 'files', 'images', or 'voice'
    // index: index within the corresponding state array

    let itemToDelete;
    let currentItems;
    let setItems;

    if (type === 'files') {
      currentItems = noteFiles;
      setItems = setNoteFiles;
    } else if (type === 'images') {
      currentItems = noteImages;
      setItems = setNoteImages;
    } else if (type === 'voice') {
      currentItems = noteVoice;
      setItems = setNoteVoice;
    } else {
      console.error("Invalid attachment type for deletion");
      return;
    }

    itemToDelete = currentItems[index];
    if (!itemToDelete || !itemToDelete.path) {
        console.error("Could not find item to delete or item path missing");
        return;
    }

    if (!confirm(`Are you sure you want to delete the attachment "${itemToDelete.name}"? This cannot be undone.`)) {
      return;
    }

    console.log(`Attempting to delete ${type} attachment:`, itemToDelete);

    try {
      // Get auth token
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        throw new Error('Could not get user session for authentication.');
      }
      const accessToken = session.access_token;

      const response = await fetch('/api/notes/delete-attachment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          noteId: noteId, // noteId is available from page params
          attachmentType: type,
          attachmentPath: itemToDelete.path
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `HTTP error! status: ${response.status}`);
      }

      console.log('Attachment deleted successfully via API:', result.message);

      // Update UI state after successful deletion
      const updatedItems = currentItems.filter((_, i) => i !== index);
      setItems(updatedItems);
      // Optionally show a success message to the user

    } catch (error) {
      console.error(`Error deleting attachment ${itemToDelete.name}:`, error);
      alert(`Failed to delete attachment: ${error.message}`);
      // Optionally revert UI state if needed
    }

  };
  // --- End Attachment Deletion Handler ---
  // --- Attachment Upload Function ---
  const handleUploadAttachment = async (file) => {
    if (!file || !noteId) return;

    console.log(`[UploadAttachment] Starting upload for: ${file.name}`);
    // TODO: Add visual feedback for upload in progress (e.g., spinner next to file list item)
    setError(null); // Clear previous errors

    const formData = new FormData();
    formData.append('noteId', noteId);
    formData.append('attachment', file); // Send the single file

    try {
      // Get auth token
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        throw new Error('Could not get user session for authentication.');
      }
      const accessToken = session.access_token;

      const response = await fetch('/api/notes/add-attachment', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          // Content-Type is set automatically for FormData
        },
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `HTTP error! status: ${response.status}`);
      }

      console.log('[UploadAttachment] Upload successful:', result);

      // Update local state using the full arrays returned by the API for consistency
      if (result.updatedNoteArrays) {
          console.log("[UploadAttachment] Updating local state with arrays from API response.");
          setNoteFiles(result.updatedNoteArrays.files || []);
          setNoteImages(result.updatedNoteArrays.images || []);
      } else {
          // Log an error if the expected arrays are not returned
          console.error("[UploadAttachment] API response missing 'updatedNoteArrays'. Cannot reliably update UI state.");
          setError("Failed to update attachment list after upload. Please refresh the page.");
      }
      // TODO: Remove visual feedback for upload completion

    } catch (error) {
      console.error(`[UploadAttachment] Error uploading ${file.name}:`, error);
      setError(`Failed to upload ${file.name}: ${error.message}`);
      // TODO: Show error feedback to the user (e.g., next to the file list item)
    }
  };
  // --- End Attachment Upload Function ---

  // --- Attachment Input Handlers (Call Upload Immediately) ---
  const handleAddFile = (event) => {
    const files = Array.from(event.target.files);
    files.forEach(file => handleUploadAttachment(file)); // Upload each file
    event.target.value = null; // Clear input
  };

  const handleAddPhoto = (event) => {
    const files = Array.from(event.target.files);
    files.forEach(file => handleUploadAttachment(file)); // Upload each photo
    event.target.value = null; // Clear input
  };

  const handleTakePhoto = () => {
    cameraInputRef.current?.click();
  };

  const handlePhotoCaptured = (event) => {
    const file = event.target.files?.[0];
    if (file) {
      handleUploadAttachment(file); // Upload captured photo
    }
    event.target.value = null; // Clear input
  };
  // --- End Attachment Input Handlers ---
  
  // --- Text Editing Handlers ---
  const handleTextEditToggle = async () => { // Made async
    if (isEditingText) {
      // If toggling off (clicking "Done"), check if text changed and save if needed.
      const textChanged = editedText !== noteText;
      if (textChanged) {
        console.log("Text changed, saving via Done button...");
        // isSaving state is removed, no need to set it.
        setError(null);
        try {
          // Get auth token
          const { data: { session }, error: sessionError } = await supabase.auth.getSession();
          if (sessionError || !session) {
            throw new Error('Could not get user session for authentication.');
          }
          // Call Supabase directly to update only text
          const { error: updateError } = await supabase
            .from('notes')
            .update({ text: editedText })
            .eq('id', noteId);

          if (updateError) throw updateError;

          console.log("Note text updated successfully via Done button.");
          setNoteText(editedText); // Update local state upon success
        } catch (error) {
           console.error('Error saving note text via Done button:', error);
           setError(`Failed to save text changes: ${error.message}`);
           // Optionally revert editedText or keep it for user retry
           // setEditedText(noteText); // Example revert
           return; // Stop execution if save failed
        } finally {
           // No state to reset here anymore
        }
      } else {
         console.log("Text unchanged, exiting edit mode.");
      }
      setIsEditingText(false); // Exit edit mode regardless of save
    } else {
      // If toggling on, ensure editedText has the current noteText
      setEditedText(noteText);
      setIsEditingText(true); // Enter edit mode
    }
  };
  
  const handleTextChange = (e) => {
    setEditedText(e.target.value);
  };
  // --- End Text Editing Handlers ---
  
  // handleSaveChanges function is removed.
  if (loading) {
    return (
      <DashboardLayout pageTitle="Loading Note...">
        <div className="dashboard-content item-detail-content">
          <p>Loading...</p>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
     return (
      <DashboardLayout pageTitle="Error">
        <div className="dashboard-content item-detail-content error-message">
          <p>Error: {error}</p>
          <button onClick={() => router.push('/notes')} className="standard-button">Back to Notes</button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout pageTitle={isEditingTitle ? 'Editing Note...' : noteTitle}>
      <div className="dashboard-content item-detail-content">
        {/* Apply structure from titleUI.md */}
        {/* Structure based on titleUI.md and previous implementation */}
        <div className="note-header"> {/* Renamed class */}
          {/* Title Section */}
          <div className="note-title-container"> {/* Renamed class */}
            {isEditingTitle ? (
              <input
                type="text" // Use renamed state
                value={noteTitle}
                onChange={handleTitleChange}
                onBlur={handleTitleSave}
                onKeyDown={handleTitleKeyDown}
                className="note-title-input" /* Renamed class */
                autoFocus
              />
            )   : (
              <h2 className="header2"> {/* Use h2 with header2 style */}
                {noteTitle}
                <button onClick={handleTitleEdit} className="edit-title-button" title="Edit Title" style={{ marginLeft: '10px', background: 'none', border: 'none', cursor: 'pointer' }}>
                  <EditIcon />
                </button>
              </h2>
            )}
          </div>

          {/* Actions Menu (Dropdown) */}
          <div className="note-actions-menu" style={{ position: 'relative' }}> {/* Renamed class */}
            <button onClick={toggleMenu} className="menu-toggle-button" title="More actions">
              <MoreIcon /> {/* Use MoreIcon as trigger */}
            </button>
            {showMenu && (
              // Apply dropdown styles from snippet
              <div className="dropdown-menu" style={{ display: 'block', right: 0, top: '100%' }}> {/* Added inline styles for position/display */}
                <button
                  onClick={handleDeleteNote} // Use renamed handler
                  // Combine dropdown item class with danger styling
                  className="dropdown-item button-danger"
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer' }} // Basic button reset and flex
                >
                  <TrashIcon /> Delete Note
                </button>
                {/* Add other menu items here if needed */}
              </div>
            )}
          </div>
        </div>
        {/* Timestamp */}
        {/* TODO: Fetch and display actual creation/modification date */}
        <div className="timestamp">April 11, 2025</div>

        {/* Main Content Area */}
        <div className="note-content-area">
          {/* WYSIWYG Editor Placeholder */}
          {/* TODO: Integrate a WYSIWYG library (e.g., TipTap, Quill, Slate) */}
          {/* Text Content Area with Edit Toggle */}
          <div className="text-content-section card"> {/* Added card style */}
            <div className="text-content-header">
              <h3 className="header3">Note Content</h3>
              <button
                onClick={handleTextEditToggle}
                className={`standard-button button-secondary edit-text-button ${isEditingText ? 'editing' : ''}`}
                title={isEditingText ? 'Finish Editing Text' : 'Edit Text'}
              >
                {isEditingText ? <CheckCircle /> : <EditIcon />}
                {isEditingText ? 'Done' : 'Edit'}
              </button>
            </div>
            <div className={`note-text-container ${isEditingText ? 'editing' : ''}`}>
              {isEditingText ? (
                <textarea
                  className="textarea note-text-edit"
                  value={editedText}
                  onChange={handleTextChange}
                  placeholder="Enter note content..."
                  rows={10}
                />
              ) : (
                <div className="markdown-preview">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {editedText || ''}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          </div>

          {/* Embedded Images Section */}
          {/* Conditionally render based on length, default open if > 0 */}
          <details className="embedded-images-section" open={noteImages.length > 0}>
            <summary>Images ({noteImages.length})</summary>
            {noteImages.length > 0 ? ( // Changed from && to ternary operator
              <>
                <div className="image-thumbnail-grid"> {/* Grid starts here */}
                  {noteImages.map((img, index) => {
                      // Construct URL only if token and path exist
                      const imageUrl = authToken && img.path ? `/api/notes/attachment/${img.path}?token=${authToken}` : null;
                      console.log(`Rendering image component for: ${img.name}`); // Add log here
                      return (
                        <div key={index} className="thumbnail-item attachment-item">
                          {/* Wrap thumbnail in an <a> tag for the lightbox */}
                          {imageUrl ? (
                            // Removed data-attribute="SRL" and made link open in new tab for now
                            <a href={imageUrl} target="_blank" rel="noopener noreferrer">
                              <Image 
                                src={imageUrl} 
                                alt={img.name} 
                                className="thumbnail-image" 
                                width={150} 
                                height={150} 
                                style={{ objectFit: 'cover' }} 
                              />
                            </a>
                          ) : (
                            <div className="attachment-info"> {/* Fallback for missing image */}
                              <ImageIcon />
                              <span>{img.name} (No URL)</span>
                            </div>
                          )}
                          {/* Keep the name display and delete button outside the <a> tag */}
                          <div className="attachment-info-footer">
                            <button
                              onClick={() => handleDeleteAttachment('images', index)}
                              className="control-button delete-button attachment-delete-btn"
                              title="Remove Image"
                            >
                              <TrashIcon />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div> {/* Grid ends here */}
              </>
            ) : null} {/* Explicitly render null if condition is false */}
          </details>

          {/* Attachments Section */}
          {/* TODO: Fetch and map attachments */}
          <div className="attachments-section">
            <div className="attachments-header">
              <h3 className="header3">Attachments</h3>
              <div className="attachment-actions">
                {/* Hidden inputs for adding attachments */}
                <input type="file" id="noteFileInput" style={{ display: 'none' }} onChange={handleAddFile} multiple />
                <input type="file" id="notePhotoInput" accept="image/*" style={{ display: 'none' }} onChange={handleAddPhoto} multiple />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: 'none' }}
                  onChange={handlePhotoCaptured}
                />
                {/* Buttons to trigger hidden inputs */}
                <button className="standard-button button-secondary" title="Add File" onClick={() => document.getElementById('noteFileInput').click()}><FileIcon /></button>
                <button className="standard-button button-secondary" title="Add Photo from Gallery" onClick={() => document.getElementById('notePhotoInput').click()}><ImageIcon /></button>
                <button className="standard-button button-secondary" title="Take Photo with Camera" onClick={handleTakePhoto}><CameraIcon /></button>
              </div>
            </div>
            <ul className="attachment-list">
              {noteFiles.length === 0 && <li className="no-attachments">No file attachments.</li>}
              {noteFiles.map((file, index) => (
                 <li key={index} className="attachment-item">
                   <div className="attachment-info">
                     <FileIcon />
                     {/* Construct download URL */}
                     <a
                       href={authToken && file.path ? `/api/notes/attachment/${file.path}?token=${authToken}` : '#'}
                       title={file.path}
                       target="_blank" // Open in new tab
                       rel="noopener noreferrer"
                       className={!(authToken && file.path) ? 'disabled-link' : ''} // Add class if disabled
                       // download={file.name} // Optional: Suggest filename for download
                     >
                       {file.name}
                     </a>
                   </div>
                   <button
                     onClick={() => handleDeleteAttachment('files', index)}
                     className="control-button delete-button attachment-delete-btn"
                     title="Remove Attachment"
                   >
                     <TrashIcon />
                   </button>
                 </li>
              ))}
            </ul>
            {/* Display newly added (staged) attachments */}
            {/* Removed display block for 'newAttachments' as they are uploaded immediately */}
            </div>

          {/* Voice Recordings Section */}
          {noteVoice.length > 0 && (
            <div className="voice-recordings-section">
              <h3 className="header3">Voice Recordings</h3>
              <ul className="attachment-list">
                {noteVoice.map((voice, index) => (
                  <li key={index} className="attachment-item voice-item">
                    <div className="attachment-info voice-info"> {/* Added class */}
                      <MicrophoneIcon />
                      <span>{voice.name}</span>
                      {/* Basic HTML5 audio player */}
                      {authToken && voice.path ? (
                        <audio controls preload="none" className="voice-player"> {/* Added class */}
                          <source src={`/api/notes/attachment/${voice.path}?token=${authToken}`} type="audio/webm" /> {/* Adjust type if needed */}
                          Your browser does not support the audio element.
                        </audio>
                      ) : (
                        <button disabled><PlayIcon /></button> // Disabled placeholder
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteAttachment('voice', index)}
                      className="control-button delete-button attachment-delete-btn"
                      title="Remove Recording"
                    >
                      <TrashIcon />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Bottom Action Buttons */}
          {/* TODO: Add functionality (Save, Share, Re-process) */}
          <div className="note-actions">
             <button className="standard-button button-secondary" title="Share Note"><ShareIcon /> Share</button> {/* Removed disabled={isSaving} */}
             {/* Save Changes button removed */}
             {/* Add Re-process button if needed */}
          </div> {/* End of note-actions */}
        </div> {/* End of note-content-area */}
      </div> {/* End of dashboard-content */}
      {/* </SimpleReactLightbox> */} {/* Removed Lightbox Provider */}
    </DashboardLayout>
  );
}
