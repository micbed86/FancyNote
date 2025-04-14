'use client';

import { useState, useRef, useEffect, useCallback } from 'react'; // Added useCallback
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import DashboardLayout from '../components/DashboardLayout';
import { FileIcon, ImageIcon, CameraIcon, MicrophoneIcon, TrashIcon, EditIcon, CheckCircle } from '@/lib/icons'; // Import necessary icons + EditIcon (Removed Play, Pause, Stop)
import './create-note.css'; // Link to the CSS file we will create

export default function CreateNotePage() {
  const router = useRouter();
  const [manualText, setManualText] = useState('');
  const [noteTitle, setNoteTitle] = useState('New Note'); // Add state for title
  const [attachments, setAttachments] = useState([]); // Store { file: File, includeInContext: boolean } objects
  const [voiceRecordings, setVoiceRecordings] = useState([]); // Store completed { blob: Blob, url: string, name: string }
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null); // Store *current* recorded audio Blob
  const [audioUrl, setAudioUrl] = useState(null); // Store URL for *current* playback
  const [isEditingTitle, setIsEditingTitle] = useState(false); // State for title editing
  const [isPlaying, setIsPlaying] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null); // Ref to store the media stream
  const audioPlayerRef = useRef(null); // Ref for the <audio> element
  const timerIntervalRef = useRef(null); // Ref for the recording timer interval
  const [recordingTime, setRecordingTime] = useState(0); // State for recording duration in seconds
  const [isProcessing, setIsProcessing] = useState(false); // State for processing status
  const [processError, setProcessError] = useState(''); // State for processing errors
  const cameraInputRef = useRef(null); // Ref for the hidden camera input
  const initialStartDoneRef = useRef(false); // Ref to track initial auto-start

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
    // --- Move previous recording (if exists) to the list ---
    if (audioBlob && audioUrl) {
      const recordingName = `Recording ${voiceRecordings.length + 1}.webm`; // Simple naming
      setVoiceRecordings(prev => [...prev, { blob: audioBlob, url: audioUrl, name: recordingName }]);
      setAudioBlob(null); // Clear current blob/url after saving
      setAudioUrl(null);
      // Note: URL revocation for the moved audio happens when it's deleted from the list or on unmount
    }
    // --- End move previous recording ---

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream; // Store the stream
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = []; // Reset chunks for new recording

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
        // Stream tracks will be stopped in the cleanup effect or when stopRecording explicitly stops them
      }; // Note: Removed track stopping from here

      mediaRecorderRef.current.start();
      setIsRecording(true);
      // setAudioBlob(null); // Already cleared if previous existed
      // setAudioUrl(null);
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
  }, [audioBlob, audioUrl, voiceRecordings.length]); // Restore audioBlob/Url dependencies
  // The function needs the latest blob/url to correctly move the previous recording.

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      console.log('Recording stopped');
      // Stop timer
      // Explicitly stop tracks here as well for immediate feedback
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null; // Clear the ref
      }
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


  // Deletes the *currently* displayed audio (before it's added to the list)
  const deleteCurrentAudio = () => {
    setAudioBlob(null);
    setAudioUrl(null);
    setIsPlaying(false); // Ensure playback stops if deleted while playing
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl); // Clean up object URL
      console.log("Revoked current audio URL:", audioUrl);
    }
    console.log('Current audio deleted');
  };

  // Deletes a recording from the voiceRecordings list
  const deleteVoiceRecording = (indexToDelete) => {
    const recordingToDelete = voiceRecordings[indexToDelete];
    if (recordingToDelete && recordingToDelete.url) {
      URL.revokeObjectURL(recordingToDelete.url); // Clean up object URL
      console.log("Revoked saved audio URL:", recordingToDelete.url);
    }
    setVoiceRecordings(prev => prev.filter((_, index) => index !== indexToDelete));
    console.log('Saved voice recording deleted');
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

  // Effect to clean up audio URL on unmount or change
  useEffect(() => {
    // Clean up Object URL when component unmounts or audioUrl changes
    // Clean up Object URL for the *current* audioUrl when component unmounts or it changes
    return () => {
      if (audioUrl) {
         URL.revokeObjectURL(audioUrl);
         console.log("Revoked current audio URL on cleanup:", audioUrl);
      }
    };
  }, [audioUrl]);

  // Effect to clean up all saved voice recording URLs on unmount
  useEffect(() => {
    return () => {
      console.log("Cleaning up saved voice recording URLs on unmount...");
      voiceRecordings.forEach(rec => {
        if (rec.url) {
          URL.revokeObjectURL(rec.url);
          console.log("Revoked saved audio URL:", rec.url);
        }
      });
    };
  }, [voiceRecordings]); // Dependency on the array itself

  // Effect to auto-start recording ONLY on initial mount
  useEffect(() => {
    if (!initialStartDoneRef.current) {
      console.log("Attempting initial auto-start recording...");
      startRecording(); // Call startRecording only on the first mount
      initialStartDoneRef.current = true; // Mark initial start as done
    }

    // Cleanup function remains the same: stop recording if component unmounts while recording
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        console.log("Stopping recording via unmount cleanup...");
        stopRecording(); // This will now also stop tracks via the modified stopRecording
      } else if (streamRef.current) {
        // If not recording but stream still exists (e.g., stopped manually before unmount)
        console.log("Cleaning up leftover stream via unmount cleanup...");
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        console.log("Cleaned up stream tracks on unmount.");
      }
      // Clear timer interval on unmount
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    }; // End of useEffect cleanup function
  }, [startRecording]); // Added startRecording to dependency array to fix React Hook warning

  // --- Title Editing Handlers (Adapted from Note Page) ---
  const handleTitleEdit = () => {
    setIsEditingTitle(true);
  };

  const handleTitleSave = () => {
    setIsEditingTitle(false);
    const trimmedTitle = noteTitle.trim();
    if (!trimmedTitle) {
        setNoteTitle('New Note'); // Reset if empty
    }
    // No backend update needed here, just finalize state
  };

  const handleTitleChange = (e) => {
    setNoteTitle(e.target.value);
  };

  const handleTitleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleTitleSave();
    } else if (e.key === 'Escape') {
      // Optionally revert title state if needed, for now just exit edit mode
      setIsEditingTitle(false);
      // To revert, you might need to store the original title temporarily
    }
  };
  // --- End Title Editing Handlers ---

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

    // --- Finalize recordings before sending ---
    let finalVoiceRecordings = [...voiceRecordings];
    if (audioBlob && audioUrl) {
      // If there's a current recording that wasn't moved yet (user didn't start another)
      const recordingName = `Recording ${finalVoiceRecordings.length + 1}.webm`;
      finalVoiceRecordings.push({ blob: audioBlob, url: audioUrl, name: recordingName });
      // Clear the current audio state as it's now part of the list to be sent
      setAudioBlob(null);
      setAudioUrl(null); // URL will be revoked by cleanup effect later
    }
    // --- End finalize recordings ---

    const formData = new FormData();
    formData.append('manualText', manualText);
    formData.append('noteTitle', noteTitle); // Send the title

    // Append voice recordings
    finalVoiceRecordings.forEach((recording, index) => {
      // Use a consistent naming convention the backend can parse
      formData.append(`voiceRecording_${index}`, recording.blob, recording.name);
    });

    // Append other attachments (files/images)
    const attachmentContextFlags = [];
    attachments.forEach((item, index) => {
      // Use a different key for general attachments vs voice recordings
      formData.append(`attachment_${index}`, item.file); // Append the File object
      attachmentContextFlags.push(item.includeInContext);
    });
    // Send context flags separately if needed, or combine logic on backend
    formData.append('attachmentContextFlags', JSON.stringify(attachmentContextFlags));

    console.log('Sending data to /api/notes/process...');

    try {
      // Get the session token to send for server-side auth
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        throw new Error('Could not get user session for authentication.');
      }
      const accessToken = session.access_token;

      // First, save the note with its attachments using the regular process endpoint
      const saveResponse = await fetch('/api/notes/process', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
        body: formData,
      });

      const saveResult = await saveResponse.json();

      if (!saveResponse.ok) {
        throw new Error(saveResult.error || `HTTP error! status: ${saveResponse.status}`);
      }

      console.log('Note saved successfully:', saveResult);
      
      // If we have a noteId, start the async processing
      if (saveResult.noteId) {
        // Call the async processing endpoint
        const processResponse = await fetch('/api/notes/process-async', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ noteId: saveResult.noteId }),
        });

        if (!processResponse.ok) {
          const processError = await processResponse.json();
          console.error('Async processing request failed:', processError);
          // We don't throw here as the note was already saved successfully
        } else {
          console.log('Async processing started successfully');
        }

        // Redirect to the newly created note page
        router.push(`/notes/${saveResult.noteId}`);
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

        {/* Title Section (Adapted from Note Page) */}
        <div className="note-title-container create-note-title-container"> {/* Added specific class */}
          {isEditingTitle ? (
            <input
              type="text"
              value={noteTitle}
              onChange={handleTitleChange}
              onBlur={handleTitleSave} // Save on blur
              onKeyDown={handleTitleKeyDown} // Save on Enter, cancel on Escape
              className="note-title-input" // Reuse style? Or create specific one
              autoFocus
            />
          ) : (
            <h2 className="header2 create-note-header2" onClick={handleTitleEdit} title="Click to edit title"> {/* Make header clickable */}
              {noteTitle}
              <button onClick={(e) => { e.stopPropagation(); handleTitleEdit(); }} className="edit-title-button" title="Edit Title" style={{ marginLeft: '10px', background: 'none', border: 'none', cursor: 'pointer' }}>
                <EditIcon />
              </button>
            </h2>
          )}
        </div>

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
            {/* Standard Audio Player - Conditionally render based on audioUrl */}
            {audioUrl && (
              <div className="audio-playback-controls"> {/* Wrapper div */}
                <audio controls src={audioUrl} preload="metadata" className="standard-audio-player"> {/* Standard player */}
                  Your browser does not support the audio element.
                </audio>
                {/* Delete Button for the *current* audio - Icon only */}
                {/* Apply styles to make it look like the list delete buttons */}
                <button
                  onClick={deleteCurrentAudio}
                  className="control-button delete-button attachment-delete-btn" // Keep classes for potential shared styles, but override specifics
                  title="Delete Current Recording"
                  style={{ background: 'none', border: 'none', padding: '0', marginLeft: '8px', cursor: 'pointer' }} // Inline styles to remove background/border and add spacing
                >
                  <TrashIcon />
                </button>
              </div>
            )}
          </div>
          {/* TODO: Add visual feedback for recording duration? */}
        </div>

        {/* Saved Voice Recordings List */}
        {voiceRecordings.length > 0 && (
          <div className="voice-recordings-section card"> {/* Use card style */}
            <h3 className="header3">Saved Recordings</h3>
            <ul className="attachment-list voice-recordings-list"> {/* Reuse attachment list style */}
              {voiceRecordings.map((rec, index) => (
                <li key={index} className="attachment-item voice-item"> {/* Reuse item style */}
                  <div className="attachment-info voice-info"> {/* Reuse info style */}
                    <MicrophoneIcon />
                    <span>{rec.name}</span>
                    {/* Basic HTML5 audio player */}
                    <audio controls src={rec.url} preload="metadata" className="voice-player">
                      Your browser does not support the audio element.
                    </audio>
                  </div>
                  <button
                    onClick={() => deleteVoiceRecording(index)}
                    className="control-button delete-button attachment-delete-btn" // Reuse delete button style
                    title="Delete Saved Recording"
                  >
                    <TrashIcon />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

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
                     <span className="checkmark">
                        {/* SVG checkmark icon */}
                        {item.includeInContext && <CheckCircle />}
                     </span>
                     <span className="label">Include in AI</span> {/* Using the styled label class from CSS */}
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