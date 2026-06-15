// api/places/nearby.ts
//
// POST { centerLat, centerLng, radiusMeters } -> Bar[]
// Auth-gated, rate-limited proxy in front of Google Places searchNearby.
// One client request triggers the 4-call fan-out server-side.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  requirePost,
  verifyAuth,
  enforceRateLimit,
  buckets,
  readJson,
} from "../_lib/guard";
import { fetchNearbyBars } from "../_lib/places";

interface Body {
  centerLat?: number;
  centerLng?: number;
  radiusMeters?: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requirePost(req, res)) return;
  const user = await verifyAuth(req, res);
  if (!user) return;

  const { minute, day } = buckets();
  // Each call = 4 billed Google searches, so keep the area-search budget tight.
  const ok = await enforceRateLimit(
    user.uid,
    "places-nearby",
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

  try {
    const bars = await fetchNearbyBars(
      centerLat as number,
      centerLng as number,
      radiusMeters as number
    );
    res.status(200).json({ bars });
  } catch (err) {
    console.error("places/nearby failed:", err);
    res.status(502).json({ error: "Upstream Places request failed" });
  }
}
