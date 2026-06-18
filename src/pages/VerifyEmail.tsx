// src/pages/VerifyEmail.tsx
//
// Email-verification gate. Email/password sign-ups land here until they click
// the link we email them; Google users are verified automatically and never
// see this page. We auto-send the link on arrival (once per session, rate-gap
// guarded), poll for verification so the app advances the moment they click
// it, and offer a manual resend + "continue" + switch-account.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { FirebaseError } from 'firebase/app';
import { motion } from 'framer-motion';
import { useAuth } from '../context/useAuth';
import SwirlBackground from '../components/SwirlBackground';
import PageTransition from '../components/motion/PageTransition';
import { springPanel } from '../components/motion/variants';
import '../styles/Auth.css';

/** Resend button cooldown, seconds. */
const SEND_COOLDOWN = 45;
/** Don't auto-send again within this window (across remounts/refreshes). */
const RESEND_MIN_GAP_MS = 60_000;
/** How often we re-check the server for a completed verification. */
const POLL_MS = 4000;

const VerifyEmail: React.FC = () => {
  const { user, resendVerificationEmail, reloadUser, signout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const from = (location.state as { from?: string } | null)?.from;

  const [cooldown, setCooldown] = useState(0);
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const didAutoSend = useRef(false);

  const sendKey = user ? `bh_verify_sent_${user.uid}` : '';

  const doSend = useCallback(
    async (silent: boolean) => {
      if (!user) return;
      setError('');
      setSending(true);
      try {
        await resendVerificationEmail();
        sessionStorage.setItem(sendKey, String(Date.now()));
        setCooldown(SEND_COOLDOWN);
        if (!silent) setInfo('Sent! Check your inbox.');
      } catch (err) {
        if (err instanceof FirebaseError && err.code === 'auth/too-many-requests') {
          setError("That's a lot of emails — please wait a minute before resending.");
          setCooldown(SEND_COOLDOWN);
        } else {
          setError('Could not send the email. Please try again in a moment.');
          console.error('Verification email error:', err);
        }
      } finally {
        setSending(false);
      }
    },
    [user, resendVerificationEmail, sendKey]
  );

  // Auto-send once on arrival, unless we sent recently (avoids double-sends
  // from the sign-up redirect + a refresh).
  useEffect(() => {
    if (!user || user.emailVerified || didAutoSend.current) return;
    didAutoSend.current = true;
    const last = Number(sessionStorage.getItem(sendKey) || 0);
    if (Date.now() - last > RESEND_MIN_GAP_MS) {
      void doSend(true);
    }
  }, [user, sendKey, doSend]);

  // Cooldown ticker
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Poll for verification completed in another tab/device
  useEffect(() => {
    if (!user || user.emailVerified) return;
    const t = setInterval(() => {
      void reloadUser();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [user, reloadUser]);

  const handleContinue = async () => {
    setError('');
    setChecking(true);
    try {
      const verified = await reloadUser();
      if (!verified) {
        setError("Not verified yet — click the link in your email, then tap this again.");
      }
      // If verified, the redirect below fires on the next render.
    } finally {
      setChecking(false);
    }
  };

  const handleSwitchAccount = async () => {
    await signout();
    navigate('/signup', { replace: true, state: from ? { from } : undefined });
  };

  // ----- Redirects (after all hooks) -----
  if (!user) return <Navigate to="/signin" replace />;
  if (user.emailVerified) return <Navigate to={from || '/home'} replace />;

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
            <h1 className="auth-title">Verify your email</h1>
            <p className="auth-subtitle">One quick step before the crawl.</p>
          </div>

          <div className="auth-form">
            <p style={{ textAlign: 'center', lineHeight: 1.6 }}>
              We sent a verification link to <strong>{user.email}</strong>. Click
              it to confirm your account — this page updates automatically once
              you do.
            </p>

            <div className="verify-waiting">
              <span className="verify-spinner" aria-hidden="true" />
              <span>Waiting for verification…</span>
            </div>

            {info && !error && <div className="auth-info-message">{info}</div>}
            {error && <div className="error-message">{error}</div>}

            <button
              type="button"
              className={`auth-button ${checking ? 'loading' : ''}`}
              onClick={handleContinue}
              disabled={checking}
            >
              {checking ? '' : "I've verified — continue"}
            </button>

            <button
              type="button"
              className="auth-button auth-button--secondary"
              onClick={() => doSend(false)}
              disabled={sending || cooldown > 0}
            >
              {cooldown > 0 ? `Resend email (${cooldown}s)` : 'Resend email'}
            </button>

            <div className="auth-note">
              <span className="auth-note-title">Don't see it?</span> Check your{' '}
              <strong>Spam</strong> or <strong>Junk</strong> folder, then mark
              the message <strong>"Not spam"</strong> so future BarHop emails
              land in your inbox.
            </div>

            <button
              type="button"
              className="auth-link-button"
              onClick={handleSwitchAccount}
            >
              Use a different account
            </button>
          </div>
        </motion.div>
      </div>
    </PageTransition>
  );
};

export default VerifyEmail;
