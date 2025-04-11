'use client';

import { useState, useEffect } from 'react'; // Import useEffect
import { supabase } from '@/lib/supabase'; // Import supabase client
import { TicketIcon, CheckCircle, CloseIcon } from '@/lib/icons'; // Removed unused CreditCardIcon, StarIcon
import '../page.css'; // Import the new CSS file

// Removed placeholder logic for TicketIcon as it exists

export default function BillingCard({ projectCredits, onCreditsUpdate }) {
  const [voucherCode, setVoucherCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' }); // type: 'success' or 'error'
  const [sessionToken, setSessionToken] = useState(null);

  // Get session token on component mount
  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSessionToken(session?.access_token || null);
    };
    getSession();

    // Optional: Listen for auth changes if needed
    // const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    //   setSessionToken(session?.access_token || null);
    // });
    // return () => subscription?.unsubscribe();

  }, []);

  const handleClaimVoucher = async (e) => {
    e.preventDefault();
    if (!voucherCode.trim()) {
      setMessage({ type: 'error', text: 'Please enter a voucher code.' });
      return;
    }

    setLoading(true);
    setMessage({ type: '', text: '' }); // Clear previous messages

    try {
      if (!sessionToken) {
        setMessage({ type: 'error', text: 'Authentication error. Please log in again.' });
        setLoading(false);
        return;
      }

      const response = await fetch('/api/vouchers/claim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`, // Add Authorization header
        },
        body: JSON.stringify({ voucherCode: voucherCode.trim() }),
      });

      let data;
      try {
        data = await response.json();
      } catch (jsonError) {
        console.error('Error parsing JSON response:', jsonError);
        throw new Error(`Failed to parse server response. Status: ${response.status}`);
      }

      if (!response.ok) {
        // Use error message from API if available, otherwise generic message
        throw new Error(data.error || `Error ${response.status}: Failed to claim voucher.`);
      }

      // Success
      setMessage({ type: 'success', text: data.message || 'Voucher claimed successfully!' });
      setVoucherCode(''); // Clear input field on success
      if (onCreditsUpdate && typeof onCreditsUpdate === 'function') {
        onCreditsUpdate(data.newCredits); // Update parent state with new credit count from API
      }

    } catch (error) {
      console.error('Claim voucher error:', error);
      setMessage({ type: 'error', text: error.message || 'An unexpected error occurred.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="account-section billing-card"> {/* Added billing-card class */}
      <h2 className="section-title">Billing &amp; Usage</h2>

      <div className="billing-info">
         <h3 className="text-lg font-semibold mb-2">Project Credits</h3>
         <p className="credits-value">{projectCredits ?? 'Loading...'}</p>
         <p className="credits-label">Remaining items you can create</p>
      </div>

      <div className="voucher-section">
        <h3 className="voucher-title">
          <TicketIcon /> Have a Voucher Code?
        </h3>
        
        {message.text && (
          <div className={`message ${
              message.type === 'success' ? 'success-message' :
              message.type === 'error' ? 'error-message' :
              'info-message'
            }`}
          >
            {message.type === 'success' && <CheckCircle className="w-5 h-5 flex-shrink-0 message-icon" />}
            {message.type === 'error' && <CloseIcon className="w-5 h-5 flex-shrink-0 message-icon" />}
            {message.text}
          </div>
        )}

        <form onSubmit={handleClaimVoucher} className="account-form">
          <div className="form-group">
            <label htmlFor="voucherCode">
              <TicketIcon className="form-icon" />
              Voucher Code
            </label>
            <input
              type="text"
              id="voucherCode"
              name="voucherCode"
              value={voucherCode}
              onChange={(e) => setVoucherCode(e.target.value)}
              className="account-input"
              placeholder="Enter your voucher code"
              disabled={loading}
              required
            />
          </div>

          <button
            type="submit"
            className="account-btn"
            disabled={loading}
          >
            {loading ? 'Claiming...' : 'Claim Voucher'}
          </button>
        </form>
      </div>
    </div>
  );
}