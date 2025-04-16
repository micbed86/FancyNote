'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import DashboardLayout from '../components/DashboardLayout';
import { CameraIcon, LockIcon, AccountIcon, EnvelopeIcon, TicketIcon } from '@/lib/icons'; // Added TicketIcon if needed by BillingCard, or remove if BillingCard handles its own icon
import BillingCard from './components/BillingCard';
import AiModelsCard from './components/AiModelsCard';
import './page.css'; // Import the new CSS file

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [activeTab, setActiveTab] = useState('profile'); // State for active tab

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
  });
  const [emailData, setEmailData] = useState({
    email: '',
  });
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [message, setMessage] = useState({ type: '', text: '' });
  const [emailMessage, setEmailMessage] = useState({ type: '', text: '' });
  const [passwordMessage, setPasswordMessage] = useState({ type: '', text: '' });
  // Add state for AI and Storage settings if they need to be fetched/saved
  // Initialize with default structure, values loaded in useEffect
  const defaultSystemPrompt = `You are a voice note revising assistant. Your task is to revise the transcript of a user's free-flow-thinking audio recording and transform it into an ordered and **well-organized** note containing all dictated content. Please, clean the **transcript** of all typical natural-speech errors and automatic transcription imperfections. Include insights that can be drawn from attachments enriching the context of the voice recording (if any). Don't mention the user - write as the user (in the first person). In response, return ONLY the **well-structured** note formatted in **markdown** (no greetings or comments from you) in the user's **preferred** language.\n\n<structure_of_the_note>\n## [Title of the note]\n\n### [Header of the abstract]\n[Abstract in bullet points]\n\n\n### [Header for the main/detailed content or description of the note]\n[The main/detailed content or description of the note nicely formatted in markdown (but headers of #### or lower)]\n\n\n### [Header for the summary]\n[Summary of the note in simple terms - casual, funny, sarcastic tone with a useful **perspective**]\n</structure_of_the_note>`;
  const [aiSettings, setAiSettings] = useState({
    apiKey: '',
    model: null,
    systemPrompt: '', // Initialize as empty, default applied later if needed
    language: 'pl'
  });
  const [aiSettingsMessage, setAiSettingsMessage] = useState({ type: '', text: '' }); // Separate message state for AI settings
  // FTP State Removed
  const [projectCredits, setProjectCredits] = useState(null); // State for project credits

  useEffect(() => {
    const checkUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push('/auth');
          return;
        }

        setUser(user);
        
        // Get user profile data
        const { data: profile } = await supabase
          .from('profiles')
          // Select all profile columns including JSONB ones
          .select('*')
          .eq('id', user.id)
          .single();

        if (profile) {
          setFormData({
            firstName: profile.first_name || '',
            lastName: profile.last_name || '',
          });
          setEmailData({
            email: user.email || ''
          });
          // Correctly load from ai_settings JSONB column
          if (profile.ai_settings && typeof profile.ai_settings === 'object') {
            const loadedSettings = {
              apiKey: profile.ai_settings.apiKey || '',
              model: profile.ai_settings.model || null, // Store the model ID
              // Load prompt if exists, otherwise keep initial empty (default applied in textarea if needed)
              systemPrompt: profile.ai_settings.systemPrompt || '',
              language: profile.ai_settings.language || 'pl' // Default to Polish if not set
            };
            setAiSettings(loadedSettings);
          } else {
             // Set defaults if ai_settings is missing or not an object
             const defaultSettings = {
               apiKey: '',
               model: null,
               systemPrompt: '', // Keep empty initially
               language: 'pl'
             };
             setAiSettings(defaultSettings);
          }
          // FTP State Population Removed
          setProjectCredits(profile.project_credits ?? 0); // Set project credits state

        } else {
          setFormData({
            firstName: '',
            lastName: '',
          });
          setEmailData({
            email: user.email || ''
          });
          // If profile doesn't exist yet, assume 0 credits initially
          setProjectCredits(0);
        }

        setLoading(false);
      } catch (error) {
        console.error('Error fetching user:', error);
        setLoading(false);
      }
    };
    
    checkUser();
  }, [router]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };

  const handleEmailChange = (e) => {
    const { name, value } = e.target;
    setEmailData({
      ...emailData,
      [name]: value
    });
  };

  const handleNameBlur = async (e) => {
    const { name, value } = e.target;
    if (formData[name] !== value) return; // No change
    
    setUpdating(true);
    try {
      // Update profile in the database
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          [name === 'firstName' ? 'first_name' : 'last_name']: value.trim(),
          updated_at: new Date()
        });

      if (error) throw error;
      
      // Show a brief success message
      setMessage({ type: 'success', text: `${name === 'firstName' ? 'First name' : 'Last name'} updated successfully!` });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      console.error(`Error updating ${name}:`, error);
      setMessage({ type: 'error', text: `Error updating ${name === 'firstName' ? 'first name' : 'last name'}. Please try again.` });
    } finally {
      setUpdating(false);
    }
  };

  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordData({
      ...passwordData,
      [name]: value
    });
  };



  const updateProfile = async (e) => {
    e.preventDefault();
    setUpdating(true);
    setMessage({ type: '', text: '' });

    try {
      // Update profile in the database
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          first_name: formData.firstName.trim(),
          last_name: formData.lastName.trim(),
          updated_at: new Date()
        });

      if (error) throw error;

      setMessage({ type: 'success', text: 'Profile updated successfully!' });
    } catch (error) {
      console.error('Error updating profile:', error);
      setMessage({ type: 'error', text: 'Error updating profile. Please try again.' });
    } finally {
      setUpdating(false);
    }
  };

  const updateEmail = async (e) => {
    e.preventDefault();
    setUpdating(true);
    setEmailMessage({ type: '', text: '' });

    try {
      // Update email if changed
      if (emailData.email !== user.email) {
        const { error: emailError } = await supabase.auth.updateUser({
          email: emailData.email
        });
        if (emailError) throw emailError;
        
        setEmailMessage({ 
          type: 'success', 
          text: 'Please check your new email inbox for a confirmation link. Your email will not be updated until you click the confirmation link.' 
        });
      } else {
        setEmailMessage({ type: 'info', text: 'No changes to email detected.' });
      }
    } catch (error) {
      console.error('Error updating email:', error);
      setEmailMessage({ type: 'error', text: 'Error updating email. Please try again.' });
    } finally {
      setUpdating(false);
    }
  };

  const updatePassword = async (e) => {
    e.preventDefault();
    setUpdating(true);
    setPasswordMessage({ type: '', text: '' });

    // Validate passwords
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'New passwords do not match.' });
      setUpdating(false);
      return;
    }

    try {
      // First verify the current password
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) {
        throw new Error('User not authenticated');
      }

      // Verify current password by attempting to sign in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: currentUser.email,
        password: passwordData.currentPassword
      });

      if (signInError) {
        setPasswordMessage({ type: 'error', text: 'Current password is incorrect.' });
        setUpdating(false);
        return;
      }

      // If current password is correct, proceed with password update
      const { error } = await supabase.auth.updateUser({
        password: passwordData.newPassword
      });

      if (error) throw error;

      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });

      setPasswordMessage({ type: 'success', text: 'Password updated successfully!' });
    } catch (error) {
      console.error('Error updating password:', error);
      
      // Extract specific error message if available
      let errorMessage = 'Error updating password. Please try again.';
      
      if (error.message) {
        // Check for specific error messages and provide user-friendly responses
        if (error.message.includes('different from the old password')) {
          errorMessage = 'New password must be different from your current password.';
        } else if (error.message.includes('Password should be')) {
          // Password strength requirements
          errorMessage = error.message;
        } else {
          // Use the API error message if available
          errorMessage = error.message;
        }
      }
      
      setPasswordMessage({ type: 'error', text: errorMessage });
    } finally {
      setUpdating(false);
    }
  };

  // Handler to update credits state when BillingCard reports success
  const handleCreditsUpdate = (newCredits) => {
  };

  // Handler for API Key and System Prompt changes
  const handleAiInputChange = (e) => {
    const { id, value } = e.target;
    setAiSettings(prev => ({ ...prev, [id]: value }));
    // Clear message on input change
    if (aiSettingsMessage.text) {
      setAiSettingsMessage({ type: '', text: '' });
    }
  };

  // FTP Handlers Removed (handleFtpSettingsChange, saveFtpSettings, testFtpConnection)

  // Function to save API Key, System Prompt, and Language (triggered by the main save button)
  const saveAiSettings = async () => {
    setUpdating(true);
    setAiSettingsMessage({ type: '', text: '' });
    
    // Log the state values being saved
    console.log('Attempting to save AI Settings:', {
      apiKey: aiSettings.apiKey,
      systemPrompt: aiSettings.systemPrompt,
      language: aiSettings.language
    });

    try {
      // Fetch current settings ONLY to merge them with the fields being updated
      const { data: currentProfile, error: fetchError } = await supabase
        .from('profiles')
        .select('ai_settings')
        .eq('id', user.id)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') { // Ignore 'not found' error if profile/settings don't exist yet
         console.error("Error fetching current profile before saving AI settings:", fetchError);
         throw new Error('Could not fetch current settings before saving.');
      }

      const currentDbSettings = currentProfile?.ai_settings || {};

      // Prepare the update object: merge existing settings with ONLY the fields from this form
      const settingsToUpdate = {
        ...currentDbSettings, // Keep existing settings (like model)
        apiKey: aiSettings.apiKey, // Update API Key from state
        systemPrompt: aiSettings.systemPrompt, // Update System Prompt from state
        language: aiSettings.language, // Update language from state
        updated_at: new Date().toISOString() // Update timestamp
      };
      
      // Ensure nested updated_at is handled correctly if it exists
      if (settingsToUpdate.ai_settings && settingsToUpdate.ai_settings.updated_at) {
         delete settingsToUpdate.ai_settings.updated_at;
      }
      if (currentDbSettings.updated_at) {
         delete settingsToUpdate.updated_at; // Remove potentially nested old one
         settingsToUpdate.updated_at = new Date().toISOString(); // Add top-level one
      }


      const { error } = await supabase
        .from('profiles')
        .update({
          ai_settings: settingsToUpdate // Update the whole JSONB column
        })
        .eq('id', user.id);

      if (error) {
        console.error("Supabase update error:", error); // Log Supabase error
        throw error;
      }
      
      setAiSettingsMessage({ type: 'success', text: 'AI settings saved successfully!' });
      setTimeout(() => setAiSettingsMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      setAiSettingsMessage({ type: 'error', text: 'Failed to save AI settings.' });
      console.error('Error saving AI settings:', error);
    } finally {
      setUpdating(false);
    }
  };

  // Function to handle auto-saving model selection from AiModelsCard
  const handleModelUpdate = async (selectedModelId) => {
     console.log('Model selected, attempting to save:', selectedModelId);
     // Update local state immediately for responsiveness
     setAiSettings(prev => ({ ...prev, model: selectedModelId }));
     
     // Indicate loading specifically for this action if possible, else use general updating
     setUpdating(true);
     setAiSettingsMessage({ type: '', text: '' });

     try {
       // Fetch current settings to merge ONLY the model ID
       const { data: currentProfile, error: fetchError } = await supabase
         .from('profiles')
         .select('ai_settings')
         .eq('id', user.id)
         .single();

       // Handle case where profile or ai_settings might not exist yet
       if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 = row not found, which is okay if we're creating settings
          console.error("Error fetching current profile before saving model:", fetchError);
          // Optionally revert optimistic update:
          // setAiSettings(prev => ({ ...prev, model: currentProfile?.ai_settings?.model || null }));
          throw new Error('Could not fetch current settings before saving model.');
       }

       const currentDbSettings = currentProfile?.ai_settings || {};
       
       // Prepare the update object: merge existing settings with ONLY the new model ID
       const settingsToUpdate = {
         ...currentDbSettings, // Keep existing apiKey, systemPrompt, language etc.
         model: selectedModelId, // Update ONLY the model ID
         updated_at: new Date().toISOString() // Update timestamp
       };

       // Ensure nested updated_at is handled correctly
       if (settingsToUpdate.ai_settings && settingsToUpdate.ai_settings.updated_at) {
          delete settingsToUpdate.ai_settings.updated_at;
       }
       if (currentDbSettings.updated_at) {
          delete settingsToUpdate.updated_at; // Remove potentially nested old one
          settingsToUpdate.updated_at = new Date().toISOString(); // Add top-level one
       }

       const { error } = await supabase
         .from('profiles')
         .update({ ai_settings: settingsToUpdate }) // Update the whole JSONB column
         .eq('id', user.id);

       if (error) throw error;
       
       setAiSettingsMessage({ type: 'success', text: 'Model selection saved!' });
       setTimeout(() => setAiSettingsMessage({ type: '', text: '' }), 3000);

     } catch (error) {
       setAiSettingsMessage({ type: 'error', text: 'Failed to save model selection.' });
       console.error('Error saving model selection:', error);
       // Optionally revert local state if save fails
       // const originalModel = currentProfile?.ai_settings?.model || null;
       // setAiSettings(prev => ({ ...prev, model: originalModel }));
     } finally {
       setUpdating(false);
     }
  };

  // handleCreditsUpdate might need adjustment if BillingCard modifies projectCredits directly
  // Removed duplicate handleCreditsUpdate function

  if (loading) {
    return (
      <DashboardLayout pageTitle="Account">
        <div className="loading">Loading...</div>
      </DashboardLayout>
    );
  }

  // Add an explicit check for user object before rendering main content
  if (!user) {
    // This should ideally be covered by the loading state, but added as a safeguard
    return (
      <DashboardLayout pageTitle="Account">
        <div className="loading">Authenticating...</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout pageTitle="Account">
      <div className="account-container">
        {/* Tab Navigation */}
        <div className="tabs-container">
          <div className="tabs">
            <div className={`tab ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>Profile & Billing</div>
            <div className={`tab ${activeTab === 'ai' ? 'active' : ''}`} onClick={() => setActiveTab('ai')}>AI</div>
            {/* FTP Tab Removed */}
            <div className={`tab ${activeTab === 'security' ? 'active' : ''}`} onClick={() => setActiveTab('security')}>Security</div>
          </div>
        </div>

        {/* Tab Content */}
        <div className={`tab-content ${activeTab === 'profile' ? 'active' : ''}`}>
          {/* Profile Information Section */}
          <div className="account-section">
            <h2 className="section-title">Profile Information</h2>
            <div className="user-name-display">
              <h2 className="user-full-name">{formData.firstName} {formData.lastName}</h2>
            </div>
            {/* Use general message for profile updates */}
            {message.text && activeTab === 'profile' && <div className={`message ${message.type}`}>{message.text}</div>}
            <form className="account-form">
              <div style={{ display: 'flex', gap: '20px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label htmlFor="firstName"><AccountIcon className="form-icon" />First Name</label>
                  <input type="text" id="firstName" name="firstName" value={formData.firstName} onChange={handleInputChange} onBlur={handleNameBlur} className="account-input" placeholder="Your first name" />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label htmlFor="lastName"><AccountIcon className="form-icon" />Last Name</label>
                  <input type="text" id="lastName" name="lastName" value={formData.lastName} onChange={handleInputChange} onBlur={handleNameBlur} className="account-input" placeholder="Your last name" />
                </div>
              </div>
            </form>
          </div>
          {/* Billing Section */}
          <BillingCard projectCredits={projectCredits} onCreditsUpdate={handleCreditsUpdate} />
        </div>

        <div className={`tab-content ${activeTab === 'ai' ? 'active' : ''}`}>
          <h2 className="section-title">AI Settings</h2>
          {/* Use dedicated AI settings message */}
          {aiSettingsMessage.text && <div className={`message ${aiSettingsMessage.type}`}>{aiSettingsMessage.text}</div>}
          <form className="account-form" onSubmit={(e) => { e.preventDefault(); saveAiSettings(); }}>
             <div className="form-group">
                <label htmlFor="apiKey">Openrouter API Key</label>
                <input type="password" id="apiKey" className="account-input" placeholder="sk-or-..." aria-label="Openrouter API Key" value={aiSettings.apiKey} onChange={handleAiInputChange} />
             </div>
             <div className="form-group">
                <label htmlFor="systemPrompt">System Prompt for AI Note Structuring</label>
                <textarea
                  id="systemPrompt"
                  className="account-input"
                  style={{ minHeight: '150px', resize: 'vertical' }}
                  aria-label="System Prompt for AI"
                  placeholder={defaultSystemPrompt} // Use placeholder for the default text
                  value={aiSettings.systemPrompt} // Bind value directly to state
                  onChange={handleAiInputChange}
                ></textarea>
                <p className="input-help">Define how the AI should structure and format your notes. Leave empty to use the default prompt shown as placeholder text. The system will automatically add language instructions based on your language selection.</p>
             </div>
             <div className="form-group">
                <label htmlFor="language">Language</label>
                <select 
                  id="language" 
                  className="account-input" 
                  value={aiSettings.language} 
                  onChange={handleAiInputChange}
                  aria-label="Language"
                >
                  <option value="pl">Polish</option>
                  <option value="en">English</option>
                  <option value="it">Italian</option>
                  <option value="de">German</option>
                </select>
                <p className="input-help">Select the language for your notes</p>
             </div>
             <button type="submit" className="account-btn" disabled={updating}>
               {updating ? 'Saving...' : 'Save AI Settings'}
             </button>
          </form>
          {/* Pass initial model ID and the update handler */}
          <AiModelsCard
             initialModelId={aiSettings.model}
             onModelSelect={handleModelUpdate}
          />
        </div>

        {/* FTP Tab Content Removed */}

        <div className={`tab-content ${activeTab === 'security' ? 'active' : ''}`}>
          {/* Email Section */}
          <div className="account-section">
            <h2 className="section-title">Email Address</h2>
            {emailMessage.text && <div className={`message ${emailMessage.type}`}>{emailMessage.text}</div>}
            <form onSubmit={updateEmail} className="account-form">
              <div className="form-group">
                <label htmlFor="email"><EnvelopeIcon className="form-icon" />Email Address</label>
                <input type="email" id="email" name="email" value={emailData.email} onChange={handleEmailChange} className="account-input" placeholder="Your email address" />
              </div>
              <button type="submit" className="account-btn" disabled={updating}>
                {updating ? 'Updating...' : 'Update Email'}
              </button>
              <p className="input-help">A confirmation link will be sent to verify your new email</p>
            </form>
          </div>
          {/* Password Section */}
          <div className="account-section">
            <h2 className="section-title">Change Password</h2>
            {passwordMessage.text && <div className={`message ${passwordMessage.type}`}>{passwordMessage.text}</div>}
            <form onSubmit={updatePassword} className="account-form">
              <div className="form-group">
                <label htmlFor="currentPassword"><LockIcon className="form-icon" />Current Password</label>
                <input type="password" id="currentPassword" name="currentPassword" value={passwordData.currentPassword} onChange={handlePasswordChange} className="account-input" placeholder="Your current password" required />
              </div>
              <div className="form-group">
                <label htmlFor="newPassword"><LockIcon className="form-icon" />New Password</label>
                <input type="password" id="newPassword" name="newPassword" value={passwordData.newPassword} onChange={handlePasswordChange} className="account-input" placeholder="Your new password" required />
              </div>
              <div className="form-group">
                <label htmlFor="confirmPassword"><LockIcon className="form-icon" />Confirm New Password</label>
                <input type="password" id="confirmPassword" name="confirmPassword" value={passwordData.confirmPassword} onChange={handlePasswordChange} className="account-input" placeholder="Confirm your new password" required />
              </div>
              <button type="submit" className="account-btn" disabled={updating}>
                {updating ? 'Updating...' : 'Change Password'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}