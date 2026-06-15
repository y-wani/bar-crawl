// api/_lib/cache.ts
//
// Server-owned bar cache (Firestore collection barCacheV5). Clients may READ
// this collection but no longer WRITE it (see firestore.rules) — writes happen
// here via the Admin SDK, so the shared cache can't be poisoned with fake
// venues. The proxy also reads the cache BEFORE calling Google, so even a
// client that bypasses its own cache check rarely bills a Places request.

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "./firebaseAdmin";
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

interface CachedArea {
  centerLat: number;
  centerLng: number;
  bars: Bar[];
  fetchedAt?: Timestamp;
}

/** Return cached bars for a nearby, unexpired area, or null on miss. */
export const readBarCache = async (
  lat: number,
  lng: number
): Promise<Bar[] | null> => {
  try {
    const snap = await adminDb()
      .collection(COLLECTION)
      .orderBy("fetchedAt", "desc")
      .limit(50)
      .get();

    const now = Date.now();
    for (const doc of snap.docs) {
      const d = doc.data() as CachedArea;
      if (typeof d.centerLat !== "number" || typeof d.centerLng !== "number")
        continue;
      if (milesBetween(lat, lng, d.centerLat, d.centerLng) > SEARCH_RADIUS_MILES)
        continue;
      const fetchedMs = d.fetchedAt?.toMillis?.() ?? 0;
      if (now - fetchedMs < EXPIRY_HOURS * 3600 * 1000) {
        return Array.isArray(d.bars) ? d.bars : null;
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
    await adminDb().collection(COLLECTION).add({
      centerLat: lat,
      centerLng: lng,
      radius: radiusMiles,
      bars,
      fetchedAt: FieldValue.serverTimestamp(),
      location: "",
    });
  } catch (err) {
    console.error("writeBarCache failed:", err);
  }
};
