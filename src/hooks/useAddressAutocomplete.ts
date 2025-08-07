import { useState, useEffect, useCallback, useRef } from "react";

const MAPBOX_ACCESS_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

interface AddressSuggestion {
  id: string;
  place_name: string;
  center: [number, number];
  relevance: number;
  type: string;
}

interface UseAddressAutocompleteProps {
  debounceMs?: number;
  maxResults?: number;
  proximity?: [number, number] | null;
}

export const useAddressAutocomplete = ({
  debounceMs = 300,
  maxResults = 5,
  proximity = null,
}: UseAddressAutocompleteProps = {}) => {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);

  const searchAddresses = useCallback(
    async (query: string): Promise<AddressSuggestion[]> => {
      if (!query.trim() || query.length < 2) {
        return [];
      }

      try {
        const params = new URLSearchParams({
          access_token: MAPBOX_ACCESS_TOKEN,
          limit: maxResults.toString(),
          types: "address,poi,place",
          autocomplete: "true",
        });

        if (proximity) {
          params.append("proximity", proximity.join(","));
        }

        const response = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
            query
          )}.json?${params.toString()}`
        );

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.features) {
          return data.features.map((feature: {
            id?: string;
            place_name: string;
            center: [number, number];
            relevance: number;
            place_type?: string[];
          }, index: number) => ({
            id: feature.id || `suggestion-${index}`,
            place_name: feature.place_name,
            center: feature.center,
            relevance: feature.relevance,
            type: feature.place_type?.[0] || "unknown",
          }));
        }

        return [];
      } catch (err) {
        console.error("Address search failed:", err);
        throw err;
      }
    },
    [maxResults, proximity]
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
  };
};
