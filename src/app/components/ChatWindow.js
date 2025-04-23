'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react'; // Added useState, useCallback
// Removed useChat import
import { supabase } from '@/lib/supabase'; // Import client-side Supabase
import './ChatWindow.css';
import { SendIcon, NewChatIcon, MinimizeIcon } from '@/lib/icons';

// Removed unused languageNames constant

export default function ChatWindow({
  isOpen,
  onClose, // Function to minimize/close the window
  selectedNoteIds // Set of selected note IDs (passed to API in body)
  // allNotes prop is no longer needed here as content is fetched server-side
  // language prop removed - handled server-side
}) {
  const messagesEndRef = useRef(null);
  const [authToken, setAuthToken] = useState(null); // State to hold the auth token

  // Effect to get the auth token on mount and when session changes
  useEffect(() => {
    const fetchToken = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          console.error("Error getting session:", error);
          setAuthToken(null);
        } else if (session) {
          setAuthToken(session.access_token);
        } else {
          setAuthToken(null); // No active session
        }
      } catch (e) {
        console.error("Exception fetching session:", e);
        setAuthToken(null);
      }
    };

    fetchToken();

    // Optional: Listen for auth changes if needed, though maybe not necessary
    // if the window closes/reopens on auth state change elsewhere
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setAuthToken(session?.access_token ?? null);
      }
    );

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []);

  // State for manual chat handling
  const [chatMessages, setChatMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Scroll to bottom whenever chatMessages change
  useEffect(scrollToBottom, [chatMessages]);

  // Handle "New Chat" button click
  const handleNewChat = () => {
    // Clear state for a new chat
    setChatMessages([]);
    setInputValue('');
    setIsLoading(false);
    setError(null);
    // TODO: Consider stopping any ongoing fetch request if implemented
  };

  // Handle form submission manually
  const handleFormSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading || !authToken) return;

    const newUserMessage = {
      id: `user-${Date.now()}`, // Simple unique ID
      role: 'user',
      content: inputValue.trim(),
    };

    // Add user message immediately and clear input
    setChatMessages((prevMessages) => [...prevMessages, newUserMessage]);
    const currentInput = inputValue.trim(); // Capture input before clearing
    setInputValue('');
    setIsLoading(true);
    setError(null);

    // Prepare messages array to send to API (current history + new user message)
    const messagesToSend = [...chatMessages, newUserMessage].map(m => ({ role: m.role, content: m.content }));

    try {
      const response = await fetch('/api/notes/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          messages: messagesToSend, // Send the constructed message history
          selectedNoteIds: Array.from(selectedNoteIds),
        }),
      });

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch (parseError) {
          errorData = { error: `HTTP error! status: ${response.status}` };
        }
        throw new Error(errorData?.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.response) {
        const assistantMessage = {
          id: `assistant-${Date.now()}`, // Simple unique ID
          role: 'assistant',
          content: data.response,
        };
        setChatMessages((prevMessages) => [...prevMessages, assistantMessage]);
      } else {
        throw new Error("Invalid response format from API.");
      }

    } catch (err) {
      console.error("Chat API Error:", err);
      setError(err.message || "Failed to fetch response.");
      // Optionally add an error message to the chat
      const errorMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `Sorry, I encountered an error: ${err.message || "Unknown error"}`,
      };
      setChatMessages((prevMessages) => [...prevMessages, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [inputValue, isLoading, authToken, chatMessages, selectedNoteIds]); // Include dependencies

  if (!isOpen) {
    return null; // Don't render anything if not open
  }

  return (
    <div className="chat-window">
      <div className="chat-topbar">
        <span>Chat with Notes ({selectedNoteIds.size > 0 ? `${selectedNoteIds.size} selected` : 'all'})</span>
        <button onClick={onClose} className="chat-minimize-btn" aria-label="Minimize Chat">
          <MinimizeIcon />
        </button>
      </div>
      <div className="chat-messages">
        {chatMessages.map((msg) => (
          // Use generated id as key
          <div key={msg.id} className={`chat-message ${msg.role}`}>
            <p><strong>{msg.role === 'user' ? 'You' : 'Bob'}:</strong> {msg.content}</p>
          </div>
        ))}
        {/* Use our manual isLoading state */}
        {isLoading && (
          <div className="chat-message assistant loading">
            <p><strong>Bob:</strong> Thinking...</p>
          </div>
        )}
        {error && (
           <div className="chat-message error">
             <p><strong>Error:</strong> {error}</p>
           </div>
        )}
        <div ref={messagesEndRef} /> {/* Anchor for scrolling */}
      </div>
      {/* Use a form element for better accessibility and handling */}
      <form onSubmit={handleFormSubmit} className="chat-input-area">
        <button
          type="button" // Prevent form submission
          onClick={handleNewChat}
          className="chat-action-btn"
          aria-label="New Chat"
          title="Start New Chat"
        >
          <NewChatIcon />
        </button>
        <textarea
          value={inputValue} // Bind value to our inputValue state
          onChange={(e) => setInputValue(e.target.value)} // Update our state
          placeholder="Ask about your notes..."
          rows="2"
          disabled={isLoading} // Disable input while loading
          onKeyDown={(e) => {
            // Submit on Enter, allow Shift+Enter for new lines
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleFormSubmit(e); // Trigger form submission
            }
          }}
        />
        <button
          type="submit" // Submit button for the form
          disabled={isLoading || !inputValue.trim() || !authToken} // Disable if loading, input empty, or no token
          className="chat-action-btn"
          aria-label="Send Message"
          title="Send Message"
        >
          <SendIcon />
        </button>
      </form>
    </div>
  );
}