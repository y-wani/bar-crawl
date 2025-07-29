// src/pages/SignUp.tsx

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import '../styles/Auth.css';

const SignUp: React.FC = () => {
  const { signup } = useAuth();
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
      await signup(formData.email, formData.password, formData.name);
      // Navigation will be handled by PublicRoute automatically
    } catch (error: unknown) {
      let errorMessage = 'Failed to create account. Please try again.';
      
      if (error && typeof error === 'object' && 'code' in error) {
        const errorCode = error.code as string;
        if (errorCode === 'auth/email-already-in-use') {
          errorMessage = 'An account with this email already exists.';
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

  const { requirements } = getPasswordStrength();

  return (
    <div className="signup-container">
      <div className="auth-card">
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
            <div className="error-message">{errors.general}</div>
          )}
          
          <button 
            type="submit" 
            className={`auth-button ${loading ? 'loading' : ''}`}
            disabled={loading}
          >
            {loading ? '' : 'Create Account'}
          </button>
        </form>
        
        <div className="auth-footer">
          <p>
            Already have an account?{' '}
            <Link to="/signin" className="auth-link">
              Sign In
            </Link>
          </p>
          <Link to="/" className="back-link">
            &larr; Back to Landing
          </Link>
        </div>
      </div>
    </div>
  );
};

export default SignUp;