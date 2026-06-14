// src/utils/geocode.ts
//
// Thin wrappers over the Mapbox Geocoding API. Used as the manual fallback
// for the bar-list importer: when Google Places can't match a venue, the
// user can still drop a stop by geocoding a raw address/name string.

const MAPBOX_ACCESS_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

export interface GeocodeResult {
  coordinates: [number, number]; // [lng, lat]
  placeName: string;
}

/**
 * Forward geocode a string to coordinates (best match). `acceptTypes`, when
 * given, both filters the request and rejects a result whose place type isn't
 * in the list — Mapbox is reliable for `address` matches but its `poi`
 * name-matching is loose (e.g. "Murphy's Pub Columbus" → a POI in Mexico), so
 * callers pass `["address"]` for trustworthy auto-resolution and the looser
 * `["address","poi"]` only for user-driven manual adds.
 */
export const forwardGeocode = async (
  query: string,
  bias?: { lng: number; lat: number },
  acceptTypes?: string[]
): Promise<GeocodeResult | null> => {
  const trimmed = query.trim();
  if (!trimmed) return null;
  try {
    const proximity = bias ? `&proximity=${bias.lng},${bias.lat}` : "";
    const types = acceptTypes?.length ? `&types=${acceptTypes.join(",")}` : "";
    const url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
        trimmed
      )}.json?limit=1&access_token=${MAPBOX_ACCESS_TOKEN}${proximity}${types}`;
    const response = await fetch(url);
    const data = await response.json();
    const feature = data.features?.[0];
    if (!feature?.center) return null;
    if (
      acceptTypes?.length &&
      !feature.place_type?.some((t: string) => acceptTypes.includes(t))
    ) {
      return null;
    }
    return {
      coordinates: [feature.center[0], feature.center[1]],
      placeName: feature.place_name ?? trimmed,
    };
  } catch (error) {
    console.error("Forward geocode failed:", error);
    return null;
  }
};
