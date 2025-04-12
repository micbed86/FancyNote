'use client';

import { useState, useRef, useEffect, useCallback } from 'react'; // Added useCallback
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import DashboardLayout from '../components/DashboardLayout';
import { FileIcon, ImageIcon, CameraIcon, MicrophoneIcon, PlayIcon, PauseIcon, StopIcon, TrashIcon } from '@/lib/icons'; // Import necessary icons
import './create-note.css'; // Link to the CSS file we will create

export default function CreateNotePage() {
  const router = useRouter();
  const [manualText, setManualText] = useState('');
  const [noteTitle, setNoteTitle] = useState('New Note'); // Add state for title
  const [attachments, setAttachments] = useState([]); // Store { file: File, includeInContext: boolean } objects
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null); // Store recorded audio Blob
  const [audioUrl, setAudioUrl] = useState(null); // Store URL for playback
  const [isPlaying, setIsPlaying] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioPlayerRef = useRef(null); // Ref for the <audio> element
  const timerIntervalRef = useRef(null); // Ref for the recording timer interval
  const [recordingTime, setRecordingTime] = useState(0); // State for recording duration in seconds
  const [isProcessing, setIsProcessing] = useState(false); // State for processing status
  const [processError, setProcessError] = useState(''); // State for processing errors
  const cameraInputRef = useRef(null); // Ref for the hidden camera input
  const handleAddFile = (event) => {
    const newFiles = Array.from(event.target.files);
    // Optional: Add checks for file size, type, or duplicate names
    setAttachments(prev => [...prev, ...newFiles.map(file => ({ file, includeInContext: true }))]); // Store file object and context flag
    // Clear the input value to allow selecting the same file again
    event.target.value = null;
  };

  const handleAddPhoto = (event) => {
    const newPhotos = Array.from(event.target.files);
    // Optional: Add checks for file size, type, or duplicate names
    setAttachments(prev => [...prev, ...newPhotos.map(file => ({ file, includeInContext: true }))]); // Store file object and context flag
    // Clear the input value
    event.target.value = null;
  };

  // Trigger the hidden camera input
  const handleTakePhoto = () => {
    cameraInputRef.current?.click();
  };

  // Handle the photo captured via the camera input
  const handlePhotoCaptured = (event) => {
    const capturedPhoto = event.target.files?.[0];
    if (capturedPhoto) {
      console.log('Photo captured:', capturedPhoto);
      setAttachments(prev => [...prev, { file: capturedPhoto, includeInContext: true }]);
    }
    // Clear the input value to allow capturing again if needed
    event.target.value = null;
  };

  // Use useCallback to memoize startRecording if needed, though dependencies are minimal here
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = []; // Reset chunks

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' }); // Or appropriate type
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        // Clean up stream tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setAudioBlob(null); // Clear previous recording
      setAudioUrl(null);
      console.log('Recording started');
      // Start timer
      setRecordingTime(0); // Reset timer
      timerIntervalRef.current = setInterval(() => {
        setRecordingTime(prevTime => prevTime + 1);
      }, 1000);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Could not access microphone. Please check permissions.');
      // TODO: Add user feedback for permission errors
      setIsRecording(false); // Ensure state is correct if start fails
    }
  }, []); // Close useCallback and provide dependency array
// Removed extra closing braces from previous incorrect structure

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      console.log('Recording stopped');
      // Stop timer
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  };

  const handleRecord = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const playAudio = () => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.play();
      setIsPlaying(true);
    }
  };

  const pauseAudio = () => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      setIsPlaying(false);
    }
  };

  // Stop playback and reset time
  const stopAudio = () => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
      setIsPlaying(false);
    }
  };

  const deleteAudio = () => {
    setAudioBlob(null);
    setAudioUrl(null);
    setIsPlaying(false); // Ensure playback stops if deleted while playing
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl); // Clean up object URL
    }
    console.log('Audio deleted');
  };

  // NOTE: These functions were already added in the previous step, but included here
  // again due to the partial failure message. If they already exist, this part might fail safely.
  const removeAttachment = (indexToRemove) => {
    setAttachments(prev => prev.filter((_, index) => index !== indexToRemove));
  };

  const toggleAttachmentContext = (indexToToggle) => {
    setAttachments(prev => prev.map((item, index) =>
      index === indexToToggle ? { ...item, includeInContext: !item.includeInContext } : item
    ));
  };

  // Effect to handle audio player events
  useEffect(() => {
    const audio = audioPlayerRef.current;
    if (audio) {
      const handleEnded = () => setIsPlaying(false);
      const handlePause = () => setIsPlaying(false); // Also set playing to false on manual pause

      audio.addEventListener('ended', handleEnded);
      audio.addEventListener('pause', handlePause);

      return () => {
        audio.removeEventListener('ended', handleEnded);
        audio.removeEventListener('pause', handlePause);
        // Clean up Object URL when component unmounts or audioUrl changes
        if (audioUrl) {
           URL.revokeObjectURL(audioUrl);
        }
      };
    }
  }, [audioUrl]); // Re-run effect if audioUrl changes

  // Effect to auto-start recording on mount
  useEffect(() => {
    console.log("Attempting to auto-start recording...");
    startRecording(); // Call startRecording when component mounts

    // Cleanup function to stop recording if component unmounts while recording
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        stopRecording();
      }
      // Clear timer interval on unmount
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [startRecording]); // Include startRecording in dependency array (due to useCallback)

  const handleProcessNote = async () => {
    setIsProcessing(true);
    setProcessError(''); // Clear previous errors

    // Basic check: require at least text, audio, or an attachment
    if (!manualText && !audioBlob && attachments.length === 0) {
        setProcessError('Please add some content (text, recording, or attachment) before processing.');
        setIsProcessing(false);
        return;
    }

    // TODO: Implement credit check before proceeding

    const formData = new FormData();
    formData.append('manualText', manualText);
    formData.append('noteTitle', noteTitle); // Send the title

    if (audioBlob) {
      // Use a filename that the backend can recognize if needed, e.g., 'audio.webm'
      formData.append('audioBlob', audioBlob, 'audio.webm');
    }

    // Append attachment files and their context flags
    const attachmentContextFlags = [];
    attachments.forEach((item, index) => {
      formData.append('attachments', item.file); // Append the File object
      attachmentContextFlags.push(item.includeInContext);
    });
    formData.append('attachmentContextFlags', JSON.stringify(attachmentContextFlags));


    console.log('Sending data to /api/notes/process...');

    try {
      // Get the session token to send for server-side auth
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        throw new Error('Could not get user session for authentication.');
      }
      const accessToken = session.access_token;

      const response = await fetch('/api/notes/process', {
        method: 'POST',
        headers: {
          // Send the token in the Authorization header
          'Authorization': `Bearer ${accessToken}`,
        },
        body: formData, // Send FormData directly
        // No 'Content-Type' header needed for FormData; browser sets it with boundary
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `HTTP error! status: ${response.status}`);
      }

      console.log('Note processed successfully:', result);
      // Redirect to the newly created note page
      if (result.noteId) {
        router.push(`/notes/${result.noteId}`);
      } else {
        // Fallback redirect if noteId is missing for some reason
        router.push('/notes');
      }

    } catch (error) {
      console.error('Error processing note:', error);
      setProcessError(`Failed to process note: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <DashboardLayout pageTitle="Create New Note">
      <div className="create-note-container"> {/* Use a specific container class */}

        {/* Title Section - Reusing note page structure */}
        <div className="note-header"> {/* Use same outer container */}
          <div className="note-title-container"> {/* Use same title container */}
            {/* Input field styled similarly to the h2/input on note page */}
            <input
              type="text"
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              className="note-title-input header2 create-page-title-input" /* Apply header2 class */
              placeholder="Enter Note Title"
            />
            {/* No edit/save buttons needed here as it's part of the main form */}
          </div>
          {/* No actions menu needed on create page */}
        </div>
        {/* Add a small spacer if needed */}
        <div style={{ height: '20px' }}></div>
        {/* Duplicated lines removed */}

        {/* Recording Section */}
        <div className="recording-section card"> {/* Use card style */}
          <h3 className="header3">Record Audio</h3>
          <div className="recording-controls">
            <button
              onClick={handleRecord}
              className={`record-button ${isRecording ? 'recording pulsing' : ''}`}
              title={isRecording ? 'Stop Recording' : 'Start Recording'}
            >
              <MicrophoneIcon />
              <span>{isRecording ? 'Stop' : 'Record'}</span>
            </button>
            {/* Display Elapsed Time */}
            {isRecording && (
              <span className="recording-timer">
                {Math.floor(recordingTime / 60).toString().padStart(2, '0')}:
                {(recordingTime % 60).toString().padStart(2, '0')}
              </span>
            )}
            {/* Audio Playback Controls - Conditionally render based on audioUrl */}
            {audioUrl && (
              <div className="audio-controls">
                 {/* Hidden audio player element */}
                 <audio ref={audioPlayerRef} src={audioUrl} style={{ display: 'none' }} />
                 {/* Play/Pause Button */}
                 {!isPlaying ? (
                   <button onClick={playAudio} className="control-button play-button" title="Play Recording">
                     <PlayIcon />
                   </button>
                 ) : (
                   <button onClick={pauseAudio} className="control-button pause-button" title="Pause Recording">
                     <PauseIcon />
                   </button>
                 )}
                 {/* Stop Button */}
                 <button onClick={stopAudio} className="control-button stop-button" title="Stop Playback">
                   <StopIcon />
                 </button>
                 {/* Delete Button */}
                 <button onClick={deleteAudio} className="control-button delete-button" title="Delete Recording">
                   <TrashIcon />
                 </button>
              </div>
            )}
          </div>
          {/* TODO: Add visual feedback for recording duration? */}
          {/* TODO: Add support for multiple recordings if needed */}
        </div>

        {/* Manual Text Input Section */}
        <div className="manual-text-section card"> {/* Use card style */}
           <h3 className="header3">Add Text</h3>
           <textarea
             className="textarea" // Reuse existing textarea style? Or create specific one
             placeholder="Add your thoughts, ideas, or details here..."
             value={manualText}
             onChange={(e) => setManualText(e.target.value)}
           />
        </div>

        {/* Attachments Section */}
        <div className="attachments-section card"> {/* Use card style */}
          <div className="attachments-header">
            <h3 className="header3">Add Attachments</h3>
            <div className="attachment-actions">
              {/* Hidden file inputs triggered by buttons */}
              <input type="file" id="fileInput" style={{ display: 'none' }} onChange={handleAddFile} multiple />
              <input type="file" id="photoInput" accept="image/*" style={{ display: 'none' }} onChange={handleAddPhoto} multiple />
              {/* Hidden input for camera capture */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment" // Use "user" for front camera
                style={{ display: 'none' }}
                onChange={handlePhotoCaptured}
              />

              <button className="standard-button button-secondary" title="Add File" onClick={() => document.getElementById('fileInput').click()}>
                <FileIcon />
              </button>
              <button className="standard-button button-secondary" title="Add Photo from Gallery" onClick={() => document.getElementById('photoInput').click()}>
                <ImageIcon />
              </button>
              <button className="standard-button button-secondary" title="Take Photo with Camera" onClick={handleTakePhoto}>
                <CameraIcon />
              </button>
            </div>
          </div>
          <ul className="attachment-list">
            {attachments.length === 0 && <li className="no-attachments">No attachments added yet.</li>}
            {/* Map through attachments state to render list items */}
            {attachments.map((item, index) => (
              <li key={index} className="attachment-item">
                <div className="attachment-info">
                  {/* Basic icon based on type - can be improved */}
                  {item.file.type.startsWith('image/') ? <ImageIcon /> : <FileIcon />}
                  <span className="attachment-name" title={item.file.name}>{item.file.name}</span>
                  <span className="attachment-size">({(item.file.size / 1024).toFixed(1)} KB)</span>
                </div>
                <div className="attachment-item-actions">
                   {/* Context Checkbox */}
                   <label className="checkbox-wrapper context-checkbox" title="Include in AI context">
                     <input
                       type="checkbox"
                       checked={item.includeInContext}
                       onChange={() => toggleAttachmentContext(index)}
                     />
                     {/* Use the styled checkmark from UI kit/global styles if available, or add basic span */}
                     <span className="checkmark">
                        {/* Optional: SVG checkmark inside if needed */}
                     </span>
                     <span className="context-label">AI</span> {/* Optional label */}
                   </label>
                   {/* Remove Button */}
                   <button
                     onClick={() => removeAttachment(index)}
                     className="control-button delete-button attachment-delete-btn" // Reuse styles
                     title="Remove Attachment"
                   >
                     <TrashIcon />
                   </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
        {/* Display Processing Error */}
        {processError && (
          <div className="message error process-error-message">
            {processError}
          </div>
        )}

        {/* Main Action Buttons */}
        <div className="create-note-actions">
          <button className="standard-button button-secondary" onClick={() => router.push('/notes')}>
            Cancel
          </button>
          <button
            className="standard-button button-primary"
            onClick={handleProcessNote}
            disabled={isProcessing || isRecording} // Disable button while processing OR recording
          >
            {isProcessing ? 'Processing...' : 'Process Note'}
          </button>
        </div>

      </div>
    </DashboardLayout>
  );
}