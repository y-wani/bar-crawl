// api/_lib/firebaseAdmin.ts
//
// Lazily initialise the Firebase Admin SDK inside the serverless runtime.
// Credentials come from the FIREBASE_SERVICE_ACCOUNT env var (a service-account
// JSON string) — NEVER shipped to the browser. Used to (a) verify the caller's
// Firebase ID token and (b) read/write the per-user rate-limit counters.

import {
  cert,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAppCheck, type AppCheck } from "firebase-admin/app-check";

let cached: App | undefined;

const init = (): App => {
  if (cached) return cached;
  const existing = getApps();
  if (existing.length) {
    cached = existing[0];
    return cached;
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT env var is not set");
  }

  const json = JSON.parse(raw) as {
    project_id?: string;
    client_email?: string;
    private_key?: string;
  };
  const serviceAccount: ServiceAccount = {
    projectId: json.project_id,
    clientEmail: json.client_email,
    // Env stores often escape the key's newlines as literal "\n" — undo that so
    // the PEM parses.
    privateKey: json.private_key?.replace(/\\n/g, "\n"),
  };

  cached = initializeApp({ credential: cert(serviceAccount) });
  return cached;
};

export const adminAuth = (): Auth => getAuth(init());
export const adminDb = (): Firestore => getFirestore(init());
export const adminAppCheck = (): AppCheck => getAppCheck(init());
