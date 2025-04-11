'use client';

import { useState, useEffect, use } from 'react'; // Import use
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import DashboardLayout from '../../components/DashboardLayout';
import { TrashIcon, EditIcon, MoreIcon, FileIcon, ImageIcon, CameraIcon, SaveIcon, ShareIcon } from '@/lib/icons'; // Added more icons
import './note.css'; // Renamed CSS file

export default function NotePage({ params }) { // Renamed component
  const router = useRouter();
  // Correctly unwrap params using React.use()
  const unwrappedParams = use(params);
  const { id: noteId } = unwrappedParams; // Renamed variable

  const [loading, setLoading] = useState(true);
  const [noteTitle, setNoteTitle] = useState('Loading...'); // Renamed state
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [showMenu, setShowMenu] = useState(false); // State for delete menu
  const [error, setError] = useState(null);

  useEffect(() => {
    const checkUserAndFetchNote = async () => { // Renamed function
      setLoading(true);
      setError(null);

      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        console.error('Auth error or no user:', authError);
        router.push('/auth');
        return;
      }

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
          setNoteTitle(noteData.title || 'Untitled Note'); // Use renamed state and default
          // TODO: Set state for content, attachments, images based on noteData
        } else if (!fetchError) {
           setError('Note not found.');
        }

      } catch (err) {
        console.error('Error loading note:', err);
        setError(`Failed to load note: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    checkUserAndFetchNote();
  }, [noteId, router]); // Use renamed variable

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

  const handleDeleteNote = async () => { // Renamed function
    setShowMenu(false); // Close menu
    if (confirm('Are you sure you want to delete this note? This action cannot be undone.')) { // Updated confirmation text
      try {
        const { error: deleteError } = await supabase
          .from('notes') // Use 'notes' table
          .delete()
          .eq('id', noteId); // Use renamed variable

        if (deleteError) throw deleteError;

        router.push('/notes'); // Use renamed route

      } catch (error) {
        console.error('Error deleting note:', error);
        alert(`Failed to delete note: ${error.message}`);
      }
    }
  };
  // --- End Delete Menu Handlers ---


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
    // Pass the potentially edited title to the layout
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
            ) : (
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
          <div className="wysiwyg-editor" contentEditable="true" suppressContentEditableWarning={true}>
            <p>This is where the editable note content will appear...</p>
            {/* Example of embedded image (replace with dynamic data) */}
            {/* <img src="https://placehold.co/600x300/2d2d2d/f0f0f0?text=Embedded+Image" alt="Embedded Image"> */}
          </div>

          {/* Embedded Images Section */}
          {/* TODO: Fetch and map embedded images */}
          <details className="embedded-images-section" open> {/* 'open' makes it expanded by default */}
            <summary>Embedded Images (0)</summary> {/* TODO: Update count dynamically */}
            <div className="image-thumbnail-grid">
              {/* Placeholder for image thumbnails */}
            </div>
          </details>

          {/* Attachments Section */}
          {/* TODO: Fetch and map attachments */}
          <div className="attachments-section">
            <div className="attachments-header">
              <h3 className="header3">Attachments</h3>
              <div className="attachment-actions">
                {/* TODO: Add functionality to these buttons */}
                <button className="standard-button button-secondary" title="Add File"><FileIcon /></button>
                <button className="standard-button button-secondary" title="Add Photo from Gallery"><ImageIcon /></button>
                <button className="standard-button button-secondary" title="Take Photo with Camera"><CameraIcon /></button>
              </div>
            </div>
            <ul className="attachment-list">
              {/* Placeholder for attachment list items */}
               <li className="attachment-item"> {/* Example Item */}
                 <div className="attachment-info">
                   <FileIcon />
                   <span>example_attachment.txt</span>
                 </div>
                 <label className="checkbox-wrapper" title="Include in AI context">
                   <input type="checkbox" />
                   <div className="checkmark">
                     <svg stroke="currentColor" fill="none" viewBox="0 0 24 24"><path strokeLinejoin="round" strokeLinecap="round" strokeWidth="3" d="M20 6L9 17L4 12"></path></svg>
                   </div>
                 </label>
                 <button className="attachment-delete-btn" title="Remove Attachment">
                   <TrashIcon />
                 </button>
               </li>
            </ul>
          </div>

          {/* Bottom Action Buttons */}
          {/* TODO: Add functionality (Save, Share, Re-process) */}
          <div className="note-actions">
             <button className="standard-button button-secondary" title="Share Note"><ShareIcon /> Share</button>
             <button className="standard-button button-primary" title="Save Changes"><SaveIcon /> Save Changes</button>
             {/* Add Re-process button if needed */}
          </div> {/* End of note-actions */}
        </div> {/* End of note-content-area */}
      </div> {/* End of dashboard-content */}
    </DashboardLayout>
  );
}
