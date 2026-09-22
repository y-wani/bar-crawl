import type { User as FirebaseUser } from 'firebase/auth';

// Extended user interface with additional properties
export interface User extends Omit<FirebaseUser, 'displayName'> {
  // Add any additional user properties here
  displayName: string | null;
}

// Authentication context interface
export interface AuthContextType {
  user: User | null;
  loading: boolean;
  /** True when the current session is an anonymous (guest) account. */
  isGuest: boolean;
  /** Mint an anonymous user if nobody is signed in. No-op while loading, and
   *  a no-op when a real or anonymous user already exists. */
  ensureGuest: () => Promise<void>;
  /** Resolves with how the signup actually resolved: `collided` means the
   *  identity already had an account and they were signed into it instead. The
   *  caller needs this to say so and to navigate, rather than leaving a form
   *  that looks like it did nothing. */
  signup: (
    email: string,
    password: string,
    displayName?: string
  ) => Promise<{ wasGuest: boolean; collided: boolean }>;
  signin: (email: string, password: string) => Promise<void>;
  signinWithGoogle: () => Promise<void>;
  signout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updateProfile: (data: { displayName?: string; photoURL?: string }) => Promise<void>;
  /** Re-send the email-verification link to the current user. */
  resendVerificationEmail: () => Promise<void>;
  /** Refresh the current user from the server and sync state; returns the
   *  latest emailVerified flag (used to detect verification while polling). */
  reloadUser: () => Promise<boolean>;
}

// Auth provider props interface
export interface AuthProviderProps {
  children: React.ReactNode;
}

// Sign up form data interface
export interface SignUpData {
  email: string;
  password: string;
  displayName?: string;
}

// Sign in form data interface
export interface SignInData {
  email: string;
  password: string;
} 