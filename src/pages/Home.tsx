// src/pages/Home.tsx

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { Sidebar } from "../components/Sidebar";
import { MapContainer, type MapBounds } from "../components/MapContainer";
import { useAuth } from "../context/useAuth";
import type { Bar } from "../components/BarListItem";
import { MapSearchControl } from "../components/MapSearchControl";
import { debounce } from "lodash";
import type { Feature } from "geojson";
import {
  getCachedBars,
  cacheBars,
  getDefaultLocationCache,
} from "../services/barCacheService";
import LoadingSpinner from "../components/LoadingSpinner";
import { useCacheManager } from "../hooks/useCacheManager";
import LocationTutorial from "../components/LocationTutorial";
import LocationPermission from "../components/LocationPermission";
import { useLocationPermission } from "../hooks/useLocationPermission";

export interface AppBat extends Bar {
  location: {
    type: "Point";
    coordinates: [number, number];
  };
}

// Mapbox API response types
interface MapboxFeature {
  properties: {
    mapbox_id: string;
    name: string;
  };
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
}

const MAPBOX_ACCESS_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

// Calculate distance between two points using Haversine formula
const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 3959; // Earth's radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const Home: React.FC = () => {
  const { user, signout } = useAuth();

  // Initialize cache management
  useCacheManager();

  // Location permission hook
  const {
    coords: userLocation,
    permission: locationPermission,
    getUserLocation,
    markUserConsent,
  } = useLocationPermission();

  const [bars, setBars] = useState<AppBat[]>([]);
  const [selectedBarIds, setSelectedBarIds] = useState<Set<string>>(new Set());
  const [hoveredBarId, setHoveredBarId] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([
    -83.0007, 39.9612,
  ]);
  const [searchRadius, setSearchRadius] = useState<number>(1);
  const [searchedLocation, setSearchedLocation] = useState("Columbus, Ohio");
  const [isLoading, setIsLoading] = useState(true);
  const [showOnlyInRadius, setShowOnlyInRadius] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [hasInitialBars, setHasInitialBars] = useState(false);
  const [showLocationPermission, setShowLocationPermission] = useState(false);
  const [showTutorial, setShowTutorial] = useState(() => {
    const seen = localStorage.getItem("barCrawlTutorialSeen");
    return !seen;
  });
  const [hasManualSearch, setHasManualSearch] = useState(false);

  // Track last fetch location and cached areas to prevent unnecessary fetches
  const lastFetchCenter = useRef<[number, number] | null>(null);
  const fetchedAreas = useRef<Set<string>>(new Set());
  const hasInitiallyFetched = useRef(false);

  // Calculate bars within radius
  const barsInRadius = useMemo(() => {
    return bars.filter((bar) => {
      if (!bar.location?.coordinates) return false;
      const [barLng, barLat] = bar.location.coordinates;
      const [centerLng, centerLat] = mapCenter;
      const distance = calculateDistance(centerLat, centerLng, barLat, barLng);
      return distance <= searchRadius;
    }).length;
  }, [bars, mapCenter, searchRadius]);

  // Filter bars based on radius setting for map display
  const barsForMap = useMemo(() => {
    if (!showOnlyInRadius) {
      return bars; // Show all bars when radius filter is off
    }

    return bars.filter((bar) => {
      if (!bar.location?.coordinates) return false;
      const [barLng, barLat] = bar.location.coordinates;
      const [centerLng, centerLat] = mapCenter;
      const distance = calculateDistance(centerLat, centerLng, barLat, barLng);
      return distance <= searchRadius;
    });
  }, [bars, showOnlyInRadius, mapCenter, searchRadius]);

  // Function to clear cache when needed (for new searches)
  const clearFetchCache = useCallback(() => {
    fetchedAreas.current.clear();
    lastFetchCenter.current = null;
    console.log("🧹 Fetch cache cleared");
  }, []);

  // Helper function to generate cache key for an area
  const generateAreaKey = (center: [number, number], radiusKm: number = 2) => {
    // Round to reduce cache key variations for nearby locations
    const lat = Math.round(center[1] * 100) / 100; // 2 decimal places ~1km precision
    const lng = Math.round(center[0] * 100) / 100;
    return `${lat},${lng},${radiusKm}`;
  };

  // Function to check if we should fetch bars (distance threshold check)
  const shouldFetchBars = (newCenter: [number, number]) => {
    if (!lastFetchCenter.current) return true;

    const [lastLng, lastLat] = lastFetchCenter.current;
    const [newLng, newLat] = newCenter;
    const distance = calculateDistance(lastLat, lastLng, newLat, newLng);

    // Only fetch if moved more than 0.5 miles
    const threshold = 1;
    console.log(
      `🚀 Distance moved: ${distance.toFixed(
        2
      )} miles (threshold: ${threshold})`
    );
    return distance > threshold;
  };

  // Function to fetch bars within specific map bounds
  const fetchBarsInArea = useCallback(
    async (
      bounds: MapBounds | [number, number],
      forceRefetch = false,
      useCache = true
    ) => {
      let centerCoords: [number, number];

      // Determine center coordinates for distance calculation
      if (Array.isArray(bounds) && bounds.length === 4) {
        centerCoords = [
          (bounds[0] + bounds[2]) / 2,
          (bounds[1] + bounds[3]) / 2,
        ];
      } else if (Array.isArray(bounds) && bounds.length === 2) {
        centerCoords = bounds;
      } else {
        centerCoords = mapCenter;
      }

      // Check if we should fetch (distance threshold + caching)
      const areaKey = generateAreaKey(centerCoords);
      const hasBeenFetched = fetchedAreas.current.has(areaKey);
      const shouldFetch =
        forceRefetch || !hasBeenFetched || shouldFetchBars(centerCoords);

      if (!shouldFetch) {
        console.log(
          "⏭️ Skipping fetch - area already fetched or distance too small"
        );
        return;
      }

      console.log("🔍 Fetching bars for area:", centerCoords, "Key:", areaKey);
      setIsLoading(true);

      // Try cache first if enabled
      if (useCache && !forceRefetch) {
        try {
          const cacheResult = await getCachedBars(
            centerCoords[1],
            centerCoords[0]
          );
          if (cacheResult.isFromCache && cacheResult.bars.length > 0) {
            console.log(
              `🎯 Loaded ${
                cacheResult.bars.length
              } bars from cache (${cacheResult.cacheAge?.toFixed(1)}h old)`
            );

            // Update tracking variables
            lastFetchCenter.current = centerCoords;
            fetchedAreas.current.add(areaKey);
            hasInitiallyFetched.current = true;

            // Merge with existing bars
            setBars((prevBars) => {
              const existingBarIds = new Set(prevBars.map((bar) => bar.id));
              const newBars = cacheResult.bars.filter(
                (bar) => !existingBarIds.has(bar.id)
              );
              const mergedBars = [...prevBars, ...newBars];
              console.log(
                `📊 Total bars: ${mergedBars.length} (${newBars.length} new from cache, ${prevBars.length} existing)`
              );
              return mergedBars;
            });

            setIsLoading(false);
            setHasInitialBars(true);
            return;
          }
        } catch (error) {
          console.error("Error loading from cache:", error);
        }
      }
      const categories = ["bar", "pub", "nightclub"];
      const allBars: AppBat[] = [];
      const fetchedBarIds = new Set<string>();

      const searchParams = new URLSearchParams({
        access_token: MAPBOX_ACCESS_TOKEN,
        limit: "25",
      });

      if (Array.isArray(bounds) && bounds.length === 4) {
        searchParams.set("bbox", bounds.join(","));
      } else if (Array.isArray(bounds) && bounds.length === 2) {
        searchParams.set("proximity", bounds.join(","));
      }

      for (const category of categories) {
        const barsUrl = `https://api.mapbox.com/search/searchbox/v1/category/${category}?${searchParams.toString()}`;

        try {
          const barsResponse = await fetch(barsUrl);
          if (!barsResponse.ok) continue;
          const barsData = await barsResponse.json();

          if (barsData.features) {
            const newBars: AppBat[] = barsData.features.map(
              (feature: MapboxFeature) => {
                const [barLng, barLat] = feature.geometry.coordinates;
                const [centerLng, centerLat] = centerCoords;
                const distance = calculateDistance(
                  centerLat,
                  centerLng,
                  barLat,
                  barLng
                );

                return {
                  id: feature.properties.mapbox_id,
                  name: feature.properties.name || "Unknown Bar",
                  rating: parseFloat((Math.random() * 1.5 + 3.5).toFixed(1)),
                  distance: distance,
                  location: feature.geometry,
                };
              }
            );

            newBars.forEach((bar) => {
              if (!fetchedBarIds.has(bar.id)) {
                allBars.push(bar);
                fetchedBarIds.add(bar.id);
              }
            });
          }
        } catch (error) {
          console.error(`Error fetching category ${category}:`, error);
        }
      }

      console.log(
        `🍺 Fetched ${allBars.length} bars from API:`,
        allBars.map((bar) => ({
          name: bar.name,
          distance: bar.distance.toFixed(2),
          rating: bar.rating,
          coordinates: bar.location.coordinates,
        }))
      );
      // Update tracking variables
      lastFetchCenter.current = centerCoords;
      fetchedAreas.current.add(areaKey);
      hasInitiallyFetched.current = true;

      // Cache the fetched data to Firebase
      if (allBars.length > 0) {
        try {
          await cacheBars(
            centerCoords[1],
            centerCoords[0],
            allBars,
            searchedLocation
          );
        } catch (error) {
          console.error("Error caching bars:", error);
        }
      }

      // Merge with existing bars to avoid losing previously fetched bars
      setBars((prevBars) => {
        const existingBarIds = new Set(prevBars.map((bar) => bar.id));
        const newBars = allBars.filter((bar) => !existingBarIds.has(bar.id));
        const mergedBars = [...prevBars, ...newBars];
        console.log(
          `📊 Total bars: ${mergedBars.length} (${newBars.length} new, ${prevBars.length} existing)`
        );
        return mergedBars;
      });

      setIsLoading(false);
      setHasInitialBars(true);
    },
    [mapCenter]
  );

  // --- UPDATED: Geocode search to use the new fetch function ---
  const handleLocationSearch = async (location: string) => {
    setIsLoading(true);
    setSearchedLocation(location);
    setSelectedBarIds(new Set());
    setHoveredBarId(null);
    setHasManualSearch(true); // Mark that user has done a manual search
    try {
      const geocodeUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
        location
      )}.json?access_token=${MAPBOX_ACCESS_TOKEN}`;
      const geoResponse = await fetch(geocodeUrl);
      const geoData = await geoResponse.json();
      if (!geoData.features?.length) {
        setBars([]);
        setIsLoading(false);
        return;
      }
      const [lng, lat] = geoData.features[0].center;
      setMapCenter([lng, lat]);

      // Clear cache and force refetch for new search location
      clearFetchCache();
      setBars([]); // Clear existing bars for new location
      fetchBarsInArea([lng, lat], true);
    } catch (error) {
      console.error("Geocoding failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Optimized debounced handler for when map view changes
  const debouncedFetchBars = useMemo(
    () =>
      debounce((bounds: MapBounds) => {
        // Only fetch if we've moved significantly
        const centerCoords: [number, number] = [
          (bounds[0] + bounds[2]) / 2,
          (bounds[1] + bounds[3]) / 2,
        ];

        if (shouldFetchBars(centerCoords)) {
          console.log("🗺️ Map moved significantly, fetching new bars");
          fetchBarsInArea(bounds);
          setSearchedLocation("Current map area");
        } else {
          console.log("🗺️ Map movement too small, skipping fetch");
        }
      }, 1200), // Increased debounce time to reduce unnecessary calls
    [fetchBarsInArea]
  );

  const handleMapViewChange = useCallback(
    (bounds: MapBounds) => {
      // Only trigger if we have initially fetched bars
      if (hasInitiallyFetched.current) {
        debouncedFetchBars(bounds);
      }
    },
    [debouncedFetchBars]
  );

  // Handle location permission and user location
  useEffect(() => {
    const handleLocationPermission = async () => {
      // If already granted and we have coordinates
      if (locationPermission === "granted" && userLocation && !hasManualSearch) {
        setMapCenter(userLocation);
        setSearchedLocation("Your Location");
        clearFetchCache();
        setBars([]);
        await fetchBarsInArea(userLocation, true, true);
        return;
      }

      // Show once: respect stored consent marker
      const consentSet = localStorage.getItem("locationUserConsent") === "true";
      if (
        !consentSet &&
        (locationPermission === "prompt" || locationPermission === "unknown")
      ) {
        setShowLocationPermission(true);
      }
    };

    handleLocationPermission();
  }, [
    locationPermission,
    userLocation,
    hasManualSearch,
    fetchBarsInArea,
    clearFetchCache,
  ]);

  // Handle location permission callbacks
  const handleLocationGranted = async (coords: [number, number]) => {
    console.log("📍 Location granted:", coords);
    markUserConsent("granted");
    setMapCenter(coords);
    setSearchedLocation("Your Location");
    setShowLocationPermission(false);
    setHasManualSearch(false); // Reset manual search flag since user granted location

    // Clear cache and fetch bars for user location
    clearFetchCache();
    setBars([]);
    await fetchBarsInArea(coords, true, true);
  };

  const handleLocationDenied = () => {
    console.log("📍 Location denied");
    markUserConsent("denied");
    setShowLocationPermission(false);
    // Continue with default location
  };

  const handleLocationSkip = () => {
    console.log("📍 Location permission skipped");
    markUserConsent("denied"); // Treat skip as denial
    setShowLocationPermission(false);
    // Continue with default location
  };

  // Handle "Use My Location" button click from search control
  const handleUseLocationClick = async () => {
    // If user has already granted permission and we have their location, use it
    if (locationPermission === "granted" && userLocation) {
      console.log("📍 Using stored user location:", userLocation);
      setMapCenter(userLocation);
      setSearchedLocation("Your Location");
      setHasManualSearch(false); // Reset manual search flag since user chose to use location

      // Clear cache and fetch bars for user location
      clearFetchCache();
      setBars([]);
      await fetchBarsInArea(userLocation, true, true);
      return;
    }

    // If user has denied permission before, show a message or ask again
    if (locationPermission === "denied") {
      // Reset user consent to allow them to try again
      localStorage.removeItem("locationUserConsent");
      localStorage.removeItem("locationPermission");
      setShowLocationPermission(true);
      return;
    }

    // If permission is unknown or prompt, show the permission dialog
    if (locationPermission === "unknown" || locationPermission === "prompt") {
      setShowLocationPermission(true);
      return;
    }
  };

  // Load cached data immediately on component mount
  useEffect(() => {
    const loadInitialBars = async () => {
      if (hasInitiallyFetched.current) return;

      console.log("🚀 Loading initial bars...");
      setIsLoading(true);

      try {
        // Try to load default location cache first
        const defaultCache = await getDefaultLocationCache();

        if (defaultCache.isFromCache && defaultCache.bars.length > 0) {
          console.log(
            `🎯 Loaded ${defaultCache.bars.length} bars from default cache`
          );
          setBars(defaultCache.bars);
          hasInitiallyFetched.current = true;
          setHasInitialBars(true);
          // Set timeout to show map after bars are loaded
          setTimeout(() => setIsMapReady(true), 500);
          return;
        }

        // If no cache, fetch fresh data
        console.log("📡 No cache found, fetching fresh data...");
        await fetchBarsInArea(mapCenter, true, false); // Force fresh fetch, no cache

        // Set timeout to show map after bars are loaded
        setTimeout(() => setIsMapReady(true), 1000);
      } catch (error) {
        console.error("Error loading initial bars:", error);
        setIsMapReady(true); // Show map even if bars fail to load
      } finally {
        setIsLoading(false);
      }
    };

    loadInitialBars();
  }, []); // Empty dependency array for one-time initial load

  // const selectedBars = useMemo(
  //   () => bars.filter((bar) => selectedBarIds.has(bar.id)),
  //   [bars, selectedBarIds]
  // );

  const handleToggleBar = (barId: string) =>
    setSelectedBarIds((prev) => {
      const next = new Set(prev);
      if (next.has(barId)) {
        next.delete(barId);
      } else {
        next.add(barId);
      }
      return next;
    });

  // New callback for slider radius changes
  const handleRadiusChange = (radius: number) => {
    setSearchRadius(radius);
  };

  // Handler for radius filter toggle
  const handleRadiusFilterToggle = (showOnlyInRadius: boolean) => {
    setShowOnlyInRadius(showOnlyInRadius);
  };

  // Handler for draw complete events
  const handleDrawComplete = (feature: Feature | null) => {
    // TODO: Implement filtering bars within drawn polygon
    console.log("Draw complete:", feature);
  };

  // Show loading screen until we have initial bars and map is ready
  if (!hasInitialBars || !isMapReady) {
    return (
      <LoadingSpinner
        message={
          !hasInitialBars
            ? "Loading your local bar scene..."
            : "Preparing the ultimate crawl map..."
        }
      />
    );
  }

  return (
    <div className="planner-page">
      <Sidebar
        user={user}
        onSignOut={signout}
        bars={bars}
        selectedBarIds={selectedBarIds}
        hoveredBarId={hoveredBarId}
        onToggleBar={handleToggleBar}
        onHoverBar={setHoveredBarId}
        searchedLocation={searchedLocation}
        mapCenter={mapCenter}
        radius={searchRadius}
        showOnlyInRadius={showOnlyInRadius}
      />

      <div className="map-wrapper">
        <MapSearchControl
          onSearch={handleLocationSearch}
          onRadiusChange={handleRadiusChange}
          onRadiusFilterToggle={handleRadiusFilterToggle}
          onUseLocation={handleUseLocationClick}
          isLoading={isLoading}
          initialLocation={searchedLocation}
          initialRadius={searchRadius}
          showOnlyInRadius={showOnlyInRadius}
          barsInRadius={barsInRadius}
          totalBars={bars.length}
          showLocationButton={true}
        />

        <MapContainer
          center={mapCenter}
          radius={searchRadius} // <-- now dynamic
          bars={barsForMap}
          selectedBarIds={selectedBarIds}
          hoveredBarId={hoveredBarId}
          onToggleBar={handleToggleBar}
          onHoverBar={setHoveredBarId}
          onMapViewChange={handleMapViewChange}
          onDrawComplete={handleDrawComplete}
          isLoadingBars={isLoading}
        />
      </div>

      <LocationTutorial
        isVisible={showTutorial}
        onClose={() => {
          setShowTutorial(false);
          // Mark tutorial as seen in localStorage so it never shows again
          localStorage.setItem("barCrawlTutorialSeen", "true");
        }}
      />

      <LocationPermission
        isVisible={showLocationPermission}
        onLocationGranted={handleLocationGranted}
        onLocationDenied={handleLocationDenied}
        onSkip={handleLocationSkip}
        getUserLocation={getUserLocation}
      />
    </div>
  );
};

export default Home;
