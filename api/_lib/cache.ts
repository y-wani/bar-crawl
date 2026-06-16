// api/_lib/cache.ts
//
// Server-owned bar cache (Firestore collection barCacheV5) over the REST API.
// Clients may READ this collection but no longer WRITE it (see firestore.rules)
// — writes happen here via the service-account-authenticated REST calls, so the
// shared cache can't be poisoned. The proxy reads the cache BEFORE calling
// Google, so a client that bypasses its own cache check rarely bills a request.

import { runQuery, createDocument } from "./firestore";
import type { Bar } from "./places";

const COLLECTION = "barCacheV5";
const EXPIRY_HOURS = 24;
const SEARCH_RADIUS_MILES = 2; // a cached area within this radius counts as a hit

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
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/** Return cached bars for a nearby, unexpired area, or null on miss. */
export const readBarCache = async (
  lat: number,
  lng: number
): Promise<Bar[] | null> => {
  try {
    const docs = await runQuery({
      from: [{ collectionId: COLLECTION }],
      orderBy: [{ field: { fieldPath: "fetchedAt" }, direction: "DESCENDING" }],
      limit: 50,
    });

    const now = Date.now();
    for (const d of docs) {
      const cLat = d.centerLat;
      const cLng = d.centerLng;
      if (typeof cLat !== "number" || typeof cLng !== "number") continue;
      if (milesBetween(lat, lng, cLat, cLng) > SEARCH_RADIUS_MILES) continue;
      const fetchedMs = typeof d.fetchedAt === "number" ? d.fetchedAt : 0;
      if (now - fetchedMs < EXPIRY_HOURS * 3600 * 1000) {
        return Array.isArray(d.bars) ? (d.bars as Bar[]) : null;
      }
    }
  } catch (err) {
    // A cache-read failure should never block a fresh fetch.
    console.error("readBarCache failed:", err);
  }
  return null;
};

/** Persist a freshly fetched area. Failures are logged, never thrown. */
export const writeBarCache = async (
  lat: number,
  lng: number,
  bars: Bar[],
  radiusMiles: number
): Promise<void> => {
  if (bars.length === 0) return;
  try {
    await createDocument(COLLECTION, {
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
