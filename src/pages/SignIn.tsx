// src/pages/SignIn.tsx

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/useAuth';
import SwirlBackground from '../components/SwirlBackground';
import PageTransition from '../components/motion/PageTransition';
import { springPanel } from '../components/motion/variants';
import { useInviteIntent } from '../hooks/useInviteIntent';
import '../styles/Auth.css';
import { FcGoogle } from 'react-icons/fc';

const SignIn: React.FC = () => {
  const { signin, signinWithGoogle } = useAuth();
  const { isInvite, from } = useInviteIntent();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [loading, setLoading] = useState(false);

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};
    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }
    if (!formData.password) {
      newErrors.password = 'Password is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      await signin(formData.email, formData.password);
      // Navigation will be handled by PublicRoute automatically
    } catch (error: unknown) {
      setErrors({ general: 'Invalid email or password. Please try again.' });
      console.error('Sign in error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });

    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleGoogleSignIn = async () => {
    setErrors({});
    setLoading(true);
    try {
      await signinWithGoogle();
    } catch (error) {
      setErrors({ general: 'Google sign-in failed. Please try again.' });
      console.error('Google sign-in error:', error);
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
        {isInvite && (
          <div className="auth-invite-banner">
            🍻 You've been invited to a live crawl — sign in to join your friends
            on the map.
          </div>
        )}

        <div className="auth-header">
          <h1 className="auth-title">Welcome Back</h1>
          <p className="auth-subtitle">Sign in to continue your adventure.</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email" className="form-label">
              Email Address
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className={`form-input ${errors.email ? 'error' : ''}`}
              placeholder="you@example.com"
              required
            />
            {errors.email && (
              <div className="error-message">{errors.email}</div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="password" className="form-label">
              Password
            </label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              className={`form-input ${errors.password ? 'error' : ''}`}
              placeholder="Your password"
              required
            />
            {errors.password && (
              <div className="error-message">{errors.password}</div>
            )}
          </div>

          <div style={{ textAlign: 'right', fontSize: '0.9rem' }}>
            <Link to="/forgot-password" className="auth-link">
              Forgot Password?
            </Link>
          </div>

          {errors.general && (
            <motion.div
              className="error-message"
              style={{ textAlign: 'center' }}
              animate={{ x: [0, -6, 6, -3, 0] }}
              transition={{ duration: 0.35 }}
            >
              {errors.general}
            </motion.div>
          )}

          <button
            type="submit"
            className={`auth-button ${loading ? 'loading' : ''}`}
            disabled={loading}
          >
            {loading ? '' : 'Sign In'}
          </button>
          <div className="social-login" aria-label="Alternative sign-in options">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="google-icon-button"
              disabled={loading}
              aria-label="Sign in with Google"
            >
              <FcGoogle size={28} />
            </button>
          </div>
        </form>

        <div className="auth-footer">
          <p>
            Don't have an account?{' '}
            <Link to="/signup" state={from ? { from } : undefined} className="auth-link">
              Sign Up
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

export default SignIn;