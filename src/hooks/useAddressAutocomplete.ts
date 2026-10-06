// src/hooks/useAddressAutocomplete.ts
//
// Start/end location search. Two things it gets right that the old version
// didn't:
//
//  1. It searches WHERE THE USER IS PLANNING. Callers pass `near` (the crawl's
//     area) and optionally `restrictKm`, which drops anything outside a box
//     around it. The old version biased every search toward Columbus, Ohio, and
//     a proximity bias is only a ranking hint anyway — "Zanzibar" typed while
//     planning in Denver came back as Zanzibar, Tanzania.
//
//  2. It uses Mapbox's Search Box API, which knows places and businesses. The
//     older Geocoding v5 endpoint turned "Union Station" into "Un Road" and
//     "Coors Field" into a street in the UK. Geocoding v5 is kept only as a
//     fallback if Search Box fails.
//
// Search Box is billed per SESSION (500/month free, then $3 per 1,000): every
// suggest call while typing plus the one retrieve when something is picked
// count as one session, tied together by `session_token`. Its one-shot
// /forward endpoint would bill every keystroke (~$11.50 per 1,000), so it is
// deliberately not used here.

import { useState, useEffect, useCallback, useRef } from "react";

const MAPBOX_ACCESS_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
const SEARCHBOX = "https://api.mapbox.com/search/searchbox/v1";

export interface AddressSuggestion {
  id: string;
  place_name: string;
  /** [lng, lat]. Undefined on a Search Box suggestion until `resolve` runs. */
  center?: [number, number];
  relevance: number;
  type: string;
  /** Search Box id, used to retrieve coordinates when the suggestion is picked. */
  mapboxId?: string;
}

interface UseAddressAutocompleteProps {
  debounceMs?: number;
  maxResults?: number;
  /** [lng, lat] the search is about — results near it rank first. */
  near?: [number, number] | null;
  /** When set with `near`, results outside a box this many km around it are
   *  dropped entirely. */
  restrictKm?: number;
}

/** [minLng, minLat, maxLng, maxLat] around a point — the Mapbox `bbox` shape. */
export const boxAround = ([lng, lat]: [number, number], km: number): string => {
  const dLat = km / 111.32;
  const dLng = km / (111.32 * Math.cos((lat * Math.PI) / 180));
  return [lng - dLng, lat - dLat, lng + dLng, lat + dLat]
    .map((n) => n.toFixed(4))
    .join(",");
};

const newSessionToken = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

interface SearchBoxSuggestion {
  mapbox_id: string;
  name: string;
  full_address?: string;
  place_formatted?: string;
  feature_type?: string;
}

export const useAddressAutocomplete = ({
  debounceMs = 300,
  maxResults = 5,
  near = null,
  restrictKm,
}: UseAddressAutocompleteProps = {}) => {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);
  const sessionToken = useRef<string>(newSessionToken());

  // Primitive deps: callers pass a fresh array every render.
  const nearLng = near?.[0];
  const nearLat = near?.[1];

  /** Area params shared by both providers. */
  const areaParams = useCallback((): Record<string, string> => {
    if (nearLng === undefined || nearLat === undefined) return {};
    return {
      proximity: `${nearLng},${nearLat}`,
      ...(restrictKm ? { bbox: boxAround([nearLng, nearLat], restrictKm) } : {}),
    };
  }, [nearLng, nearLat, restrictKm]);

  const suggestSearchBox = useCallback(
    async (query: string): Promise<AddressSuggestion[]> => {
      const params = new URLSearchParams({
        q: query,
        access_token: MAPBOX_ACCESS_TOKEN,
        session_token: sessionToken.current,
        limit: maxResults.toString(),
        language: "en",
        types: "poi,address,street,neighborhood,place",
        ...areaParams(),
      });
      const response = await fetch(`${SEARCHBOX}/suggest?${params.toString()}`);
      if (!response.ok) throw new Error(`Search Box ${response.status}`);
      const data = (await response.json()) as { suggestions?: SearchBoxSuggestion[] };
      return (data.suggestions ?? []).map((s, index) => {
        const where = s.full_address || s.place_formatted;
        return {
          id: s.mapbox_id || `suggestion-${index}`,
          mapboxId: s.mapbox_id,
          place_name: where && where !== s.name ? `${s.name}, ${where}` : s.name,
          relevance: 1 - index / 10,
          type: s.feature_type || "poi",
        };
      });
    },
    [maxResults, areaParams]
  );

  // Fallback only: the older geocoder, still confined to the area.
  const suggestGeocodingV5 = useCallback(
    async (query: string): Promise<AddressSuggestion[]> => {
      const params = new URLSearchParams({
        access_token: MAPBOX_ACCESS_TOKEN,
        limit: maxResults.toString(),
        types: "address,poi,place",
        autocomplete: "true",
        ...areaParams(),
      });
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
          query
        )}.json?${params.toString()}`
      );
      if (!response.ok) throw new Error(`Geocoding ${response.status}`);
      const data = await response.json();
      return (data.features ?? []).map(
        (
          feature: {
            id?: string;
            place_name: string;
            center: [number, number];
            relevance: number;
            place_type?: string[];
          },
          index: number
        ) => ({
          id: feature.id || `suggestion-${index}`,
          place_name: feature.place_name,
          center: feature.center,
          relevance: feature.relevance,
          type: feature.place_type?.[0] || "unknown",
        })
      );
    },
    [maxResults, areaParams]
  );

  const searchAddresses = useCallback(
    async (query: string): Promise<AddressSuggestion[]> => {
      if (!query.trim() || query.length < 2) return [];
      try {
        return await suggestSearchBox(query);
      } catch (err) {
        console.warn("Search Box failed, falling back to geocoding:", err);
        return suggestGeocodingV5(query);
      }
    },
    [suggestSearchBox, suggestGeocodingV5]
  );

  /**
   * Coordinates for a picked suggestion. Search Box suggestions carry none, so
   * this is the retrieve call that closes the billing session; a fallback
   * suggestion already has them. Returns null if the place can't be resolved.
   */
  const resolve = useCallback(
    async (suggestion: AddressSuggestion): Promise<AddressSuggestion | null> => {
      if (suggestion.center) return suggestion;
      if (!suggestion.mapboxId) return null;
      try {
        const params = new URLSearchParams({
          access_token: MAPBOX_ACCESS_TOKEN,
          session_token: sessionToken.current,
        });
        const response = await fetch(
          `${SEARCHBOX}/retrieve/${encodeURIComponent(suggestion.mapboxId)}?${params.toString()}`
        );
        if (!response.ok) throw new Error(`Search Box retrieve ${response.status}`);
        const data = (await response.json()) as {
          features?: { geometry?: { coordinates?: [number, number] } }[];
        };
        const coords = data.features?.[0]?.geometry?.coordinates;
        return coords ? { ...suggestion, center: [coords[0], coords[1]] } : null;
      } catch (err) {
        console.error("Couldn't resolve the picked place:", err);
        return null;
      } finally {
        // A retrieve ends the session; the next typing starts a new one.
        sessionToken.current = newSessionToken();
      }
    },
    []
  );

  const getSuggestions = useCallback(
    (query: string) => {
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }

      debounceTimeout.current = setTimeout(async () => {
        if (!query.trim() || query.length < 2) {
          setSuggestions([]);
          setIsLoading(false);
          setError(null);
          return;
        }

        setIsLoading(true);
        setError(null);

        try {
          const results = await searchAddresses(query);
          setSuggestions(results);
        } catch {
          setError("Failed to load address suggestions");
          setSuggestions([]);
        } finally {
          setIsLoading(false);
        }
      }, debounceMs);
    },
    [searchAddresses, debounceMs]
  );

  const clearSuggestions = useCallback(() => {
    setSuggestions([]);
    setError(null);
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }
    };
  }, []);

  return {
    suggestions,
    isLoading,
    error,
    getSuggestions,
    clearSuggestions,
    resolve,
  };
};
