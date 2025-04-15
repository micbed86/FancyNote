'use client';

import { useState, useEffect, useCallback } from 'react'; // Import useCallback
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import DashboardLayout from '../components/DashboardLayout';
import { /* AddProjectIcon, */ MicrophoneIcon } from '@/lib/icons'; // Import Mic icon for FAB
import './notes.css'; // Renamed CSS file
import Image from 'next/image';

// Helper function to format date and time as DD/MM/YYYY - HH:mm
const formatDateTime = (dateString) => {
  const date = new Date(dateString);
  
  // Format date as DD/MM/YYYY
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  
  // Format time as HH:mm
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  
  return `${day}/${month}/${year} - ${hours}:${minutes}`;
};

export default function NotesPage() { // Renamed function
  const router = useRouter();
  const [notes, setNotes] = useState([]); // Renamed state
  const [filteredNotes, setFilteredNotes] = useState([]); // Renamed state
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedNotes, setSelectedNotes] = useState(new Set()); // State for selected notes

  // Function to handle checkbox change
  const handleCheckboxChange = useCallback((noteId, isChecked) => {
    setSelectedNotes(prevSelected => {
      const newSelected = new Set(prevSelected);
      if (isChecked) {
        newSelected.add(noteId);
      } else {
        newSelected.delete(noteId);
      }
      return newSelected;
    });
  }, []);

  // Function to handle deleting selected notes
  const handleDeleteSelected = async () => {
    if (selectedNotes.size === 0) return;

    const confirmed = window.confirm(`Are you sure you want to delete ${selectedNotes.size} selected note(s)? This action cannot be undone.`);

    if (confirmed) {
      console.log("Attempting to delete notes:", Array.from(selectedNotes));
      setLoading(true); // Optional: Show loading state during deletion

      try {
        // Get the current session for the token
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session) {
          throw new Error(sessionError?.message || 'Could not get user session.');
        }
        const token = session.access_token;

        const response = await fetch('/api/notes/delete-batch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ noteIds: Array.from(selectedNotes) }),
        });

        const result = await response.json();

        if (!response.ok) {
          console.error('API Error Response:', result);
          throw new Error(result.error || `Failed to delete notes (status ${response.status})`);
        }

        console.log('Deletion successful:', result);
        if (result.sftpErrors && result.sftpErrors.length > 0) {
            console.warn('SFTP Deletion Warnings:', result.sftpErrors);
            // Optionally inform the user about partial success if needed
        }

        // Update local state after successful deletion
        const deletedIds = new Set(result.deletedNoteIds || Array.from(selectedNotes)); // Use response IDs if available
        setNotes(prevNotes => prevNotes.filter(note => !deletedIds.has(note.id)));
        setFilteredNotes(prevFiltered => prevFiltered.filter(note => !deletedIds.has(note.id)));
        setSelectedNotes(new Set()); // Clear selection

        // Optionally show a success message
        // alert(`${result.deletedNoteIds?.length || selectedNotes.size} note(s) deleted successfully.`);

      } catch (error) {
        console.error('Error deleting selected notes:', error);
        alert(`Error deleting notes: ${error.message}`);
      } finally {
        setLoading(false); // Hide loading state
      }
    }
  };

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/auth');
        return;
      }
      
      // Fetch notes for the current user
      try {
        const { data, error } = await supabase
          .from('notes') // Changed table name
          .select('id, title, created_at, text, excerpt') // Select needed columns including excerpt
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }); // Sort by creation date, newest first
          
        if (error) throw error;
        setNotes(data || []); // Updated state setter
        setFilteredNotes(data || []); // Updated state setter
      } catch (error) {
        // Log the raw error object for more details if possible
        console.error('Error loading notes:', JSON.stringify(error, null, 2));
      } finally {
        setLoading(false);
      }
    };
    checkUser();
  }, [router]);
  
  // Listen for note search events from the DashboardLayout
  useEffect(() => {
    const handleSearch = (event) => {
      setSearchTerm(event.detail);
    };
    
    window.addEventListener('noteSearch', handleSearch); // Changed event name
    
    return () => {
      window.removeEventListener('noteSearch', handleSearch); // Changed event name
    };
  }, []);
  
  // Filter notes based on search term
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredNotes(notes); // Updated state setter and variable
      return;
    }
    
    const term = searchTerm.toLowerCase();
    const filtered = notes.filter(note => { // Updated variable
      const title = (note.title || 'Untitled Note').toLowerCase(); // Updated variable and default text
      const date = formatDateTime(note.created_at).toLowerCase(); // Updated variable
      const excerpt = (note.excerpt || '').toLowerCase(); // Filter based on excerpt
      
      return title.includes(term) || date.includes(term) || excerpt.includes(term);
    });
    
    setFilteredNotes(filtered); // Updated state setter
  }, [searchTerm, notes]); // Updated dependency
 
  // Remove the temporary handleAddNote_TEMP function as it's replaced by FAB navigation

  return (
    <DashboardLayout pageTitle="Notes">
      <div className="dashboard-content">
        {/* Header Section */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2>Your Notes</h2>
          {selectedNotes.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              className="delete-selected-button" // Add a class for styling
            >
              Delete Selected ({selectedNotes.size})
            </button>
          )}
        </div>

        {/* Conditional Content Area */}
        {loading ? (
          <div>Loading notes...</div>
        ) : notes.length === 0 ? (
          <div className='empty-board'>
            <h1>no notes yet</h1>
            {/* TODO: Add prompt to use FAB */}
          </div>
        ) : filteredNotes.length === 0 ? (
          <div className='empty-board'>
            <h1>no matching notes</h1>
          </div>
        ) : (
          <div className="notes-list">
            {filteredNotes.map(note => (
              <div
                key={note.id}
                className={`note-tile ${selectedNotes.has(note.id) ? 'selected' : ''}`}
                onClick={() => router.push(`/notes/${note.id}`)}
              >
                <input
                  type="checkbox"
                  className="note-select-checkbox"
                  checked={selectedNotes.has(note.id)}
                  onChange={(e) => handleCheckboxChange(note.id, e.target.checked)}
                  onClick={(e) => e.stopPropagation()} // Prevent tile click when clicking checkbox
                  aria-label={`Select note titled ${note.title || 'Untitled Note'}`}
                />
                <div className="note-content"> {/* Wrap content to allow checkbox positioning */}
                  <p className="text">{note.title || 'Untitled Note'}</p>
                  <p className="note-date">{formatDateTime(note.created_at)}</p>
                  <p className="note-excerpt">
                  {note.excerpt || 'No excerpt available...'} {/* Use 'excerpt' column */}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Floating Action Button (FAB) */}
        {/* TODO: Add FAB effects divs from Floating Recording Button Component.md */}
        <div className="action-button-wrapper" onClick={() => router.push('/create-note')}>
           <div className="action-container" title="Create New Note">
             {/* Add FAB effects divs (.action-glow, .action-darkBorderBg, etc.) here */}
             <div className="action-glow"></div>
             <div className="action-darkBorderBg"></div>
             <div className="action-white"></div>
             <div className="action-border"></div>
             <button className="action-button" aria-label="Create New Note">
               <MicrophoneIcon />
             </button>
           </div>
        </div>

      </div> {/* End of dashboard-content */}
    </DashboardLayout>
  );
}