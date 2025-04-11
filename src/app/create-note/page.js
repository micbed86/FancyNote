'use client';

import { useState, useRef, useEffect } from 'react'; // Added useRef, useEffect
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import DashboardLayout from '../components/DashboardLayout';
import { FileIcon, ImageIcon, CameraIcon, MicrophoneIcon, PlayIcon, PauseIcon, StopIcon, TrashIcon } from '@/lib/icons'; // Import necessary icons
import './create-note.css'; // Link to the CSS file we will create

export default function CreateNotePage() {
  const router = useRouter();
  const [manualText, setManualText] = useState('');
  const [attachments, setAttachments] = useState([]); // Store { file: File, includeInContext: boolean } objects
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null); // Store recorded audio Blob
  const [audioUrl, setAudioUrl] = useState(null); // Store URL for playback
  const [isPlaying, setIsPlaying] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioPlayerRef = useRef(null); // Ref for the <audio> element
  const [isProcessing, setIsProcessing] = useState(false); // State for processing status
  const [processError, setProcessError] = useState(''); // State for processing errors
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

  const handleTakePhoto = () => {
    // TODO: Implement camera integration logic
    console.log('Take photo clicked');
  };

  const startRecording = async () => {
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
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Could not access microphone. Please check permissions.');
      // TODO: Add user feedback for permission errors
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      console.log('Recording stopped');
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
      const response = await fetch('/api/notes/process', {
        method: 'POST',
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

        {/* Recording Section */}
        <div className="recording-section card"> {/* Use card style */}
          <h3 className="header3">Record Audio</h3>
          <div className="recording-controls">
            <button
              onClick={handleRecord}
              className={`record-button ${isRecording ? 'recording' : ''}`}
              title={isRecording ? 'Stop Recording' : 'Start Recording'}
            >
              <MicrophoneIcon />
              <span>{isRecording ? 'Stop' : 'Record'}</span>
            </button>
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
            disabled={isProcessing} // Disable button while processing
          >
            {isProcessing ? 'Processing...' : 'Process Note'}
          </button>
        </div>

      </div>
    </DashboardLayout>
  );
}