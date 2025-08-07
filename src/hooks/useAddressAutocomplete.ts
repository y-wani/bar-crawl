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
}

export const useAddressAutocomplete = ({
  debounceMs = 300,
  maxResults = 5,
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
        const response = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
            query
          )}.json?access_token=${MAPBOX_ACCESS_TOKEN}&limit=${maxResults}&types=address,poi,place&autocomplete=true`
        );

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.features) {
          return data.features.map((feature: any, index: number) => ({
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
    [maxResults]
  );

  const getSuggestions = useCallback(
    async (query: string) => {
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
        } catch (err) {
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