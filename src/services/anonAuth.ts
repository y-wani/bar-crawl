// src/services/anonAuth.ts
//
// Anonymous Firebase users back guest mode. The anon user is what lets a guest
// read the shared bar cache (firestore.rules requires request.auth != null) and
// what gives the billed proxy a uid to rate-limit, so it must exist BEFORE the
// first cache read on /home.
//
// CALLER CONTRACT: never call this while auth is still restoring a session.
// auth.currentUser is null during that window, and minting on it would strand
// a returning signed-in user on a brand-new anonymous account. AuthContext
// enforces the gate (loading === false) inside ensureGuest.

import { signInAnonymously, type User as FirebaseUser } from "firebase/auth";
import { auth } from "../firebase/config";

// De-duplicates concurrent calls — React 19 StrictMode mounts effects twice in
// development, and two signInAnonymously calls would mint two accounts.
let pending: Promise<FirebaseUser> | null = null;

export const ensureAnonymousUser = (): Promise<FirebaseUser> => {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  if (pending) return pending;
  pending = signInAnonymously(auth)
    .then((cred) => cred.user)
    .finally(() => {
      pending = null;
    });
  return pending;
};
