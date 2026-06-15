// api/_lib/guard.ts
//
// Shared request guards for the billed-API proxy endpoints:
//   1. method check (all endpoints are POST)
//   2. Firebase ID-token verification (only signed-in app users get through)
//   3. per-user rate limiting (a short burst window + a daily cap), so a single
//      leaked account still can't drain the Google Places / Gemini budget.
//
// The keys themselves live only in server env vars, so even an unauthenticated
// attacker who reads the JS bundle finds nothing to call Google with directly.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { FieldValue, type Transaction } from "firebase-admin/firestore";
import { adminAuth, adminDb, adminAppCheck } from "./firebaseAdmin";

export interface AuthedUser {
  uid: string;
}

/** Reject anything that isn't a POST. Returns true when the request may proceed. */
export const requirePost = (
  req: VercelRequest,
  res: VercelResponse
): boolean => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return false;
  }
  return true;
};

/**
 * Verify the `Authorization: Bearer <firebase-id-token>` header. On success
 * returns the user; on failure it writes a 401 and returns null.
 */
export const verifyAuth = async (
  req: VercelRequest,
  res: VercelResponse
): Promise<AuthedUser | null> => {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer (.+)$/i);
  if (!match) {
    res.status(401).json({ error: "Missing auth token" });
    return null;
  }

  try {
    const decoded = await adminAuth().verifyIdToken(match[1]);
    return { uid: decoded.uid };
  } catch {
    res.status(401).json({ error: "Invalid or expired auth token" });
    return null;
  }
};

/**
 * Verify the Firebase App Check token (header `X-Firebase-AppCheck`), which
 * attests the request came from our real app rather than a script. Gated on
 * APPCHECK_ENFORCE so it ships dormant: with the flag unset it always passes,
 * so deploying this code changes nothing until App Check is set up + enabled.
 *
 * Returns true when the request may proceed; otherwise writes 401 + returns
 * false.
 */
export const verifyAppCheck = async (
  req: VercelRequest,
  res: VercelResponse
): Promise<boolean> => {
  if (process.env.APPCHECK_ENFORCE !== "true") return true; // dormant

  const token = req.headers["x-firebase-appcheck"];
  if (typeof token !== "string" || !token) {
    res.status(401).json({ error: "Missing App Check token" });
    return false;
  }
  try {
    await adminAppCheck().verifyToken(token);
    return true;
  } catch {
    res.status(401).json({ error: "Invalid App Check token" });
    return false;
  }
};

interface Window {
  /** bucket label, e.g. "2026-06-15T14:32" (minute) or "2026-06-15" (day) */
  key: string;
  /** max requests allowed in this window */
  limit: number;
  /** field name stored on the user's rate-limit doc */
  field: string;
}

/**
 * Atomically increment the caller's counters for a set of time windows and
 * block when any limit is exceeded. One Firestore transaction per request keeps
 * the count race-free even across concurrent serverless invocations.
 *
 * Returns true when the request is within limits; otherwise writes 429 + a
 * Retry-After hint and returns false.
 */
export const enforceRateLimit = async (
  uid: string,
  endpoint: string,
  windows: Window[],
  res: VercelResponse
): Promise<boolean> => {
  const ref = adminDb().collection("rateLimits").doc(uid);

  let result: { blocked: boolean; retryAfter: number };
  try {
    result = await adminDb().runTransaction(async (tx: Transaction) => {
      const snap = await tx.get(ref);
      const data = (snap.exists ? snap.data() : {}) ?? {};

      const update: Record<string, unknown> = {
        updatedAt: FieldValue.serverTimestamp(),
      };

      for (const w of windows) {
        const endpointData = data[endpoint] as
          | Record<string, { key: string; count: number }>
          | undefined;
        const cur = endpointData?.[w.field];
        const count = cur && cur.key === w.key ? cur.count : 0;

        if (count >= w.limit) {
          // Abort: leave counters untouched.
          return { blocked: true, retryAfter: w.field === "minute" ? 60 : 3600 };
        }
        update[`${endpoint}.${w.field}`] = { key: w.key, count: count + 1 };
      }

      tx.set(ref, update, { merge: true });
      return { blocked: false, retryAfter: 0 };
    });
  } catch (err) {
    // Failing closed would lock out real users on a transient counter error;
    // fail open but log, since the daily budget cap in Cloud Console is the
    // hard backstop.
    console.error("rate-limit transaction failed:", err);
    return true;
  }

  if (result.blocked) {
    res.setHeader("Retry-After", String(result.retryAfter));
    res.status(429).json({ error: "Rate limit exceeded. Try again later." });
    return false;
  }
  return true;
};

/** Minute + day bucket labels (UTC) for the current instant. */
export const buckets = () => {
  const now = new Date().toISOString(); // 2026-06-15T14:32:07.123Z
  return {
    minute: { field: "minute", key: now.slice(0, 16) }, // 2026-06-15T14:32
    day: { field: "day", key: now.slice(0, 10) }, // 2026-06-15
  };
};

/** Read + JSON-parse the request body defensively (Vercel usually pre-parses). */
export const readJson = <T>(req: VercelRequest): T => {
  if (req.body && typeof req.body === "object") return req.body as T;
  if (typeof req.body === "string" && req.body) return JSON.parse(req.body) as T;
  return {} as T;
};
