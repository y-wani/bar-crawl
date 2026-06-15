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
    typeof centerLat !== "number" ||
    typeof centerLng !== "number" ||
    typeof radiusMeters !== "number"
  ) {
    res.status(400).json({ error: "centerLat, centerLng, radiusMeters required" });
    return;
  }

  try {
    const bars = await fetchNearbyBars(centerLat, centerLng, radiusMeters);
    res.status(200).json({ bars });
  } catch (err) {
    console.error("places/nearby failed:", err);
    res.status(502).json({ error: "Upstream Places request failed" });
  }
}
