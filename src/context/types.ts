import type { User as FirebaseUser } from 'firebase/auth';

// Extended user interface with additional properties
export interface User extends FirebaseUser {
  // Add any additional user properties here
  displayName?: string | null;
  email?: string | null;
  photoURL?: string | null;
  uid: string;
}

// Authentication context interface
export interface AuthContextType {
  user: User | null;
  loading: boolean;
  signup: (email: string, password: string, displayName?: string) => Promise<void>;
  signin: (email: string, password: string) => Promise<void>;
  signout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updateProfile: (data: { displayName?: string; photoURL?: string }) => Promise<void>;
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