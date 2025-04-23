'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import DashboardLayout from '../components/DashboardLayout';
import ChatWindow from '../components/ChatWindow'; // Import ChatWindow
import { /* AddProjectIcon, */ MicrophoneIcon, HourglassIcon, ChatIcon } from '@/lib/icons'; // Import Mic, Hourglass, and Chat icons
import './notes.css'; // Renamed CSS file
import '../components/ChatWindow.css'; // Import ChatWindow CSS
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
  const [isChatOpen, setIsChatOpen] = useState(false); // State for chat window visibility
  // Removed userLanguage state - handled server-side via profile settings

  // Function to toggle chat window
  const toggleChat = () => setIsChatOpen(!isChatOpen);

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

  // Function to fetch notes
  const fetchNotes = useCallback(async (isInitialLoad = false) => {
    if (isInitialLoad) setLoading(true);
    console.log("Fetching notes..."); // Log when fetching starts
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        console.error("User not found or error fetching user:", userError);
        router.push('/auth'); // Redirect if user fetch fails
        return;
      }

      const { data, error } = await supabase
        .from('notes')
        .select('id, title, created_at, text, excerpt, processing_status')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      console.log("Notes fetched successfully:", data?.length); // Log count
      setNotes(data || []);
      // Apply search filter immediately after fetching if searchTerm exists
      if (searchTerm.trim()) {
          const term = searchTerm.toLowerCase();
          const filtered = (data || []).filter(note => {
              const title = (note.title || 'Untitled Note').toLowerCase();
              const date = formatDateTime(note.created_at).toLowerCase();
              const excerpt = (note.excerpt || '').toLowerCase();
              return title.includes(term) || date.includes(term) || excerpt.includes(term);
          });
          setFilteredNotes(filtered);
      } else {
          setFilteredNotes(data || []); // If no search term, show all fetched notes
      }

    } catch (error) {
      console.error('Error loading notes:', JSON.stringify(error, null, 2));
      // Optionally set an error state here
    } finally {
      if (isInitialLoad) setLoading(false);
    }
  }, [router, searchTerm]); // Include searchTerm dependency for filtering logic

  // Initial fetch on component mount
  useEffect(() => {
    fetchNotes(true); // Pass true for initial load
    // Removed fetchUserLanguage call
  }, [fetchNotes]); // Depend on fetchNotes callback

  // Removed fetchUserLanguage function

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
  }, [searchTerm, notes]);

  // Removed unnecessary polling mechanism

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
            {filteredNotes.map(note => {
              const isProcessing = note.processing_status === 'processing'; // Check if the note is processing using processing_status
              return (
                <div
                  key={note.id}
                  className={`note-tile ${selectedNotes.has(note.id) ? 'selected' : ''} ${isProcessing ? 'processing' : ''}`}
                  onClick={isProcessing ? undefined : () => router.push(`/notes/${note.id}`)} // Disable click if processing
                  style={isProcessing ? { cursor: 'not-allowed', opacity: 0.7 } : {}} // Add visual cues for processing
                >
                  {!isProcessing && (
                    <input
                      type="checkbox"
                      className="note-select-checkbox"
                      checked={selectedNotes.has(note.id)}
                      onChange={(e) => handleCheckboxChange(note.id, e.target.checked)}
                      onClick={(e) => e.stopPropagation()} // Prevent tile click when clicking checkbox
                      aria-label={`Select note titled ${note.title || 'Untitled Note'}`}
                    />
                  )}
                  <div className="note-content"> {/* Wrap content to allow checkbox positioning */}
                    <p className="text">
                      {isProcessing && <HourglassIcon style={{ marginRight: '8px', verticalAlign: 'middle' }} />} {/* Add icon if processing */}
                      {note.title || (isProcessing ? 'Processing Note...' : 'Untitled Note')}
                    </p>
                    <p className="note-date">{formatDateTime(note.created_at)}</p>
                    <p className="note-excerpt">
                    {isProcessing ? 'Transcription and analysis in progress...' : (note.excerpt || 'No excerpt available...')}
                    </p>
                  </div>
                </div>
              );
            })}
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

      {/* Chat Floating Action Button (FAB) - Moved outside dashboard-content */}
      <button
        className="chat-fab-button"
        onClick={toggleChat}
        title="Chat with Notes"
        aria-label="Open chat with notes"
      >
        <ChatIcon />
      </button>

      {/* Render Chat Window - Moved outside dashboard-content */}
      <ChatWindow
        isOpen={isChatOpen}
        onClose={toggleChat} // Pass toggle function to handle minimize/close
        selectedNoteIds={selectedNotes}
        allNotes={notes} // Pass the full notes array (API fetches full text based on IDs)
        // Removed language prop - handled server-side
      />
    </DashboardLayout>
  );
}


// Function to mark a note as completed and deduct credits
const markNoteAsCompleted = async (noteId) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    // Fetch current credits
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('project_credits')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) throw new Error('Failed to fetch user profile');

    if (profile.project_credits <= 0) {
      alert('Insufficient credits to complete this note.');
      return;
    }

    // Deduct one credit
    const newCredits = profile.project_credits - 1;
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ project_credits: newCredits })
      .eq('id', user.id);

    if (updateError) throw new Error('Failed to update credits');

    // Mark note as completed
    const { error: noteError } = await supabase
      .from('notes')
      .update({ status: 'completed' })
      .eq('id', noteId);

    if (noteError) throw new Error('Failed to mark note as completed');

    alert('Note marked as completed and credit deducted.');
  } catch (error) {
    console.error('Error completing note:', error);
    alert(`Error: ${error.message}`);
  }
};