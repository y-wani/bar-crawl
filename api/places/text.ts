// api/places/text.ts
//
// POST { query, bias? } -> { bar: Bar | null }
// Auth-gated, rate-limited proxy in front of Google Places searchText
// (used by the bar-list importer, one call per pasted line).

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  requirePost,
  verifyAuth,
  enforceRateLimit,
  buckets,
  readJson,
} from "../_lib/guard";
import { searchPlaceByText } from "../_lib/places";

interface Body {
  query?: string;
  bias?: { lat: number; lng: number };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requirePost(req, res)) return;
  const user = await verifyAuth(req, res);
  if (!user) return;

  const { minute, day } = buckets();
  // Importer fans one call per line, so allow a higher ceiling than area search.
  const ok = await enforceRateLimit(
    user.uid,
    "places-text",
    [
      { ...minute, limit: 60 },
      { ...day, limit: 300 },
    ],
    res
  );
  if (!ok) return;

  const { query, bias } = readJson<Body>(req);
  if (typeof query !== "string" || !query.trim()) {
    res.status(400).json({ error: "query required" });
    return;
  }

  try {
    const bar = await searchPlaceByText(query, bias);
    res.status(200).json({ bar });
  } catch (err) {
    console.error("places/text failed:", err);
    res.status(502).json({ error: "Upstream Places request failed" });
  }
}
