'use client'; // This component uses client-side hooks

import { useState, useRef, useEffect, useCallback, Suspense } from 'react'; // Added Suspense (though not used directly here)
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
// Note: Assuming DashboardLayout is not needed *inside* this client component if page.js handles it.
// import DashboardLayout from '../components/DashboardLayout';
import { FileIcon, ImageIcon, CameraIcon, MicrophoneIcon, TrashIcon, EditIcon, CheckCircle } from '@/lib/icons';
import './create-note.css';

// Renamed the function to reflect its role
export default function CreateNoteForm() {
  const router = useRouter();
  const searchParams = useSearchParams(); // Get search params
  const updateId = searchParams.get('updateId'); // Check for updateId

  // All state and refs moved here
  const [manualText, setManualText] = useState('');
  const [noteTitle, setNoteTitle] = useState('New Note');
  const [attachments, setAttachments] = useState([]);
  const [voiceRecordings, setVoiceRecordings] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const audioPlayerRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processError, setProcessError] = useState('');
  const cameraInputRef = useRef(null);
  const initialStartDoneRef = useRef(false);
  const [isLoadingCredits, setIsLoadingCredits] = useState(true);

  // --- Credit Check Effect ---
  useEffect(() => {
    const checkCreditsAndRedirect = async () => {
      setIsLoadingCredits(true);
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (userError || !user) {
          console.error('User not authenticated, redirecting to auth.');
          router.push('/auth');
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('project_credits')
          .eq('id', user.id)
          .single();

        if (profileError) {
          console.error('Error fetching user profile:', profileError);
        } else if (profile && profile.project_credits === 0) {
          console.log('User has 0 credits, redirecting to notes page.');
          alert('You have no credits remaining. Please top up to create new notes.');
          router.push('/notes');
          return;
        }
        console.log('User has credits or profile fetch failed, allowing access.');

      } catch (error) {
        console.error('Unexpected error during credit check:', error);
      } finally {
        setIsLoadingCredits(false);
      }
    };

    checkCreditsAndRedirect();
  }, [router]);
  // --- End Credit Check Effect ---

  // All handlers moved here
  const handleAddFile = (event) => {
    const newFiles = Array.from(event.target.files);
    setAttachments(prev => [...prev, ...newFiles.map(file => ({ file, includeInContext: true }))]);
    event.target.value = null;
  };

  const handleAddPhoto = (event) => {
    const newPhotos = Array.from(event.target.files);
    setAttachments(prev => [...prev, ...newPhotos.map(file => ({ file, includeInContext: true }))]);
    event.target.value = null;
  };

  const handleTakePhoto = () => {
    cameraInputRef.current?.click();
  };

  const handlePhotoCaptured = (event) => {
    const capturedPhoto = event.target.files?.[0];
    if (capturedPhoto) {
      console.log('Photo captured:', capturedPhoto);
      setAttachments(prev => [...prev, { file: capturedPhoto, includeInContext: true }]);
    }
    event.target.value = null;
  };

  const startRecording = useCallback(async () => {
    if (audioBlob && audioUrl) {
      const recordingName = `Recording ${voiceRecordings.length + 1}.webm`;
      setVoiceRecordings(prev => [...prev, { blob: audioBlob, url: audioUrl, name: recordingName }]);
      setAudioBlob(null);
      setAudioUrl(null);
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      console.log('Recording started');
      setRecordingTime(0);
      timerIntervalRef.current = setInterval(() => {
        setRecordingTime(prevTime => prevTime + 1);
      }, 1000);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Could not access microphone. Please check permissions.');
      setIsRecording(false);
    }
  }, [audioBlob, audioUrl, voiceRecordings.length]);

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      console.log('Recording stopped');
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
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

  const deleteCurrentAudio = () => {
    setAudioBlob(null);
    setAudioUrl(null);
    setIsPlaying(false);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      console.log("Revoked current audio URL:", audioUrl);
    }
    console.log('Current audio deleted');
  };

  const deleteVoiceRecording = (indexToDelete) => {
    const recordingToDelete = voiceRecordings[indexToDelete];
    if (recordingToDelete && recordingToDelete.url) {
      URL.revokeObjectURL(recordingToDelete.url);
      console.log("Revoked saved audio URL:", recordingToDelete.url);
    }
    setVoiceRecordings(prev => prev.filter((_, index) => index !== indexToDelete));
    console.log('Saved voice recording deleted');
  };

  const removeAttachment = (indexToRemove) => {
    setAttachments(prev => prev.filter((_, index) => index !== indexToRemove));
  };

  const toggleAttachmentContext = (indexToToggle) => {
    setAttachments(prev => prev.map((item, index) =>
      index === indexToToggle ? { ...item, includeInContext: !item.includeInContext } : item
    ));
  };

  useEffect(() => {
    return () => {
      if (audioUrl) {
         URL.revokeObjectURL(audioUrl);
         console.log("Revoked current audio URL on cleanup:", audioUrl);
      }
    };
  }, [audioUrl]);

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
  }, [voiceRecordings]);

  useEffect(() => {
    if (!initialStartDoneRef.current) {
      console.log("Attempting initial auto-start recording...");
      startRecording();
      initialStartDoneRef.current = true;
    }

    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        console.log("Stopping recording via unmount cleanup...");
        stopRecording();
      } else if (streamRef.current) {
        console.log("Cleaning up leftover stream via unmount cleanup...");
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        console.log("Cleaned up stream tracks on unmount.");
      }
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [startRecording]);

  const handleTitleEdit = () => {
    setIsEditingTitle(true);
  };

  const handleTitleSave = () => {
    setIsEditingTitle(false);
    const trimmedTitle = noteTitle.trim();
    if (!trimmedTitle) {
        setNoteTitle('New Note');
    }
  };

  const handleTitleChange = (e) => {
    setNoteTitle(e.target.value);
  };

  const handleTitleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleTitleSave();
    } else if (e.key === 'Escape') {
      setIsEditingTitle(false);
    }
  };

  const handleProcessNote = async () => {
    setIsProcessing(true);
    setProcessError('');

    if (!manualText && !audioBlob && attachments.length === 0 && !updateId) {
        setProcessError('Please add some content (text, recording, or attachment) before processing.');
        setIsProcessing(false);
        return;
    }

    // --- Finalize recordings before sending ---
    let finalVoiceRecordings = [...voiceRecordings];
    if (audioBlob && audioUrl) {
      const recordingName = `Recording ${finalVoiceRecordings.length + 1}.webm`;
      finalVoiceRecordings.push({ blob: audioBlob, url: audioUrl, name: recordingName });
      setAudioBlob(null);
      setAudioUrl(null);
    }
    // --- End finalize recordings ---

    const formData = new FormData();
    formData.append('manualText', manualText);
    formData.append('noteTitle', noteTitle);

    finalVoiceRecordings.forEach((recording, index) => {
      formData.append(`voiceRecording_${index}`, recording.blob, recording.name);
    });

    const attachmentContextFlags = [];
    attachments.forEach((item, index) => {
      formData.append(`attachment_${index}`, item.file);
      attachmentContextFlags.push(item.includeInContext);
    });
    formData.append('attachmentContextFlags', JSON.stringify(attachmentContextFlags));

    // --- Conditional Logic for Update vs Create ---
    if (updateId) {
      // --- UPDATE FLOW ---
      formData.append('noteId', updateId);
      console.log(`Sending data to /api/notes/update-process for note ID: ${updateId}...`);
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session) throw new Error('Could not get user session.');
        const accessToken = session.access_token;

        const updateResponse = await fetch('/api/notes/update-process', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}` },
          body: formData,
        });
        const updateResult = await updateResponse.json();
        if (!updateResponse.ok) throw new Error(updateResult.error || `HTTP error! status: ${updateResponse.status}`);
        console.log('Note updated successfully:', updateResult);
        router.push(`/notes/${updateId}`);
      } catch (error) {
        console.error('Error updating note:', error);
        setProcessError(`Failed to update note: ${error.message}`);
      } finally {
        setIsProcessing(false);
      }
    } else {
      // --- CREATE FLOW ---
      console.log('Sending data to /api/notes/process...');
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session) throw new Error('Could not get user session.');
        const accessToken = session.access_token;

        const saveResponse = await fetch('/api/notes/process', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}` },
          body: formData,
        });
        const saveResult = await saveResponse.json();
        if (!saveResponse.ok) throw new Error(saveResult.error || `HTTP error! status: ${saveResponse.status}`);
        console.log('Note saved successfully:', saveResult);

        if (saveResult.noteId) {
          const processResponse = await fetch('/api/notes/process-async', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ noteId: saveResult.noteId }),
          });
          if (!processResponse.ok) {
            const processErrorResult = await processResponse.json();
            console.error('Async processing request failed:', processErrorResult);
          } else {
            console.log('Async processing started successfully');
          }
          router.push('/notes');
        } else {
          router.push('/notes');
        }
      } catch (error) {
        console.error('Error processing note:', error);
        setProcessError(`Failed to process note: ${error.message}`);
      } finally {
        setIsProcessing(false);
      }
    }
  };

  // Render loading state while checking credits
  if (isLoadingCredits) {
    return (
      <div className="loading-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <p>Checking your credits...</p>
      </div>
    );
  }

  // All JSX rendering moved here
  return (
    <div className="create-note-container">

      {/* Title Section */}
      <div className="note-title-container create-note-title-container">
        {isEditingTitle ? (
          <input
            type="text"
            value={noteTitle}
            onChange={handleTitleChange}
            onBlur={handleTitleSave}
            onKeyDown={handleTitleKeyDown}
            className="note-title-input"
            autoFocus
          />
        ) : (
          <h2 className="header2 create-note-header2" onClick={handleTitleEdit} title="Click to edit title">
            {noteTitle}
            <button onClick={(e) => { e.stopPropagation(); handleTitleEdit(); }} className="edit-title-button" title="Edit Title" style={{ marginLeft: '10px', background: 'none', border: 'none', cursor: 'pointer' }}>
              <EditIcon />
            </button>
          </h2>
        )}
      </div>

      {/* Recording Section */}
      <div className="recording-section card">
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
          {isRecording && (
            <span className="recording-timer">
              {Math.floor(recordingTime / 60).toString().padStart(2, '0')}:
              {(recordingTime % 60).toString().padStart(2, '0')}
            </span>
          )}
          {audioUrl && (
            <div className="audio-playback-controls">
              <audio controls src={audioUrl} preload="metadata" className="standard-audio-player">
                Your browser does not support the audio element.
              </audio>
              <button
                onClick={deleteCurrentAudio}
                className="control-button delete-button attachment-delete-btn"
                title="Delete Current Recording"
                style={{ background: 'none', border: 'none', padding: '0', marginLeft: '8px', cursor: 'pointer' }}
              >
                <TrashIcon />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Saved Voice Recordings List */}
      {voiceRecordings.length > 0 && (
        <div className="voice-recordings-section card">
          <h3 className="header3">Saved Recordings</h3>
          <ul className="attachment-list voice-recordings-list">
            {voiceRecordings.map((rec, index) => (
              <li key={index} className="attachment-item voice-item">
                <div className="attachment-info voice-info">
                  <MicrophoneIcon />
                  <span>{rec.name}</span>
                  <audio controls src={rec.url} preload="metadata" className="voice-player">
                    Your browser does not support the audio element.
                  </audio>
                </div>
                <button
                  onClick={() => deleteVoiceRecording(index)}
                  className="control-button delete-button attachment-delete-btn"
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
      <div className="manual-text-section card">
         <h3 className="header3">Add Text</h3>
         <textarea
           className="textarea"
           placeholder="Add your thoughts, ideas, or details here..."
           value={manualText}
           onChange={(e) => setManualText(e.target.value)}
         />
      </div>

      {/* Attachments Section */}
      <div className="attachments-section card">
        <div className="attachments-header">
          <h3 className="header3">Add Attachments</h3>
          <div className="attachment-actions">
            <input type="file" id="fileInput" style={{ display: 'none' }} onChange={handleAddFile} multiple />
            <input type="file" id="photoInput" accept="image/*" style={{ display: 'none' }} onChange={handleAddPhoto} multiple />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
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
          {attachments.map((item, index) => (
            <li key={index} className="attachment-item">
              <div className="attachment-info">
                {item.file.type.startsWith('image/') ? <ImageIcon /> : <FileIcon />}
                <span className="attachment-name" title={item.file.name}>{item.file.name}</span>
                <span className="attachment-size">({(item.file.size / 1024).toFixed(1)} KB)</span>
              </div>
              <div className="attachment-item-actions">
                 <label className="checkbox-wrapper context-checkbox" title="Include in AI context">
                   <input
                     type="checkbox"
                     checked={item.includeInContext}
                     onChange={() => toggleAttachmentContext(index)}
                   />
                   <span className="checkmark">
                      {item.includeInContext && <CheckCircle />}
                   </span>
                   <span className="label">Include in AI</span>
                 </label>
                 <button
                   onClick={() => removeAttachment(index)}
                   className="control-button delete-button attachment-delete-btn"
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
          disabled={isProcessing || isRecording}
        >
          {isProcessing ? 'Processing...' : (updateId ? 'Process Update' : 'Process Note')}
        </button>
      </div>

    </div>
  );
}