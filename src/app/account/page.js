'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import DashboardLayout from '../components/DashboardLayout';
import { CameraIcon, LockIcon, AccountIcon, EnvelopeIcon, TicketIcon } from '@/lib/icons'; // Added TicketIcon if needed by BillingCard, or remove if BillingCard handles its own icon
import BillingCard from './components/BillingCard'; // Import the new component
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
  const [aiSettings, setAiSettings] = useState({ apiKey: '', model: 'google/gemma-3-27b-it:free', systemPrompt: '' });
  // Renamed state to reflect FTP and added fields
  const [ftpSettings, setFtpSettings] = useState({
    host: '',
    port: 21, // Default FTP port
    user: '',
    password: '', // Only used for testing, not saved directly
    remote_path: '',
    use_passive: true // Default to passive mode
  });
  const [ftpTestMessage, setFtpTestMessage] = useState({ type: '', text: '' });
  const [testingFtp, setTestingFtp] = useState(false);
  const [projectCredits, setProjectCredits] = useState(null); // State for project credits

  // First useEffect: Check authentication and set user state
  useEffect(() => {
    const checkUser = async () => {
      setLoading(true); // Ensure loading is true initially
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser(); // Rename to avoid conflict
        if (!authUser) {
          router.push('/auth');
          return; // Exit early if no user
        }
        setUser(authUser); // Set the user state
        // Don't set loading false here; wait for profile data in the next effect
      } catch (error) {
        console.error('Error fetching user:', error);
        setUser(null); // Ensure user is null on error
        setLoading(false); // Stop loading on auth error
      }
    };
    checkUser();
  }, [router]);

  // Second useEffect: Fetch profile data *after* user state is confirmed
  useEffect(() => {
    if (!user) {
      // If user becomes null after initial check (e.g., token expires), stop loading
      if (!loading) setLoading(false);
      return; // Don't proceed if user is null
    }

    const fetchProfileData = async () => {
      try {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*, project_credits, ftp_settings, ai_settings')
          .eq('id', user.id) // Safe to use user.id here
          .single();

        if (profileError) {
          // Handle profile fetch error specifically (e.g., profile not found is okay)
          if (profileError.code !== 'PGRST116') { // PGRST116 = 'Fetched result contains 0 rows'
             throw profileError;
          }
           console.warn('User profile not found, initializing defaults.');
           // Initialize with defaults if profile doesn't exist
           setFormData({ firstName: '', lastName: '' });
           setEmailData({ email: user.email || '' });
           setProjectCredits(0);
           setAiSettings({ apiKey: '', model: 'google/gemma-3-27b-it:free', systemPrompt: '' });
           setFtpSettings({ host: '', port: 21, user: '', password: '', remote_path: '', use_passive: true });
        } else if (profile) {
          // Profile found, set state from profile data
          setFormData({
            firstName: profile.first_name || '',
            lastName: profile.last_name || '',
          });
          setEmailData({
            email: user.email || ''
          });
          setAiSettings({
            apiKey: profile.openrouter_api_key || '',
            model: profile.llm_model || 'google/gemma-3-27b-it:free',
            systemPrompt: profile.ai_system_prompt || ''
          });
          const fetchedFtpSettings = profile.ftp_settings || {};
          setFtpSettings({
            host: fetchedFtpSettings.host || '',
            port: fetchedFtpSettings.port || 21,
            user: fetchedFtpSettings.user || '',
            password: '', // Always clear password
            remote_path: fetchedFtpSettings.remote_path || '',
            use_passive: fetchedFtpSettings.use_passive !== undefined ? fetchedFtpSettings.use_passive : true
          });
          setProjectCredits(profile.project_credits ?? 0);
        }
      } catch (error) {
        console.error('Error fetching profile data:', error);
        // Optionally set an error state to display to the user
      } finally {
        setLoading(false); // Set loading false after profile fetch attempt
      }
    };

    fetchProfileData();
  }, [user]); // Dependency array ensures this runs when user state changes

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
    // Add explicit check for user state before accessing user.id
    if (!user) {
      console.warn('handleNameBlur called before user state was set.');
      return; // Exit if user state is not yet available
    }
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

  // Handlers for AI and Storage settings changes
  const handleAiSettingsChange = (e) => {
    const { id, value } = e.target;
    setAiSettings(prev => ({ ...prev, [id]: value }));
  };

  // Updated handler for FTP settings, including checkbox
  const handleFtpSettingsChange = (e) => {
    const { id, value, type, checked } = e.target;
    setFtpSettings(prev => ({
      ...prev,
      [id]: type === 'checkbox' ? checked : value
    }));
  };

  // TODO: Implement functions to save AI and Storage settings
  const saveAiSettings = async () => {
    setUpdating(true);
    setMessage({ type: '', text: '' });
    console.log('Saving AI Settings:', aiSettings);
    // Removed commented-out Supabase call to eliminate potential obscure errors
    alert('Saving AI settings not implemented yet.');
    setUpdating(false);
  };

  // Updated function to save FTP settings via new API route
  const saveFtpSettings = async () => {
    setUpdating(true);
    setMessage({ type: '', text: '' }); // Clear general message
    setFtpTestMessage({ type: '', text: '' }); // Clear FTP test message

    // Prepare data to save (exclude password)
    const settingsToSave = {
      host: ftpSettings.host,
      port: parseInt(ftpSettings.port, 10) || 21, // Ensure port is integer
      user: ftpSettings.user,
      remote_path: ftpSettings.remote_path,
      use_passive: ftpSettings.use_passive
    };

    console.log('Saving FTP Settings:', settingsToSave);

    try {
      const response = await fetch('/api/settings/update-ftp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`, // Add Authorization header
        },
        body: JSON.stringify(settingsToSave),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `HTTP error! status: ${response.status}`);
      }

      setMessage({ type: 'success', text: 'FTP settings saved successfully!' });
      // Clear password field after successful save for security
      setFtpSettings(prev => ({ ...prev, password: '' }));

    } catch (error) {
      console.error('Error saving FTP settings:', error);
      setMessage({ type: 'error', text: `Failed to save FTP settings: ${error.message}` });
    } finally {
      setUpdating(false);
    }
  };

  // Function to test FTP connection using the dedicated API route
  const testFtpConnection = async () => {
    setTestingFtp(true);
    setFtpTestMessage({ type: '', text: '' }); // Clear previous message
    setMessage({ type: '', text: '' }); // Clear general message

    // Use current form values for testing, including the password
    const settingsToTest = {
        host: ftpSettings.host,
        port: parseInt(ftpSettings.port, 10) || 21,
        user: ftpSettings.user,
        password: ftpSettings.password, // Send password for testing
        remote_path: ftpSettings.remote_path,
        use_passive: ftpSettings.use_passive
    };

    console.log('Testing FTP Connection with:', settingsToTest);

    try {
        const response = await fetch('/api/settings/test-ftp', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionToken}`, // Add Authorization header
            },
            body: JSON.stringify(settingsToTest),
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || `HTTP error! status: ${response.status}`);
        }

        setFtpTestMessage({ type: 'success', text: result.message || 'Connection successful!' });

    } catch (error) {
        console.error('Error testing FTP connection:', error);
        setFtpTestMessage({ type: 'error', text: `Connection test failed: ${error.message}` });
    } finally {
        setTestingFtp(false);
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
            <div className={`tab ${activeTab === 'ai' ? 'active' : ''}`} onClick={() => setActiveTab('ai')}>AI (LLM)</div>
            <div className={`tab ${activeTab === 'storage' ? 'active' : ''}`} onClick={() => setActiveTab('storage')}>Storage (FTP)</div>
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
            {message.text && <div className={`message ${message.type}`}>{message.text}</div>}
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
          <h2 className="section-title">AI (LLM) Settings</h2>
          {/* Reinstating AI form content */}
          {message.text && <div className={`message ${message.type}`}>{message.text}</div>}
          <form className="account-form" onSubmit={(e) => { e.preventDefault(); saveAiSettings(); }}>
             <div className="form-group">
                <label htmlFor="apiKey">Openrouter API Key</label>
                <input type="password" id="apiKey" className="account-input" placeholder="sk-or-..." aria-label="Openrouter API Key" value={aiSettings.apiKey} onChange={handleAiSettingsChange} />
             </div>
             <div className="form-group">
                <label htmlFor="model">LLM Model (via Openrouter)</label>
                {/* TODO: Fetch model list dynamically from OpenRouter if possible */}
                <select id="model" className="account-input" aria-label="Select LLM Model" value={aiSettings.model} onChange={handleAiSettingsChange}>
                    <option value="google/gemma-3-27b-it:free">Google Gemma 3 27B IT (Free)</option>
                    <option value="mistralai/mixtral-8x7b-instruct">Mistral Mixtral 8x7B Instruct</option>
                    <option value="openai/gpt-4o">OpenAI GPT-4o</option>
                    <option value="anthropic/claude-3-haiku">Anthropic Claude 3 Haiku</option>
                    {/* Add other relevant models */}
                </select>
             </div>
             <div className="form-group">
                <label htmlFor="systemPrompt">System Prompt for AI Note Structuring</label>
                <textarea id="systemPrompt" className="account-input" style={{ minHeight: '150px', resize: 'vertical' }} placeholder="Example: You are an expert meeting summarizer..." aria-label="System Prompt for AI" value={aiSettings.systemPrompt} onChange={handleAiSettingsChange}></textarea>
             </div>
             <button type="submit" className="account-btn" disabled={updating}>
               {updating ? 'Saving...' : 'Save AI Settings'}
             </button>
          </form>
        </div>

        <div className={`tab-content ${activeTab === 'storage' ? 'active' : ''}`}>
          <h2 className="section-title">Storage (FTP) Settings</h2>
          {/* Reinstating Storage form content */}
          {message.text && <div className={`message ${message.type}`}>{message.text}</div>}
          {ftpTestMessage.text && <div className={`message ${ftpTestMessage.type}`}>{ftpTestMessage.text}</div>}
          <form className="account-form" onSubmit={(e) => { e.preventDefault(); saveFtpSettings(); }}>
            <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-end' }}>
                <div className="form-group" style={{ flex: 1 }}>
                    <label htmlFor="host">FTP Host</label>
                    <input type="text" id="host" className="account-input" placeholder="ftp.yourserver.com" aria-label="FTP Host" value={ftpSettings.host} onChange={handleFtpSettingsChange} required />
                </div>
                 <div className="form-group" style={{ flex: '0 0 100px' }}>
                    <label htmlFor="port">Port</label>
                    <input type="number" id="port" className="account-input" placeholder="21" aria-label="FTP Port" value={ftpSettings.port} onChange={handleFtpSettingsChange} required />
                </div>
                 <div className="form-group checkbox-group" style={{ flex: '0 0 150px', paddingBottom: '10px' }}>
                     <label className="checkbox-wrapper">
                         <input type="checkbox" id="use_passive" checked={ftpSettings.use_passive} onChange={handleFtpSettingsChange} />
                         <span className="checkmark"></span> Use Passive Mode
                     </label>
                 </div>
            </div>
             <div className="form-group">
                <label htmlFor="user">FTP Username</label>
                <input type="text" id="user" className="account-input" placeholder="username" aria-label="FTP Username" value={ftpSettings.user} onChange={handleFtpSettingsChange} required />
            </div>
             <div className="form-group">
                <label htmlFor="password">FTP Password</label>
                <input type="password" id="password" className="account-input" placeholder="Enter password to test or save" aria-label="FTP Password" value={ftpSettings.password} onChange={handleFtpSettingsChange} required />
                <p className="input-help">Password is required to test connection and save settings, but it is **not stored** in the database after saving.</p>
            </div>
             <div className="form-group">
                <label htmlFor="remote_path">Remote Path (Optional)</label>
                <input type="text" id="remote_path" className="account-input" placeholder="/mindpen_data/your_user_id/" aria-label="Remote FTP Path" value={ftpSettings.remote_path} onChange={handleFtpSettingsChange} />
                 <p className="input-help">Base directory on the FTP server for storing notes. If blank, defaults to `/mindpen_data/your_user_id/` (where your_user_id is your actual user ID).</p>
            </div>
            <div className="form-actions" style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button type="button" className="account-btn button-secondary" onClick={testFtpConnection} disabled={updating || testingFtp}>
                  {testingFtp ? 'Testing...' : 'Test Connection'}
                </button>
                <button type="submit" className="account-btn button-primary" disabled={updating || testingFtp}>
                  {updating ? 'Saving...' : 'Save FTP Settings'}
                </button>
            </div>
          </form>
        </div>

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
