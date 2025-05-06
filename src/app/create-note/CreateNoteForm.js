'use client'; // This component uses client-side hooks

import { useState, useRef, useEffect, useCallback, Suspense } from 'react'; // Added Suspense (though not used directly here)
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
// Note: Assuming DashboardLayout is not needed *inside* this client component if page.js handles it.
// import DashboardLayout from '../components/DashboardLayout';
import { FileIcon, ImageIcon, CameraIcon, MicrophoneIcon, TrashIcon, EditIcon, CheckCircle, PlusIcon, GlobeIcon, XIcon, SaveIcon, BotIcon, BotOffIcon } from '@/lib/icons'; // Added PlusIcon, GlobeIcon, XIcon, SaveIcon, BotIcon, BotOffIcon
import './create-note.css';

// Helper function to format file size (copied for consistency if needed elsewhere)
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Renamed the function to reflect its role
export default function CreateNoteForm() {
  const router = useRouter();
  // Removed useNotifications hook - Notifications are handled via backend DB entries
  const searchParams = useSearchParams(); // Get search params
  const updateId = searchParams.get('updateId'); // Check for updateId

  // State related to Web URLs
  const [webUrls, setWebUrls] = useState([]); // State for added URLs
  const [currentUrl, setCurrentUrl] = useState(''); // State for the URL input field
  console.log('CreateNoteForm rendering, currentUrl declared:', typeof currentUrl, currentUrl); // Add console log for debugging

  // Other state and refs
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
  const [isSavingNoAi, setIsSavingNoAi] = useState(false); // New state for "No AI" save
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

  // --- Web URL Handlers ---
  const handleAddWebUrl = () => {
    const trimmedUrl = currentUrl.trim();
    // Basic validation: check if not empty and maybe looks like a URL
    if (trimmedUrl && (trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://'))) {
      // Simple check for plausible URL structure (very basic)
      try {
        new URL(trimmedUrl);
        if (!webUrls.includes(trimmedUrl)) { // Avoid duplicates
          setWebUrls(prev => [...prev, trimmedUrl]);
        }
        setCurrentUrl(''); // Clear input field
      } catch (_) {
        alert('Please enter a valid URL.');
      }
    } else {
      // Optionally show an error message for invalid URL format
      alert('Please enter a valid URL starting with http:// or https://');
    }
  };

  const handleRemoveWebUrl = (indexToRemove) => {
    setWebUrls(prev => prev.filter((_, index) => index !== indexToRemove));
  };
  // --- End Web URL Handlers ---


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

    // Combine current URL input with the list, if current URL is not empty
    let finalUrlList = [...webUrls];
    const trimmedCurrentUrl = currentUrl.trim();
    if (trimmedCurrentUrl && (trimmedCurrentUrl.startsWith('http://') || trimmedCurrentUrl.startsWith('https://'))) {
        if (!finalUrlList.includes(trimmedCurrentUrl)) {
            finalUrlList.push(trimmedCurrentUrl);
        }
        setCurrentUrl(''); // Clear input after adding it to the list for processing
    }

    if (!manualText && !audioBlob && attachments.length === 0 && finalUrlList.length === 0 && !updateId) {
        setProcessError('Please add some content (text, recording, attachment, or URL) before processing.');
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
    formData.append('webUrls', JSON.stringify(finalUrlList)); // Add web URLs

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
        // TODO: Handle scrapingErrors from updateResult if the API returns them
        if (updateResult.scrapingErrors && updateResult.scrapingErrors.length > 0) {
          // Backend should create DB notification. Log warning here.
          console.warn("Scraping errors occurred (backend should notify):", updateResult.scrapingErrors);
        }
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

        // TODO: Handle scrapingErrors from saveResult if the API returns them
        if (saveResult.scrapingErrors && saveResult.scrapingErrors.length > 0) {
           // Backend should create DB notification. Log warning here.
          console.warn("Scraping errors occurred (backend should notify):", saveResult.scrapingErrors);
          // Continue processing even if scraping had issues
        }

        if (saveResult.noteId) {
          // Trigger async processing only if the initial save was okay
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

  const handleSaveNoAiNote = async () => {
    setIsSavingNoAi(true);
    setProcessError('');

    let finalUrlList = [...webUrls];
    const trimmedCurrentUrl = currentUrl.trim();
    if (trimmedCurrentUrl && (trimmedCurrentUrl.startsWith('http://') || trimmedCurrentUrl.startsWith('https://'))) {
        if (!finalUrlList.includes(trimmedCurrentUrl)) {
            finalUrlList.push(trimmedCurrentUrl);
        }
        setCurrentUrl('');
    }

    if (!manualText && !audioBlob && attachments.length === 0 && finalUrlList.length === 0 && voiceRecordings.length === 0 && !updateId) {
        setProcessError('Please add some content (text, recording, attachment, or URL) before saving.');
        setIsSavingNoAi(false);
        return;
    }

    let finalVoiceRecordings = [...voiceRecordings];
    if (audioBlob && audioUrl) {
      const recordingName = `Recording ${finalVoiceRecordings.length + 1}.webm`;
      finalVoiceRecordings.push({ blob: audioBlob, url: audioUrl, name: recordingName });
      // Don't clear audioBlob/audioUrl here yet, might be needed for transcription decision
    }

    let transcribeAudio = false;
    if (finalVoiceRecordings.length > 0 || audioBlob) {
      if (window.confirm("You have recorded or added audio. Do you want to transcribe the audio content and save it as a .txt attachment?")) {
        transcribeAudio = true;
      }
    }

    // If audioBlob was present and now processed (or decision made), clear it
    if (audioBlob && audioUrl) {
        setAudioBlob(null);
        setAudioUrl(null);
    }

    const formData = new FormData();
    formData.append('manualText', manualText);
    formData.append('noteTitle', noteTitle);
    formData.append('transcribeAudio', transcribeAudio.toString());
    formData.append('webUrls', JSON.stringify(finalUrlList));

    finalVoiceRecordings.forEach((recording, index) => {
      formData.append(`voiceRecording_${index}`, recording.blob, recording.name);
    });

    attachments.forEach((item, index) => {
      // For no-AI save, all attachments are included directly, context flag is irrelevant for this type of save
      formData.append(`attachment_${index}`, item.file);
    });
    // No attachmentContextFlags needed for no-AI save as AI context is not used for content processing

    // This function is for creating new notes with "no-AI" processing.
    // If an updateId exists, this button shouldn't ideally be the primary way to "update without AI",
    // but for simplicity, we'll prevent "no-AI" save if it's an update scenario for now,
    // or define a separate logic/endpoint if "update with no-AI processing" is needed.
    // For now, let's assume this is for new notes or a simplified update.
    // We will use a new endpoint.
    if (updateId) {
        formData.append('noteId', updateId);
        console.log(`Sending data with noteId ${updateId} to /api/notes/save-no-ai for an update...`);
    } else {
        console.log('Sending data to /api/notes/save-no-ai for a new note...');
    }
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) throw new Error('Could not get user session.');
      const accessToken = session.access_token;

      // IMPORTANT: A new API route /api/notes/save-no-ai needs to be created.
      // This route will handle:
      // 1. Saving the note with raw content.
      // 2. If transcribeAudio is true, transcribing audio and saving as .txt attachments.
      // 3. Generating title and excerpt ONLY.
      // 4. Saving all attachments.
      const response = await fetch('/api/notes/save-no-ai', { // NEW API ENDPOINT
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}` }, // No 'Content-Type' for FormData
        body: formData,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP error! status: ${response.status}`);
      
      console.log('Note saved (no-AI) successfully:', result);
      if (result.scrapingErrors && result.scrapingErrors.length > 0) {
        console.warn("Scraping errors occurred (backend should notify):", result.scrapingErrors);
      }
      // Navigate to the notes page or the newly created note if ID is returned
      router.push(result.noteId ? `/notes/${result.noteId}` : '/notes');

    } catch (error) {
      console.error('Error saving note (no-AI):', error);
      setProcessError(`Failed to save note: ${error.message}`);
    } finally {
      setIsSavingNoAi(false);
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
{/* Web URL Input Section */}
      <div className="web-url-section card">
        <h3 className="header3">Add Web Page Content</h3>
        <div className="web-url-input-container">
          <GlobeIcon /> {/* Icon for visual cue */}
          <input
            type="url"
            className="input web-url-input"
            placeholder="Enter web page URL (e.g., https://...)"
            value={currentUrl}
            onChange={(e) => setCurrentUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddWebUrl()} // Add on Enter key press
          />
          <button
            onClick={handleAddWebUrl}
            className="standard-button button-secondary add-url-button"
            title="Add URL to list"
          >
            <PlusIcon />
          </button>
        </div>
        {webUrls.length > 0 && (
          <ul className="attachment-list web-url-list">
            {webUrls.map((url, index) => (
              <li key={index} className="attachment-item web-url-item">
                <div className="attachment-info web-url-info">
                  <GlobeIcon />
                  <a href={url} target="_blank" rel="noopener noreferrer" title={url}>{url}</a> {/* Make URL clickable */}
                </div>
                <button
                  onClick={() => handleRemoveWebUrl(index)}
                  className="control-button delete-button attachment-delete-btn"
                  title="Remove URL"
                >
                  <XIcon /> {/* Use XIcon for removing */}
                </button>
              </li>
            ))}
          </ul>
        )}
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
          <TrashIcon className="button-icon" style={{ marginRight: '5px' }} /> Cancel
        </button>
        <button
          className="standard-button button-secondary" // Or choose another style
          onClick={handleSaveNoAiNote}
          disabled={isProcessing || isSavingNoAi || isRecording}
          title="Save note with minimal AI (title/excerpt only), transcribes audio if confirmed"
          style={{ marginLeft: '10px' }} // Add some spacing
        >
          {isSavingNoAi ? (
            'Saving...'
          ) : (
            <>
              <BotOffIcon className="button-icon" style={{ marginRight: '5px' }} />
              Just Save
            </>
          )}
        </button>
        <button
          className="standard-button button-primary"
          onClick={handleProcessNote}
          disabled={isProcessing || isSavingNoAi || isRecording}
        >
          <BotIcon className="button-icon" style={{ marginRight: '5px' }} /> {isProcessing ? 'Processing...' : (updateId ? 'Process Update' : 'Process Note')}
        </button>
      </div>

    </div>
  );
}