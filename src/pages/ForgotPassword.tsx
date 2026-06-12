// src/pages/ForgotPassword.tsx

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FirebaseError } from 'firebase/app';
import { motion } from 'framer-motion';
import { useAuth } from '../context/useAuth';
import SwirlBackground from '../components/SwirlBackground';
import PageTransition from '../components/motion/PageTransition';
import { springPanel } from '../components/motion/variants';
import '../styles/Auth.css';

const ForgotPassword: React.FC = () => {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email) {
      setError('Email is required');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);
    try {
      await resetPassword(email);
      setSent(true);
    } catch (err: unknown) {
      if (err instanceof FirebaseError && err.code === 'auth/user-not-found') {
        // Don't reveal whether an account exists
        setSent(true);
      } else {
        setError('Could not send the reset email. Please try again.');
        console.error('Password reset error:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageTransition>
      <div className="auth-container">
        <SwirlBackground />
        <motion.div
          className="auth-card"
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={springPanel}
        >
        <div className="auth-header">
          <h1 className="auth-title">Reset Password</h1>
          <p className="auth-subtitle">
            {sent
              ? 'Check your inbox.'
              : "Enter your email and we'll send you a reset link."}
          </p>
        </div>

        {sent ? (
          <div className="auth-form">
            <p style={{ textAlign: 'center', lineHeight: 1.6 }}>
              If an account exists for <strong>{email}</strong>, a password
              reset link is on its way. It can take a minute or two — check
              your spam folder if it doesn't show up.
            </p>
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="email" className="form-label">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError('');
                }}
                className={`form-input ${error ? 'error' : ''}`}
                placeholder="you@example.com"
                required
              />
              {error && <div className="error-message">{error}</div>}
            </div>

            <button
              type="submit"
              className={`auth-button ${loading ? 'loading' : ''}`}
              disabled={loading}
            >
              {loading ? '' : 'Send Reset Link'}
            </button>
          </form>
        )}

        <div className="auth-footer">
          <p>
            Remembered it?{' '}
            <Link to="/signin" className="auth-link">
              Sign In
            </Link>
          </p>
          <Link to="/" className="back-link">
            &larr; Back to Landing
          </Link>
        </div>
        </motion.div>
      </div>
    </PageTransition>
  );
};

export default ForgotPassword;
