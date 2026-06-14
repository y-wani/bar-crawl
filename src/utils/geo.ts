// src/utils/geo.ts
//
// Shared geo helpers for the live crawl feature.
// NOTE: several components still carry their own Haversine copies
// (Route.tsx, Home.tsx, Sidebar.tsx, BarList.tsx, SaveCrawlModal.tsx) —
// migrating them here is a welcome future refactor.

/** Great-circle distance in miles between two [lng, lat] coordinates. */
export const haversineMiles = (
  coord1: [number, number],
  coord2: [number, number]
): number => {
  const R = 3959; // Earth's radius in miles
  const dLat = ((coord2[1] - coord1[1]) * Math.PI) / 180;
  const dLon = ((coord2[0] - coord1[0]) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((coord1[1] * Math.PI) / 180) *
      Math.cos((coord2[1] * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export const WALKING_MPH = 3;

/** Rough walking ETA in minutes for a distance in miles (never below 1). */
export const walkingEtaMinutes = (miles: number): number =>
  Math.max(1, Math.round((miles / WALKING_MPH) * 60));

/** Auto check-in geofence radius (~50 meters). */
export const GEOFENCE_MILES = 0.031;
