// api/proxy.ts
//
// Single self-contained serverless proxy for all billed third-party calls
// (Google Places searchNearby/searchText, Gemini cleanup). Everything is inlined
// into this one file ON PURPOSE: Vercel's ESM function tracer does not bundle
// our shared local modules (imports of ../lib/* or ./_lib/* resolve to
// "Cannot find module" at runtime), but node_modules like `jose` bundle fine.
// So the only import here is `jose`.
//
// Security: each request must carry a valid Firebase ID token (verified via
// jose + Google JWKS) and, when APPCHECK_ENFORCE=true, a valid App Check token.
// Per-user rate limits + a server-owned cache live in Firestore via its REST
// API, authenticated with a service-account access token. The billed API keys
// live only in server env vars.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { jwtVerify, createRemoteJWKSet, SignJWT, importPKCS8 } from "jose";

// ---------------------------------------------------------------------------
// Project config (public identifiers)
// ---------------------------------------------------------------------------
const PROJECT_ID = "bar-crawl-planner-5985f";
const PROJECT_NUMBER = "235279583042";

interface ServiceAccount {
  client_email: string;
  private_key: string;
}
let saCache: ServiceAccount | undefined;
const getServiceAccount = (): ServiceAccount => {
  if (saCache) return saCache;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT env var is not set");
  const json = JSON.parse(raw) as ServiceAccount;
  json.private_key = json.private_key.replace(/\\n/g, "\n");
  saCache = json;
  return saCache;
};

// ---------------------------------------------------------------------------
// Token verification (jose + Google JWKS)
// ---------------------------------------------------------------------------
const idTokenJwks = createRemoteJWKSet(
  new URL(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
  )
);
const appCheckJwks = createRemoteJWKSet(
  new URL("https://firebaseappcheck.googleapis.com/v1/jwks")
);

const verifyIdToken = async (token: string): Promise<string> => {
  const { payload } = await jwtVerify(token, idTokenJwks, {
    issuer: `https://securetoken.google.com/${PROJECT_ID}`,
    audience: PROJECT_ID,
  });
  if (!payload.sub) throw new Error("ID token missing subject");
  return payload.sub;
};

const verifyAppCheckToken = async (token: string): Promise<void> => {
  await jwtVerify(token, appCheckJwks, {
    issuer: `https://firebaseappcheck.googleapis.com/${PROJECT_NUMBER}`,
    audience: `projects/${PROJECT_NUMBER}`,
  });
};

// ---------------------------------------------------------------------------
// Firestore REST (access token via service-account JWT)
// ---------------------------------------------------------------------------
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const TOKEN_URL = "https://oauth2.googleapis.com/token";

let tokenCache: { token: string; expiresAt: number } | null = null;
const getAccessToken = async (): Promise<string> => {
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token;
  }
  const sa = getServiceAccount();
  const key = await importPKCS8(sa.private_key, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({
    scope: "https://www.googleapis.com/auth/datastore",
  })
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
  if (!res.ok) throw new Error(`Token exchange ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
};

const fsHeaders = async (): Promise<Record<string, string>> => ({
  Authorization: `Bearer ${await getAccessToken()}`,
  "Content-Type": "application/json",
});

type FsValue = Record<string, unknown>;
const encodeValue = (v: unknown): FsValue => {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number")
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
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
  if ("arrayValue" in v)
    return ((v.arrayValue as { values?: FsValue[] }).values ?? []).map(decodeValue);
  if ("mapValue" in v)
    return decodeFields((v.mapValue as { fields?: Record<string, FsValue> }).fields ?? {});
  return null;
};
const decodeFields = (fields: Record<string, FsValue>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(fields)) out[k] = decodeValue(val);
  return out;
};

const fsGet = async (path: string): Promise<Record<string, unknown> | null> => {
  const res = await fetch(`${FS_BASE}/${path}`, { headers: await fsHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore GET ${path} ${res.status}`);
  const data = (await res.json()) as { fields?: Record<string, FsValue> };
  return decodeFields(data.fields ?? {});
};
const fsPatch = async (
  path: string,
  fields: Record<string, unknown>
): Promise<void> => {
  const params = new URLSearchParams();
  for (const k of Object.keys(fields)) params.append("updateMask.fieldPaths", k);
  const res = await fetch(`${FS_BASE}/${path}?${params.toString()}`, {
    method: "PATCH",
    headers: await fsHeaders(),
    body: JSON.stringify({ fields: encodeFields(fields) }),
  });
  if (!res.ok) throw new Error(`Firestore PATCH ${path} ${res.status}`);
};
const fsCreate = async (
  collection: string,
  fields: Record<string, unknown>
): Promise<void> => {
  const res = await fetch(`${FS_BASE}/${collection}`, {
    method: "POST",
    headers: await fsHeaders(),
    body: JSON.stringify({ fields: encodeFields(fields) }),
  });
  if (!res.ok) throw new Error(`Firestore POST ${collection} ${res.status}`);
};
const fsRunQuery = async (
  structuredQuery: unknown
): Promise<Record<string, unknown>[]> => {
  const res = await fetch(`${FS_BASE}:runQuery`, {
    method: "POST",
    headers: await fsHeaders(),
    body: JSON.stringify({ structuredQuery }),
  });
  if (!res.ok) throw new Error(`Firestore runQuery ${res.status}`);
  const rows = (await res.json()) as Array<{
    document?: { fields?: Record<string, FsValue> };
  }>;
  return rows.filter((r) => r.document).map((r) => decodeFields(r.document!.fields ?? {}));
};

// ---------------------------------------------------------------------------
// Guards: App Check, auth, per-user rate limit
// ---------------------------------------------------------------------------
const verifyAppCheck = async (
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

const verifyAuth = async (
  req: VercelRequest,
  res: VercelResponse
): Promise<string | null> => {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer (.+)$/i);
  if (!match) {
    res.status(401).json({ error: "Missing auth token" });
    return null;
  }
  try {
    return await verifyIdToken(match[1]);
  } catch {
    res.status(401).json({ error: "Invalid or expired auth token" });
    return null;
  }
};

interface RlWindow {
  key: string;
  limit: number;
  field: string;
}
const buckets = () => {
  const now = new Date().toISOString();
  return {
    minute: { field: "minute", key: now.slice(0, 16) },
    day: { field: "day", key: now.slice(0, 10) },
  };
};
const enforceRateLimit = async (
  uid: string,
  endpoint: string,
  windows: RlWindow[],
  res: VercelResponse
): Promise<boolean> => {
  try {
    const data = (await fsGet(`rateLimits/${uid}`)) ?? {};
    const updates: Record<string, unknown> = {};
    for (const w of windows) {
      const keyField = `${endpoint}__${w.field}__key`;
      const countField = `${endpoint}__${w.field}__count`;
      const count = data[keyField] === w.key ? Number(data[countField] ?? 0) : 0;
      if (count >= w.limit) {
        res.setHeader("Retry-After", String(w.field === "minute" ? 60 : 3600));
        res.status(429).json({ error: "Rate limit exceeded. Try again later." });
        return false;
      }
      updates[keyField] = w.key;
      updates[countField] = count + 1;
    }
    await fsPatch(`rateLimits/${uid}`, updates);
    return true;
  } catch (err) {
    console.error("rate-limit failed:", err);
    return true; // fail open; the Cloud quota cap is the hard backstop
  }
};

// ---------------------------------------------------------------------------
// Google Places (key from server env)
// ---------------------------------------------------------------------------
const PLACES_KEY = () => {
  const k = process.env.GOOGLE_PLACES_API_KEY;
  if (!k) throw new Error("GOOGLE_PLACES_API_KEY env var is not set");
  return k;
};
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.formattedAddress",
  "places.currentOpeningHours.openNow",
  "places.priceLevel",
].join(",");
const PRICE_TEXT: Record<string, string> = {
  PRICE_LEVEL_INEXPENSIVE: "$",
  PRICE_LEVEL_MODERATE: "$$",
  PRICE_LEVEL_EXPENSIVE: "$$$",
  PRICE_LEVEL_VERY_EXPENSIVE: "$$$$",
};
interface GooglePlace {
  id: string;
  displayName?: { text?: string };
  location?: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  formattedAddress?: string;
  currentOpeningHours?: { openNow?: boolean };
  priceLevel?: string;
}
interface Bar {
  id: string;
  name: string;
  rating: number;
  distance: number;
  location: { type: "Point"; coordinates: [number, number] };
  userRatingCount?: number;
  address?: string;
  openNow?: boolean;
  priceText?: string;
}
const milesBetween = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};
const toBar = (p: GooglePlace, centerLat: number, centerLng: number): Bar | null => {
  if (!p.id || !p.location) return null;
  const lat = p.location.latitude;
  const lng = p.location.longitude;
  const priceText = p.priceLevel ? PRICE_TEXT[p.priceLevel] : undefined;
  const openNow = p.currentOpeningHours?.openNow;
  return {
    id: p.id,
    name: p.displayName?.text || "Unknown Bar",
    rating: p.rating ?? 0,
    distance: milesBetween(centerLat, centerLng, lat, lng),
    location: { type: "Point", coordinates: [lng, lat] },
    ...(p.userRatingCount !== undefined && { userRatingCount: p.userRatingCount }),
    ...(p.formattedAddress && { address: p.formattedAddress }),
    ...(openNow !== undefined && { openNow }),
    ...(priceText && { priceText }),
  };
};
const searchNearbyOnce = async (
  centerLat: number,
  centerLng: number,
  radiusMeters: number,
  includedPrimaryTypes: string[],
  rankPreference: "POPULARITY" | "DISTANCE"
): Promise<GooglePlace[]> => {
  const response = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": PLACES_KEY(),
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({
      includedPrimaryTypes,
      maxResultCount: 20,
      rankPreference,
      locationRestriction: {
        circle: {
          center: { latitude: centerLat, longitude: centerLng },
          radius: Math.min(50000, Math.max(1000, radiusMeters)),
        },
      },
    }),
  });
  if (!response.ok) throw new Error(`Places ${response.status}: ${await response.text()}`);
  const data = (await response.json()) as { places?: GooglePlace[] };
  return data.places ?? [];
};
const fetchNearbyBars = async (
  centerLat: number,
  centerLng: number,
  radiusMeters: number
): Promise<Bar[]> => {
  const requests: Array<{ types: string[]; rank: "POPULARITY" | "DISTANCE" }> = [
    { types: ["bar", "wine_bar"], rank: "POPULARITY" },
    { types: ["bar", "wine_bar"], rank: "DISTANCE" },
    { types: ["pub"], rank: "POPULARITY" },
    { types: ["night_club"], rank: "POPULARITY" },
  ];
  const results = await Promise.allSettled(
    requests.map((r) => searchNearbyOnce(centerLat, centerLng, radiusMeters, r.types, r.rank))
  );
  const seen = new Set<string>();
  const bars: Bar[] = [];
  let allFailed = true;
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    allFailed = false;
    for (const p of result.value) {
      if (p.id && !seen.has(p.id)) {
        seen.add(p.id);
        const bar = toBar(p, centerLat, centerLng);
        if (bar) bars.push(bar);
      }
    }
  }
  if (allFailed) {
    const firstError = results.find(
      (r): r is PromiseRejectedResult => r.status === "rejected"
    );
    throw firstError?.reason ?? new Error("Places search failed");
  }
  return bars
    .filter((b) => b.rating > 0 || (b.userRatingCount ?? 0) > 0)
    .sort((a, b) => a.distance - b.distance);
};
const searchPlaceByText = async (
  query: string,
  bias?: { lat: number; lng: number }
): Promise<Bar | null> => {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const body: Record<string, unknown> = { textQuery: trimmed, maxResultCount: 1 };
  if (bias) {
    body.locationBias = {
      circle: { center: { latitude: bias.lat, longitude: bias.lng }, radius: 50000 },
    };
  }
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": PLACES_KEY(),
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Places text ${response.status}: ${await response.text()}`);
  const data = (await response.json()) as { places?: GooglePlace[] };
  const p = data.places?.[0];
  if (!p || !p.location) return null;
  const bar = toBar(p, p.location.latitude, p.location.longitude);
  if (bar) {
    bar.name = p.displayName?.text || trimmed;
    bar.distance = 0;
  }
  return bar;
};

// ---------------------------------------------------------------------------
// Server-owned cache (Firestore barCacheV5)
// ---------------------------------------------------------------------------
const CACHE_COLLECTION = "barCacheV5";
const CACHE_EXPIRY_HOURS = 24;
const CACHE_RADIUS_MILES = 2;
const readBarCache = async (lat: number, lng: number): Promise<Bar[] | null> => {
  try {
    const docs = await fsRunQuery({
      from: [{ collectionId: CACHE_COLLECTION }],
      orderBy: [{ field: { fieldPath: "fetchedAt" }, direction: "DESCENDING" }],
      limit: 50,
    });
    const now = Date.now();
    for (const d of docs) {
      const cLat = d.centerLat;
      const cLng = d.centerLng;
      if (typeof cLat !== "number" || typeof cLng !== "number") continue;
      if (milesBetween(lat, lng, cLat, cLng) > CACHE_RADIUS_MILES) continue;
      const fetchedMs = typeof d.fetchedAt === "number" ? d.fetchedAt : 0;
      if (now - fetchedMs < CACHE_EXPIRY_HOURS * 3600 * 1000) {
        return Array.isArray(d.bars) ? (d.bars as Bar[]) : null;
      }
    }
  } catch (err) {
    console.error("readBarCache failed:", err);
  }
  return null;
};
const writeBarCache = async (
  lat: number,
  lng: number,
  bars: Bar[],
  radiusMiles: number
): Promise<void> => {
  if (bars.length === 0) return;
  try {
    await fsCreate(CACHE_COLLECTION, {
      centerLat: lat,
      centerLng: lng,
      radius: radiusMiles,
      bars: bars as unknown as Record<string, unknown>[],
      fetchedAt: new Date(),
      location: "",
    });
  } catch (err) {
    console.error("writeBarCache failed:", err);
  }
};

// ---------------------------------------------------------------------------
// Gemini cleanup
// ---------------------------------------------------------------------------
const GEMINI_MODEL = "gemini-2.5-flash";
const geminiPrompt = (raw: string): string =>
  `You are cleaning a pasted bar-crawl / pub-crawl lineup so it can be imported into a route planner.

Extract every venue and output ONE per line in the format:
Name, Address

Rules:
- Include the address only if it appears in the input. If there is no address, output just the name.
- Strip all numbering, bullets, times, prices, cover charges, headers, footers, emojis, and commentary.
- Keep EVERY stop, including a line that is only an address (no name) and any
  start / end / "meet here" point — those are valid stops. When unsure whether
  a line is a stop, keep it.
- Do NOT invent or guess addresses. Do NOT add venues that aren't in the input.
- Output ONLY the list — no preamble, no markdown, no blank lines.

Input:
"""
${raw}
"""`;
const cleanBarListWithAI = async (raw: string): Promise<string> => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY env var is not set");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: geminiPrompt(raw) }] }],
        generationConfig: { temperature: 0, responseMimeType: "text/plain" },
      }),
    }
  );
  if (!response.ok) throw new Error(`Gemini ${response.status}: ${await response.text()}`);
  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text =
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text.trim()) throw new Error("Gemini returned no text");
  return text.trim();
};

// ---------------------------------------------------------------------------
// Handler: dispatch on `action`
// ---------------------------------------------------------------------------
const readBody = <T>(req: VercelRequest): T => {
  if (req.body && typeof req.body === "object") return req.body as T;
  if (typeof req.body === "string" && req.body) return JSON.parse(req.body) as T;
  return {} as T;
};

interface Body {
  action?: string;
  centerLat?: number;
  centerLng?: number;
  radiusMeters?: number;
  query?: string;
  bias?: { lat: number; lng: number };
  raw?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!(await verifyAppCheck(req, res))) return;
  const uid = await verifyAuth(req, res);
  if (!uid) return;

  const body = readBody<Body>(req);
  const { minute, day } = buckets();

  try {
    switch (body.action) {
      case "nearby": {
        const ok = await enforceRateLimit(
          uid,
          "placesNearby",
          [
            { ...minute, limit: 10 },
            { ...day, limit: 80 },
          ],
          res
        );
        if (!ok) return;
        const { centerLat, centerLng, radiusMeters } = body;
        if (
          !Number.isFinite(centerLat) ||
          !Number.isFinite(centerLng) ||
          !Number.isFinite(radiusMeters)
        ) {
          res.status(400).json({ error: "centerLat, centerLng, radiusMeters required" });
          return;
        }
        const lat = centerLat as number;
        const lng = centerLng as number;
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
          res.status(400).json({ error: "coordinates out of range" });
          return;
        }
        const cached = await readBarCache(lat, lng);
        if (cached) {
          res.status(200).json({ bars: cached, cached: true });
          return;
        }
        const radius = radiusMeters as number;
        const bars = await fetchNearbyBars(lat, lng, radius);
        await writeBarCache(lat, lng, bars, radius / 1609);
        res.status(200).json({ bars });
        return;
      }

      case "text": {
        const ok = await enforceRateLimit(
          uid,
          "placesText",
          [
            { ...minute, limit: 60 },
            { ...day, limit: 300 },
          ],
          res
        );
        if (!ok) return;
        const { query, bias } = body;
        if (typeof query !== "string" || !query.trim()) {
          res.status(400).json({ error: "query required" });
          return;
        }
        if (query.length > 250) {
          res.status(413).json({ error: "query too long" });
          return;
        }
        const bar = await searchPlaceByText(query, bias);
        res.status(200).json({ bar });
        return;
      }

      case "clean": {
        const ok = await enforceRateLimit(
          uid,
          "aiClean",
          [
            { ...minute, limit: 8 },
            { ...day, limit: 40 },
          ],
          res
        );
        if (!ok) return;
        const { raw } = body;
        if (typeof raw !== "string" || !raw.trim()) {
          res.status(400).json({ error: "raw text required" });
          return;
        }
        if (raw.length > 8000) {
          res.status(413).json({ error: "List too long" });
          return;
        }
        const text = await cleanBarListWithAI(raw);
        res.status(200).json({ text });
        return;
      }

      default:
        res.status(400).json({ error: "Unknown action" });
        return;
    }
  } catch (err) {
    console.error(`proxy action=${body.action} failed:`, err);
    res.status(502).json({ error: "Upstream request failed" });
  }
}
