'use client';

import { useState, useEffect } from 'react';
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
          .select('id, title, created_at, text') // Select only needed columns for the list
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
      const excerpt = (note.text || '').toLowerCase(); // Added excerpt filtering
      
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
          {/* Button removed, FAB will handle adding notes */}
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
              <div key={note.id} className="note-tile" onClick={() => router.push(`/notes/${note.id}`)}>
                <p className="text">{note.title || 'Untitled Note'}</p>
                <p className="note-date">{formatDateTime(note.created_at)}</p>
                <p className="note-excerpt">
                  {note.text || 'No content preview available...'} {/* Use 'text' column for excerpt */}
                </p>
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