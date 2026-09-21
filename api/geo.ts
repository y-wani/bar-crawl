// api/geo.ts
//
// Coarse, IP-derived location for the first paint of /home.
//
// Vercel attaches `x-vercel-ip-*` headers to every request at the edge, so this
// is a pure header read: no secrets, no external API call, no per-request cost.
// It's deliberately unauthenticated — it discloses nothing the caller doesn't
// already know, namely the approximate city their own IP resolves to.
//
// Used only to centre the map somewhere relevant before the visitor has done
// anything. Precise location still comes from the browser geolocation prompt,
// which is user-initiated (see SidebarHeader's "Use my location").

import type { VercelRequest, VercelResponse } from "@vercel/node";

export interface GeoResponse {
  available: boolean;
  lat?: number;
  lng?: number;
  /** Human-readable label for the search field, e.g. "Austin, TX". */
  label?: string;
}

const header = (req: VercelRequest, name: string): string | undefined => {
  const v = req.headers[name];
  const raw = Array.isArray(v) ? v[0] : v;
  if (!raw) return undefined;
  // Vercel percent-encodes non-ASCII city names (e.g. "Z%C3%BCrich").
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

export default function handler(req: VercelRequest, res: VercelResponse): void {
  // Edge-cached per POP for an hour: the answer only varies by IP region, and
  // a stale city is harmless (the visitor can search or share precise coords).
  res.setHeader("Cache-Control", "public, s-maxage=3600, max-age=600");

  const lat = Number(header(req, "x-vercel-ip-latitude"));
  const lng = Number(header(req, "x-vercel-ip-longitude"));

  // Absent in local dev (`vite`/`vercel dev` without an edge hop) and for some
  // IP ranges Vercel can't resolve. Callers fall back to their own default.
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    res.status(200).json({ available: false } satisfies GeoResponse);
    return;
  }

  const city = header(req, "x-vercel-ip-city");
  const region = header(req, "x-vercel-ip-country-region");
  const label = city ? (region ? `${city}, ${region}` : city) : undefined;

  res.status(200).json({ available: true, lat, lng, label } satisfies GeoResponse);
}
