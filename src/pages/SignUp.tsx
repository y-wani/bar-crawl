// src/pages/SignUp.tsx

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/useAuth';
import SwirlBackground from '../components/SwirlBackground';
import PageTransition from '../components/motion/PageTransition';
import { springPanel } from '../components/motion/variants';
import { useInviteIntent } from '../hooks/useInviteIntent';
import { toast } from '../components/Toaster';
import '../styles/Auth.css';
import { FcGoogle } from 'react-icons/fc';

const SignUp: React.FC = () => {
  const { signup, signinWithGoogle } = useAuth();
  const { isInvite, from } = useInviteIntent();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [loading, setLoading] = useState(false);

  // Validation functions remain the same...
  const validateName = (name: string): string => {
    if (!name.trim()) return 'Name is required';
    if (name.trim().length < 2) return 'Name must be at least 2 characters';
    return '';
  };

  const validateEmail = (email: string): string => {
    if (!email) return 'Email is required';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return 'Please enter a valid email address';
    return '';
  };

  const validatePassword = (password: string): string => {
    if (!password) return 'Password is required';
    if (password.length < 6) return 'Password must be at least 6 characters';
    return '';
  };

  const validateConfirmPassword = (password: string, confirmPassword: string): string => {
    if (!confirmPassword) return 'Please confirm your password';
    if (password !== confirmPassword) return 'Passwords do not match';
    return '';
  };

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};
    const nameError = validateName(formData.name);
    if (nameError) newErrors.name = nameError;
    const emailError = validateEmail(formData.email);
    if (emailError) newErrors.email = emailError;
    const passwordError = validatePassword(formData.password);
    if (passwordError) newErrors.password = passwordError;
    const confirmPasswordError = validateConfirmPassword(formData.password, formData.confirmPassword);
    if (confirmPasswordError) newErrors.confirmPassword = confirmPasswordError;
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const getPasswordStrength = () => {
    const { password } = formData;
    if (!password) return { score: 0, requirements: [] };
    
    const requirements = [
      { text: '6+ characters', valid: password.length >= 6 },
      { text: 'A number', valid: /\d/.test(password) },
      { text: 'A letter', valid: /[a-zA-Z]/.test(password) },
      { text: 'A symbol', valid: /[!@#$%^&*(),.?":{}|<>]/.test(password) },
    ];
    
    const score = requirements.filter(req => req.valid).length;
    return { score, requirements };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    
    if (!validateForm()) {
      return;
    }
    
    setLoading(true);
    
    try {
      const { collided } = await signup(
        formData.email,
        formData.password,
        formData.name
      );
      if (collided) {
        // They already had an account and we signed them into it. Saying so
        // matters: silence here reads as a form that did nothing, and the
        // visitor clicks again — which is how a stale anonymous session turns
        // into a confusing "email already in use" on the second attempt.
        toast.success('Welcome back — signed you into your existing account');
      }
      // Navigate explicitly rather than waiting on PublicRoute's redirect, so
      // the form is never left sitting there looking dead. `from` returns a
      // guest to the crawl they were building.
      navigate(from || '/home', { replace: true });
    } catch (error: unknown) {
      let errorMessage = 'Failed to create account. Please try again.';
      
      if (error && typeof error === 'object' && 'code' in error) {
        const errorCode = error.code as string;
        if (errorCode === 'auth/email-already-in-use') {
          errorMessage = 'An account with this email already exists.';
        } else if (
          errorCode === 'auth/wrong-password' ||
          errorCode === 'auth/invalid-credential' ||
          errorCode === 'auth/invalid-login-credentials'
        ) {
          // Reached by the guest-upgrade collision path: the email already has
          // an account but the password typed here isn't its password. The
          // generic "failed to create account" was actively misleading.
          errorMessage =
            'That email already has an account, and the password doesn\'t match. Sign in instead — your crawl will still be here.';
        } else if (errorCode === 'auth/invalid-email') {
          errorMessage = 'Please enter a valid email address.';
        } else if (errorCode === 'auth/weak-password') {
          errorMessage = 'Password is too weak. Please choose a stronger password.';
        } else if (errorCode === 'auth/operation-not-allowed') {
          errorMessage = 'Email/password accounts are not enabled. Please contact support.';
        }
      }
      
      setErrors({ general: errorMessage });
      console.error('Sign up error:', error);
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

  const handleGoogleSignup = async () => {
    setErrors({});
    setLoading(true);
    try {
      await signinWithGoogle();
      // Same reason as the email path: navigate explicitly so the form can
      // never sit there looking like the click did nothing, and so a guest
      // returns to the crawl they were building.
      navigate(from || '/home', { replace: true });
    } catch (error) {
      setErrors({ general: 'Google sign-in failed. Please try again.' });
      console.error('Google sign-in error:', error);
    } finally {
      setLoading(false);
    }
  };

  const { requirements } = getPasswordStrength();

  return (
    <PageTransition>
      <div className="auth-container signup-container">
        <SwirlBackground />
        <motion.div
          className="auth-card signup-card"
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={springPanel}
        >
        {isInvite && (
          <div className="auth-invite-banner">
            🍻 A friend invited you to their live crawl — create an account to
            join and see each other on the map.
          </div>
        )}

        <div className="auth-header">
          <h1 className="auth-title">Create Account</h1>
          <p className="auth-subtitle">Join the ultimate bar crawl experience.</p>
        </div>
        
        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="name" className="form-label">
              Full Name
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className={`form-input ${errors.name ? 'error' : ''}`}
              placeholder="Your Name"
              required
            />
            {errors.name && (
              <div className="error-message">{errors.name}</div>
            )}
          </div>
          
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
              placeholder="Create a strong password"
              required
            />
            {errors.password && (
              <div className="error-message">{errors.password}</div>
            )}
            
            {formData.password && (
              <div className="password-requirements">
                {requirements.map((req, index) => (
                  <div key={index} className={`requirement ${req.valid ? 'valid' : 'invalid'}`}>
                    {req.valid ? '✓' : '○'} {req.text}
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div className="form-group">
            <label htmlFor="confirmPassword" className="form-label">
              Confirm Password
            </label>
            <input
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              className={`form-input ${errors.confirmPassword ? 'error' : ''}`}
              placeholder="Confirm your password"
              required
            />
            {errors.confirmPassword && (
              <div className="error-message">{errors.confirmPassword}</div>
            )}
          </div>
          
          {errors.general && (
            <motion.div
              className="error-message"
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
            {loading ? '' : 'Create Account'}
          </button>

          <div className="social-login" aria-label="Alternative sign-up options">
            <button
              type="button"
              onClick={handleGoogleSignup}
              className="google-icon-button"
              disabled={loading}
              aria-label="Sign up with Google"
            >
              <FcGoogle size={28} />
            </button>
          </div>
        </form>
        
        <div className="auth-footer">
          <p>
            Already have an account?{' '}
            <Link to="/signin" state={from ? { from } : undefined} className="auth-link">
              Sign In
            </Link>
          </p>
          {/* Honour `from` so someone who came here from a half-built crawl
              and decided not to register lands back on that crawl, not on the
              marketing page. Going to "/" was how a guest lost their route. */}
          <Link to={from || '/'} className="back-link">
            &larr; {from ? 'Back to my crawl' : 'Back to Landing'}
          </Link>
        </div>
        </motion.div>
      </div>
    </PageTransition>
  );
};

export default SignUp;