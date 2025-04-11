'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { GoogleIcon, LoginIcon, SignupIcon } from '@/lib/icons';

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const router = useRouter();

  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      const params = new URLSearchParams(hash.substring(1));
      const type = params.get('type');
      if (type === 'signup') {
        setMessage('Congratulations! Your account has been successfully created and confirmed. Now you can log into your dashboard. See you inside!');
      }
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');

    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMessage(error.message);
      } else {
        setMessage('Login successful! Letting you in...');
        router.push('/dashboard');
      }
    } else {
      if (password !== confirmPassword) {
        setMessage('Passwords do not match');
        return;
      }
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setMessage(error.message);
      } else {
        setMessage('Registration successful! Please check your email to confirm.');
      }
    }
  };

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' });
    if (error) setMessage(error.message);
  };

  return (
    <div className="auth-container">
      <h2>CLU System</h2>
      <div className="auth-toggle">
        <button className={`toggle-btn ${isLogin ? 'active' : ''}`} onClick={() => setIsLogin(true)}>
          Login
        </button>
        <button className={`toggle-btn ${!isLogin ? 'active' : ''}`} onClick={() => setIsLogin(false)}>
          Register
        </button>
      </div>
      <form onSubmit={handleSubmit} className="auth-form">
        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input
            type="email"
            id="email"
            className="auth-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            type="password"
            id="password"
            className="auth-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            required
          />
        </div>
        {!isLogin && (
          <div className="form-group">
            <label htmlFor="confirm-password">Confirm Password</label>
            <input
              type="password"
              id="confirm-password"
              className="auth-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your password"
              required
            />
          </div>
        )}
        <button type="submit" className="auth-btn">
          {isLogin ? <LoginIcon /> : <SignupIcon />} {isLogin ? 'Login' : 'Register'}
        </button>
        <a href="/reset-password" className="forgot-password">Forgot Password?</a>
        <button type="button" className="google-btn" onClick={handleGoogleLogin}>
          <GoogleIcon /> Continue with Google
        </button>
      </form>
      {message && <p className="auth-message">{message}</p>}
    </div>
  );
}