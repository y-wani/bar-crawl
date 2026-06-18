import React, { createContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
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

  // Sign up function
  const signup = async (email: string, password: string, displayName?: string): Promise<void> => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      analytics.signUp('email');

      // Update profile with display name if provided
      if (displayName && userCredential.user) {
        await updateFirebaseProfile(userCredential.user, { displayName });
        // onAuthStateChanged fired before the profile update completed,
        // so sync the display name into local state manually
        setUser((prev) => (prev ? { ...prev, displayName } : prev));
      }
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
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      // Count only first-time Google users as a sign-up
      if (getAdditionalUserInfo(result)?.isNewUser) {
        analytics.signUp('google');
      }
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

  const contextValue: AuthContextType = {
    user,
    loading,
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