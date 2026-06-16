// api/_lib/guard.ts
//
// Shared request guards for the billed-API proxy endpoints:
//   1. method check (all endpoints are POST)
//   2. App Check verification (gated on APPCHECK_ENFORCE; ships dormant)
//   3. Firebase ID-token verification (only signed-in app users get through)
//   4. per-user rate limiting (a short burst window + a daily cap), so a single
//      leaked account still can't drain the Google Places / Gemini budget.
//
// Token verification uses `jose` (Google JWKS); counters live in Firestore via
// its REST API — no firebase-admin SDK (which failed to bundle on Vercel).

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyIdToken, verifyAppCheckToken } from "./auth";
import { getDocument, patchDocument } from "./firestore";

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
 * Verify the App Check token (header `X-Firebase-AppCheck`). Gated on
 * APPCHECK_ENFORCE so it ships dormant: with the flag unset it always passes.
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
    await verifyAppCheckToken(token);
    return true;
  } catch {
    res.status(401).json({ error: "Invalid App Check token" });
    return false;
  }
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
    const uid = await verifyIdToken(match[1]);
    return { uid };
  } catch {
    res.status(401).json({ error: "Invalid or expired auth token" });
    return null;
  }
};

interface Window {
  /** bucket label, e.g. "2026-06-16T14:32" (minute) or "2026-06-16" (day) */
  key: string;
  /** max requests allowed in this window */
  limit: number;
  /** field suffix on the user's rate-limit doc */
  field: string;
}

/**
 * Increment the caller's counters for a set of time windows and block when any
 * limit is exceeded. Counters are stored as flat fields on rateLimits/{uid}
 * (e.g. placesNearby__minute__count). This is a read-then-write rather than a
 * transaction — slight undercounting under heavy concurrency is acceptable
 * since the Cloud quota cap is the hard backstop.
 *
 * Returns true when within limits; otherwise writes 429 + returns false.
 */
export const enforceRateLimit = async (
  uid: string,
  endpoint: string,
  windows: Window[],
  res: VercelResponse
): Promise<boolean> => {
  try {
    const data = (await getDocument(`rateLimits/${uid}`)) ?? {};
    const updates: Record<string, unknown> = {};

    for (const w of windows) {
      const keyField = `${endpoint}__${w.field}__key`;
      const countField = `${endpoint}__${w.field}__count`;
      const sameWindow = data[keyField] === w.key;
      const count = sameWindow ? Number(data[countField] ?? 0) : 0;

      if (count >= w.limit) {
        res.setHeader("Retry-After", String(w.field === "minute" ? 60 : 3600));
        res.status(429).json({ error: "Rate limit exceeded. Try again later." });
        return false;
      }
      updates[keyField] = w.key;
      updates[countField] = count + 1;
    }

    await patchDocument(`rateLimits/${uid}`, updates);
    return true;
  } catch (err) {
    // Failing closed would lock out real users on a transient error; fail open
    // and log, since the daily budget/quota cap is the hard backstop.
    console.error("rate-limit failed:", err);
    return true;
  }
};

/** Minute + day bucket labels (UTC) for the current instant. */
export const buckets = () => {
  const now = new Date().toISOString(); // 2026-06-16T14:32:07.123Z
  return {
    minute: { field: "minute", key: now.slice(0, 16) }, // 2026-06-16T14:32
    day: { field: "day", key: now.slice(0, 10) }, // 2026-06-16
  };
};

/** Read + JSON-parse the request body defensively (Vercel usually pre-parses). */
export const readJson = <T>(req: VercelRequest): T => {
  if (req.body && typeof req.body === "object") return req.body as T;
  if (typeof req.body === "string" && req.body) return JSON.parse(req.body) as T;
  return {} as T;
};
