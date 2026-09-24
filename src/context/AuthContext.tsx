import React, { createContext, useEffect, useState } from 'react';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile as updateFirebaseProfile,
  sendPasswordResetEmail,
  getAdditionalUserInfo,
  type User as FirebaseUser
} from 'firebase/auth';
import { auth } from '../firebase/config';
import { analytics } from '../utils/analytics';
import { postJson } from '../services/apiClient';
import { ensureAnonymousUser } from '../services/anonAuth';
import {
  upgradeOrCreateWithEmail,
  upgradeOrCreateWithGoogle,
} from '../services/accountUpgrade';
import type { AuthContextType, AuthProviderProps, User } from './types';

// Create the auth context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Map a Firebase user onto our extended User shape. Spreading alone can miss
// prototype getters, so the fields the app relies on (incl. emailVerified,
// which gates app access) are copied explicitly.
const mapUser = (firebaseUser: FirebaseUser): User => ({
  ...firebaseUser,
  displayName: firebaseUser.displayName,
  email: firebaseUser.email,
  photoURL: firebaseUser.photoURL,
  uid: firebaseUser.uid,
  emailVerified: firebaseUser.emailVerified,
});

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Re-read auth.currentUser into context state.
  //
  // Needed because account LINKING (the whole basis of guest upgrade) does not
  // fire onAuthStateChanged: the uid is unchanged, so Firebase does not regard
  // it as an auth-state change, even though isAnonymous just flipped to false.
  // Anything that upgrades an account must call this or the app keeps treating
  // the person as a guest.
  const syncUserFromAuth = (displayName?: string): void => {
    if (!auth.currentUser) return;
    const mapped = mapUser(auth.currentUser);
    setUser(displayName ? { ...mapped, displayName } : mapped);
  };

  // Sign up function
  const signup = async (
    email: string,
    password: string,
    displayName?: string
  ): Promise<{ wasGuest: boolean; collided: boolean }> => {
    try {
      // Upgrades an anonymous session in place when one exists, so the crawl
      // the guest built survives under the same uid. Falls back to a normal
      // sign-in when the email already has an account.
      const { wasGuest, collided } = await upgradeOrCreateWithEmail(
        email,
        password,
        displayName
      );
      // A collision is a sign-IN, not a new account — counting it as a signup
      // would inflate the very number Phase 2 exists to measure.
      if (!collided) analytics.signUp('email');

      // CRITICAL: linkWithCredential keeps the SAME uid, so onAuthStateChanged
      // does not fire — from Firebase's point of view the signed-in user never
      // changed, only its provider data did. Without re-mapping here the
      // context holds an object whose isAnonymous is still true, and the whole
      // app goes on treating a brand-new account as a guest: the header offers
      // "Sign up free", ProtectedRoute bounces them off /saved-crawls, and
      // pressing Save asks them to sign up again.
      syncUserFromAuth(displayName);
      // wasGuest is the number that decides whether guest mode beat the cold
      // wall (spec §10). Phase 2 attaches it to the event; keeping the value
      // here means that is a one-line change.
      return { wasGuest, collided };
    } catch (error) {
      console.error('Sign up error:', error);
      throw error;
    }
  };

  // Sign in function
  const signin = async (email: string, password: string): Promise<void> => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      console.error('Sign in error:', error);
      throw error;
    }
  };

  // Sign in with Google
  const signinWithGoogle = async (): Promise<void> => {
    try {
      const { credential, wasGuest } = await upgradeOrCreateWithGoogle();
      // Count only first-time Google users as a sign-up. A linked guest is
      // always new, since the anonymous account had no Google identity.
      if (wasGuest || (credential && getAdditionalUserInfo(credential)?.isNewUser)) {
        analytics.signUp('google');
      }
      // linkWithPopup has the same uid-preserving behaviour as
      // linkWithCredential, so the same stale-guest trap applies here.
      syncUserFromAuth();
    } catch (error) {
      console.error('Google sign-in error:', error);
      throw error;
    }
  };

  // Sign out function
  const signout = async (): Promise<void> => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  };

  // Reset password function
  const resetPassword = async (email: string): Promise<void> => {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error) {
      console.error('Password reset error:', error);
      throw error;
    }
  };

  // Send/re-send the verification email. Routed through our serverless proxy
  // so it's delivered via Resend from noreply@gobarhop.app (authenticated
  // domain → inbox) instead of Firebase's shared firebaseapp.com sender.
  const resendVerificationEmail = async (): Promise<void> => {
    if (!auth.currentUser) throw new Error('You must be signed in');
    await postJson('/api/proxy', { action: 'sendVerificationEmail' });
  };

  // Refresh the current user from the server (e.g. to pick up a just-completed
  // email verification) and sync it into state. Returns the latest flag.
  const reloadUser = async (): Promise<boolean> => {
    if (!auth.currentUser) return false;
    await auth.currentUser.reload();
    // reload() mutates auth.currentUser in place and does NOT fire
    // onAuthStateChanged, so push a fresh object to trigger a re-render.
    setUser(mapUser(auth.currentUser));
    return auth.currentUser.emailVerified;
  };

  // Update profile function
  const updateProfile = async (data: { displayName?: string; photoURL?: string }): Promise<void> => {
    try {
      if (auth.currentUser) {
        await updateFirebaseProfile(auth.currentUser, data);
      }
    } catch (error) {
      console.error('Profile update error:', error);
      throw error;
    }
  };

  // Listen for auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser: FirebaseUser | null) => {
      setUser(firebaseUser ? mapUser(firebaseUser) : null);
      setLoading(false);
    });

    // Cleanup subscription
    return () => unsubscribe();
  }, []);

  // Guest mode: an anonymous account is a signed-in Firebase user, so every
  // "is this person logged in?" check in the app must ask isGuest too.
  const isGuest = !!user?.isAnonymous;

  // Mint an anonymous user for a visitor with no session. Gated on `loading`
  // because auth.currentUser is null while Firebase restores an existing
  // session from IndexedDB — minting there would sign a returning user out of
  // their own account and into a fresh guest.
  const ensureGuest = async (): Promise<void> => {
    if (loading || user) return;
    try {
      await ensureAnonymousUser();
    } catch (error) {
      // A failed mint means no cache reads and no proxy calls. The page still
      // renders; the visitor gets the signed-out experience.
      console.error('Anonymous sign-in failed:', error);
    }
  };

  const contextValue: AuthContextType = {
    user,
    loading,
    isGuest,
    ensureGuest,
    signup,
    signin,
    signinWithGoogle,
    signout,
    resetPassword,
    updateProfile,
    resendVerificationEmail,
    reloadUser,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook to use auth context
// Export the context for direct access if needed
export { AuthContext }; 