// api/places/nearby.ts
//
// POST { centerLat, centerLng, radiusMeters } -> Bar[]
// Auth-gated, rate-limited proxy in front of Google Places searchNearby.
// One client request triggers the 4-call fan-out server-side.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  requirePost,
  verifyAuth,
  verifyAppCheck,
  enforceRateLimit,
  buckets,
  readJson,
} from "../_lib/guard";
import { fetchNearbyBars } from "../_lib/places";
import { readBarCache, writeBarCache } from "../_lib/cache";

interface Body {
  centerLat?: number;
  centerLng?: number;
  radiusMeters?: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requirePost(req, res)) return;
  if (!(await verifyAppCheck(req, res))) return;
  const user = await verifyAuth(req, res);
  if (!user) return;

  const { minute, day } = buckets();
  // Each call = 4 billed Google searches, so keep the area-search budget tight.
  const ok = await enforceRateLimit(
    user.uid,
    "placesNearby",
    [
      { ...minute, limit: 10 },
      { ...day, limit: 80 },
    ],
    res
  );
  if (!ok) return;

  const { centerLat, centerLng, radiusMeters } = readJson<Body>(req);
  if (
    !Number.isFinite(centerLat) ||
    !Number.isFinite(centerLng) ||
    !Number.isFinite(radiusMeters)
  ) {
    res.status(400).json({ error: "centerLat, centerLng, radiusMeters required" });
    return;
  }
  // Reject out-of-range coordinates before they cost a billed Google call.
  if (
    (centerLat as number) < -90 ||
    (centerLat as number) > 90 ||
    (centerLng as number) < -180 ||
    (centerLng as number) > 180
  ) {
    res.status(400).json({ error: "coordinates out of range" });
    return;
  }

  const lat = centerLat as number;
  const lng = centerLng as number;
  const radius = radiusMeters as number;

  try {
    // Server-side cache check first — bounds Google spend even if a client
    // skips its own cache read or calls the endpoint directly.
    const cached = await readBarCache(lat, lng);
    if (cached) {
      res.status(200).json({ bars: cached, cached: true });
      return;
    }

    const bars = await fetchNearbyBars(lat, lng, radius);
    await writeBarCache(lat, lng, bars, radius / 1609);
    res.status(200).json({ bars });
  } catch (err) {
    console.error("places/nearby failed:", err);
    res.status(502).json({ error: "Upstream Places request failed" });
  }
}
