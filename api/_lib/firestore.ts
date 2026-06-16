// api/_lib/firestore.ts
//
// Minimal Firestore client over the REST API, authenticated with a Google
// access token minted from the service account (signed with `jose`). Replaces
// firebase-admin's Firestore (gRPC), which didn't bundle in the Vercel runtime.
// Used for per-user rate-limit counters and the server-owned bar cache.

import { SignJWT, importPKCS8 } from "jose";
import { getServiceAccount, PROJECT_ID } from "./serviceAccount";

const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/datastore";

let tokenCache: { token: string; expiresAt: number } | null = null;

/** Mint (and cache) a Google OAuth access token for Firestore. */
const getAccessToken = async (): Promise<string> => {
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token;
  }

  const sa = getServiceAccount();
  const key = await importPKCS8(sa.private_key, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience(TOKEN_URL)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) {
    throw new Error(`Token exchange ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
};

const authHeaders = async (): Promise<Record<string, string>> => ({
  Authorization: `Bearer ${await getAccessToken()}`,
  "Content-Type": "application/json",
});

// ----- Firestore "Value" <-> JS conversion -----

type FsValue = Record<string, unknown>;

const encodeValue = (v: unknown): FsValue => {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number")
    return Number.isInteger(v)
      ? { integerValue: String(v) }
      : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } };
  if (typeof v === "object")
    return { mapValue: { fields: encodeFields(v as Record<string, unknown>) } };
  return { nullValue: null };
};

const encodeFields = (obj: Record<string, unknown>): Record<string, FsValue> => {
  const out: Record<string, FsValue> = {};
  for (const [k, val] of Object.entries(obj)) {
    if (val === undefined) continue;
    out[k] = encodeValue(val);
  }
  return out;
};

const decodeValue = (v: FsValue): unknown => {
  if (v == null) return null;
  if ("nullValue" in v) return null;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("stringValue" in v) return v.stringValue;
  if ("timestampValue" in v) return new Date(v.timestampValue as string).getTime();
  if ("arrayValue" in v) {
    const arr = (v.arrayValue as { values?: FsValue[] }).values ?? [];
    return arr.map(decodeValue);
  }
  if ("mapValue" in v) {
    const fields = (v.mapValue as { fields?: Record<string, FsValue> }).fields ?? {};
    return decodeFields(fields);
  }
  return null;
};

const decodeFields = (
  fields: Record<string, FsValue>
): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(fields)) out[k] = decodeValue(val);
  return out;
};

// ----- Operations -----

/** GET a document's decoded fields, or null if it doesn't exist. */
export const getDocument = async (
  path: string
): Promise<Record<string, unknown> | null> => {
  const res = await fetch(`${BASE}/${path}`, { headers: await authHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore GET ${path} ${res.status}`);
  const data = (await res.json()) as { fields?: Record<string, FsValue> };
  return decodeFields(data.fields ?? {});
};

/** PATCH (upsert) the given fields on a document. */
export const patchDocument = async (
  path: string,
  fields: Record<string, unknown>
): Promise<void> => {
  const params = new URLSearchParams();
  for (const k of Object.keys(fields)) params.append("updateMask.fieldPaths", k);
  const res = await fetch(`${BASE}/${path}?${params.toString()}`, {
    method: "PATCH",
    headers: await authHeaders(),
    body: JSON.stringify({ fields: encodeFields(fields) }),
  });
  if (!res.ok) throw new Error(`Firestore PATCH ${path} ${res.status}`);
};

/** Create a document with an auto-generated id in the given collection. */
export const createDocument = async (
  collection: string,
  fields: Record<string, unknown>
): Promise<void> => {
  const res = await fetch(`${BASE}/${collection}`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ fields: encodeFields(fields) }),
  });
  if (!res.ok) throw new Error(`Firestore POST ${collection} ${res.status}`);
};

/** Run a structured query; returns decoded fields for each matched document. */
export const runQuery = async (
  structuredQuery: unknown
): Promise<Record<string, unknown>[]> => {
  const res = await fetch(`${BASE}:runQuery`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ structuredQuery }),
  });
  if (!res.ok) throw new Error(`Firestore runQuery ${res.status}`);
  const rows = (await res.json()) as Array<{
    document?: { fields?: Record<string, FsValue> };
  }>;
  return rows
    .filter((r) => r.document)
    .map((r) => decodeFields(r.document!.fields ?? {}));
};
