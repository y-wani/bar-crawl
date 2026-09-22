// src/pages/Home.tsx

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { FiPlay } from "react-icons/fi";
import { Sidebar } from "../components/Sidebar";
import { MapContainer, type MapBounds } from "../components/MapContainer";
import { useAuth } from "../context/useAuth";
import { readGuestCrawl, writeGuestCrawl } from "../services/guestCrawlStorage";
import { ApiError } from "../services/apiClient";
import GuestSignupPrompt, {
  type GuestPromptReason,
} from "../components/GuestSignupPrompt";
import {
  getActiveSessionForMember,
  type CrawlSession,
} from "../services/sessionService";
import type { Bar } from "../components/BarListItem";
import { MapSearchControl } from "../components/MapSearchControl";
import { debounce } from "lodash";
import type { Feature, Polygon } from "geojson";
import { booleanPointInPolygon } from "@turf/turf";
import { toast } from "../components/Toaster";
import {
  getCachedBars,
  cacheBars,
  getDefaultLocationCache,
} from "../services/barCacheService";

import { useCacheManager } from "../hooks/useCacheManager";
import PageTransition from "../components/motion/PageTransition";
import LocationTutorial from "../components/LocationTutorial";
import LocationPermission from "../components/LocationPermission";
import { useLocationPermission } from "../hooks/useLocationPermission";
import { useInitialCenter, DEFAULT_CENTER } from "../hooks/useInitialCenter";
import {
  fetchNearbyBars,
  isGooglePlacesEnabled,
} from "../services/placesService";

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

// Dev logging stub — swap for console.log when debugging
const debug = (..._args: unknown[]) => {};

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
  const { user, signout, loading: authLoading, isGuest, ensureGuest } = useAuth();
  const navigate = useNavigate();

  // A guest needs a Firebase uid before ANY cache read: firestore.rules
  // requires request.auth != null on barCacheV5, so a tokenless visitor would
  // see an empty map. Gated on authLoading so a returning signed-in user is
  // never overwritten by a fresh anonymous account mid-restore.
  useEffect(() => {
    if (authLoading || user) return;
    void ensureGuest();
  }, [authLoading, user, ensureGuest]);

  // Resume entry: surface an in-progress crawl so the user can jump back in
  const [activeSession, setActiveSession] = useState<CrawlSession | null>(null);
  useEffect(() => {
    // A guest can never own a crawlSession, and the query would just be denied.
    if (!user || isGuest) return;
    let cancelled = false;
    (async () => {
      const active = await getActiveSessionForMember(user.uid);
      if (!cancelled) setActiveSession(active);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isGuest]);

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
  const [guestPrompt, setGuestPrompt] = useState<GuestPromptReason | null>(null);
  // A crawl already built on /route. Home only ever WROTE this, never read it,
  // so anyone who reached /home after building a crawl — e.g. backing out of
  // signup — saw an empty map and had no route back to their own work. The
  // crawl was never actually lost, just unreachable, which to the person
  // looking at the screen is the same thing.
  const [savedGuestCrawl, setSavedGuestCrawl] = useState<{
    stops: number;
    name?: string;
  } | null>(null);
  useEffect(() => {
    const stored = readGuestCrawl();
    if (stored) {
      setSavedGuestCrawl({
        stops: stored.selectedBars.length,
        name: stored.crawlName,
      });
    }
  }, []);
  const [hoveredBarId, setHoveredBarId] = useState<string | null>(null);
  // Where the map opens: cached precise coords → IP city → Columbus default.
  // The first bar fetch waits on `initialCenter.resolved` so we never fetch
  // the default and then immediately refetch the visitor's real city.
  const initialCenter = useInitialCenter();
  const [mapCenter, setMapCenter] = useState<[number, number]>(
    initialCenter.center
  );
  const [searchRadius, setSearchRadius] = useState<number>(1);
  const [searchedLocation, setSearchedLocation] = useState(initialCenter.label);
  const [isLoading, setIsLoading] = useState(true);
  const [showOnlyInRadius, setShowOnlyInRadius] = useState(false);


  const [showLocationPermission, setShowLocationPermission] = useState(false);
  const [showTutorial, setShowTutorial] = useState(() => {
    const seen = localStorage.getItem("barCrawlTutorialSeen");
    return !seen;
  });
  const [hasManualSearch, setHasManualSearch] = useState(false);
  const [drawnPolygon, setDrawnPolygon] = useState<Feature | null>(null);

  // Track last fetch location and cached areas to prevent unnecessary fetches
  const lastFetchCenter = useRef<[number, number] | null>(null);
  const fetchedAreas = useRef<Set<string>>(new Set());
  // Areas with a fetch currently in flight. fetchedAreas is only populated
  // AFTER a fetch resolves, so two calls for the same area that start before
  // the first finishes both sail past it, both bill Google, and both write a
  // duplicate cache doc. Observed in production: two barCacheV5 docs 121ms
  // apart with identical coordinates to 15 decimal places.
  const inFlightAreas = useRef<Set<string>>(new Set());
  const hasInitiallyFetched = useRef(false);
  // Guards the one-shot position re-request when permission is granted
  // but no coordinates are available (expired stored location)
  const autoLocateAttempted = useRef(false);

  // Adopt the resolved centre once /api/geo answers. Skipped if the visitor
  // already moved the map, searched, or had precise coords to begin with —
  // a late geo answer must never yank them back to their IP city.
  useEffect(() => {
    if (!initialCenter.resolved || hasInitiallyFetched.current) return;
    if (hasManualSearch || userLocation) return;
    setMapCenter(initialCenter.center);
    setSearchedLocation(initialCenter.label);
  }, [
    initialCenter.resolved,
    initialCenter.center,
    initialCenter.label,
    hasManualSearch,
    userLocation,
  ]);

  // Bars inside the user-drawn polygon (all bars when nothing is drawn)
  const polygonFilteredBars = useMemo(() => {
    if (!drawnPolygon || drawnPolygon.geometry.type !== "Polygon") {
      return bars;
    }
    const polygon = drawnPolygon as Feature<Polygon>;
    return bars.filter(
      (bar) =>
        bar.location?.coordinates &&
        booleanPointInPolygon(bar.location.coordinates, polygon)
    );
  }, [bars, drawnPolygon]);

  // Calculate bars within radius
  const barsInRadius = useMemo(() => {
    return polygonFilteredBars.filter((bar) => {
      if (!bar.location?.coordinates) return false;
      const [barLng, barLat] = bar.location.coordinates;
      const [centerLng, centerLat] = mapCenter;
      const distance = calculateDistance(centerLat, centerLng, barLat, barLng);
      return distance <= searchRadius;
    }).length;
  }, [polygonFilteredBars, mapCenter, searchRadius]);

  // Filter bars based on radius setting for map display
  const barsForMap = useMemo(() => {
    if (!showOnlyInRadius) {
      return polygonFilteredBars; // Show all bars when radius filter is off
    }

    return polygonFilteredBars.filter((bar) => {
      if (!bar.location?.coordinates) return false;
      const [barLng, barLat] = bar.location.coordinates;
      const [centerLng, centerLat] = mapCenter;
      const distance = calculateDistance(centerLat, centerLng, barLat, barLng);
      return distance <= searchRadius;
    });
  }, [polygonFilteredBars, showOnlyInRadius, mapCenter, searchRadius]);

  // Function to clear cache when needed (for new searches)
  const clearFetchCache = useCallback(() => {
    fetchedAreas.current.clear();
    lastFetchCenter.current = null;
    debug("🧹 Fetch cache cleared");
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

    // Only refetch after a meaningful pan, so small drags don't reload the
    // markers and "refresh" the map under the user.
    const threshold = 1.8;
    debug(
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
      // No uid yet means no cache read and no proxy call — both would fail.
      // The mint effect above re-runs this once a user exists.
      if (!user) return;

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
        debug(
          "⏭️ Skipping fetch - area already fetched or distance too small"
        );
        return;
      }

      // Set synchronously, before the first await, so a second call for the
      // same area cannot slip through the gap. forceRefetch deliberately does
      // NOT bypass this: a forced refetch still must not run twice at once.
      if (inFlightAreas.current.has(areaKey)) {
        debug("⏭️ Skipping fetch - this area is already being fetched");
        return;
      }
      inFlightAreas.current.add(areaKey);

      debug("🔍 Fetching bars for area:", centerCoords, "Key:", areaKey);
      setIsLoading(true);

      try {
      // Try cache first if enabled
      if (useCache && !forceRefetch) {
        try {
          const cacheResult = await getCachedBars(
            centerCoords[1],
            centerCoords[0]
          );
          if (cacheResult.isFromCache && cacheResult.bars.length > 0) {
            debug(
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
              debug(
                `📊 Total bars: ${mergedBars.length} (${newBars.length} new from cache, ${prevBars.length} existing)`
              );
              return mergedBars;
            });

            setIsLoading(false);
            
            return;
          }
        } catch (error) {
          console.error("Error loading from cache:", error);
        }
      }
      const allBars: AppBat[] = [];

      if (isGooglePlacesEnabled) {
        // Google Places (New): real ratings, review counts, open-now status.
        // Radius scales with the search radius so the "outside radius" list
        // stays meaningful without pulling in another county.
        try {
          const radiusMeters = Math.min(
            50000,
            Math.max(3000, searchRadius * 1609 * 4)
          );
          const placesBars = await fetchNearbyBars(
            centerCoords[1],
            centerCoords[0],
            radiusMeters
          );
          allBars.push(...placesBars);
        } catch (error) {
          // A guest who has exhausted the shared daily pool is not an error
          // state — it is the moment to ask for the account. The "search"
          // reason exists so the copy talks about searches running out rather
          // than claiming their crawl is at risk, which would not be true.
          if (error instanceof ApiError && error.code === "GUEST_QUOTA") {
            setIsLoading(false);
            setGuestPrompt("search");
            return;
          }
          console.error("Error fetching bars from Google Places:", error);
        }
      } else {
        // Legacy fallback: Mapbox category search (no real ratings)
        const categories = ["bar", "pub", "nightclub"];
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
      }

      debug(
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

      // Cache the fetched data. With Google Places enabled (prod) the proxy
      // already writes the shared cache server-side (barCacheV5 is read-only to
      // clients), so we only cache here on the legacy Mapbox fallback path.
      if (allBars.length > 0 && !isGooglePlacesEnabled) {
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
        debug(
          `📊 Total bars: ${mergedBars.length} (${newBars.length} new, ${prevBars.length} existing)`
        );
        return mergedBars;
      });

      setIsLoading(false);
      } finally {
        // Must release on every exit path, including the cache-hit early
        // return and any throw, or the area is locked out for the session.
        inFlightAreas.current.delete(areaKey);
      }
    },
    [mapCenter, searchRadius, user] // eslint-disable-line react-hooks/exhaustive-deps
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
          debug("🗺️ Map moved significantly, fetching new bars");
          fetchBarsInArea(bounds);
          setSearchedLocation("Current map area");
        } else {
          debug("🗺️ Map movement too small, skipping fetch");
        }
      }, 1800), // Longer debounce so panning settles before we refetch
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

      // Permission is granted but we have no coordinates (e.g. the stored
      // location expired its 1h TTL on a return visit). Without this branch
      // nobody ever re-requests the position and the map stays on the
      // Columbus default forever. Fetch once; the resulting state update
      // re-runs this effect and the branch above recenters + refetches.
      if (
        locationPermission === "granted" &&
        !userLocation &&
        !hasManualSearch &&
        !autoLocateAttempted.current
      ) {
        autoLocateAttempted.current = true;
        try {
          await getUserLocation();
        } catch (error) {
          debug("📍 Auto-locate failed, staying on default center", error);
        }
        return;
      }

      // Deliberately nothing here for first-time visitors. The permission
      // modal used to auto-open over an unpainted map, which blocked every
      // new user before they saw a single bar. Location is now opt-in via the
      // crosshair button in MapSearchControl (handleUseLocationClick), which
      // iOS Safari — roughly half our traffic — also honours far more
      // reliably than a geolocation call fired on page load.
    };

    handleLocationPermission();
  }, [
    locationPermission,
    userLocation,
    hasManualSearch,
    fetchBarsInArea,
    clearFetchCache,
    getUserLocation,
  ]);

  // Safety net: close the permission modal the moment location is obtained,
  // no matter which path delivered it. The modal-button callback can fail to
  // fire (e.g. getUserLocation times out / returns null on desktops without
  // GPS even after the browser granted), which used to leave the modal stuck
  // open over a populated map.
  useEffect(() => {
    if (showLocationPermission && (locationPermission === "granted" || userLocation)) {
      setShowLocationPermission(false);
    }
  }, [showLocationPermission, locationPermission, userLocation]);

  // Handle location permission callbacks
  const handleLocationGranted = async (coords: [number, number]) => {
    debug("📍 Location granted:", coords);
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
    debug("📍 Location denied");
    markUserConsent("denied");
    setShowLocationPermission(false);
    // Continue with default location
  };

  const handleLocationSkip = () => {
    debug("📍 Location permission skipped");
    markUserConsent("denied"); // Treat skip as denial
    setShowLocationPermission(false);
    // Continue with default location
  };

  // Handle "Use My Location" button click from search control
  const handleUseLocationClick = async () => {
    // If user has already granted permission and we have their location, use it
    if (locationPermission === "granted" && userLocation) {
      debug("📍 Using stored user location:", userLocation);
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

  // Load bars for the resolved centre. Gated on `resolved` so a visitor in
  // London doesn't pay for a Columbus fetch before their own city's.
  useEffect(() => {
    if (!initialCenter.resolved) return;
    // A guest's anonymous uid is minted AFTER /api/geo resolves the centre, so
    // without waiting here the first fetch hit fetchBarsInArea's `!user` guard
    // and never retried — the map sat empty until the visitor searched by hand.
    if (!user) return;

    const loadInitialBars = async () => {
      if (hasInitiallyFetched.current) return;

      debug("🚀 Loading initial bars for", initialCenter.label);
      setIsLoading(true);

      try {
        const onDefault =
          initialCenter.center[0] === DEFAULT_CENTER[0] &&
          initialCenter.center[1] === DEFAULT_CENTER[1];

        // The default-location cache is Columbus-specific, so it only helps
        // when we actually fell back to Columbus.
        if (onDefault) {
          const defaultCache = await getDefaultLocationCache();
          if (defaultCache.isFromCache && defaultCache.bars.length > 0) {
            debug(
              `🎯 Loaded ${defaultCache.bars.length} bars from default cache`
            );
            setBars(defaultCache.bars);
            hasInitiallyFetched.current = true;
            return;
          }
        }

        // Cache-first for this centre (getCachedBars inside fetchBarsInArea);
        // only a genuine miss reaches the billed Places proxy.
        debug("📡 Fetching bars for resolved centre...");
        await fetchBarsInArea(initialCenter.center, false, true);
      } catch (error) {
        console.error("Error loading initial bars:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadInitialBars();
    // Runs once per resolved centre AND once a uid exists; hasInitiallyFetched
    // guards re-entry so the arrival of `user` can't trigger a second fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCenter.resolved, user]);

  // The order the user clicked the bars in — Set keeps insertion order, and
  // /route treats this as "my order". Mirrors Sidebar's construction; using
  // bars.filter here would silently store list order instead.
  const selectedBars = useMemo(() => {
    const barById = new Map(bars.map((bar) => [bar.id, bar]));
    return Array.from(selectedBarIds)
      .map((id) => barById.get(id))
      .filter((bar): bar is AppBat => Boolean(bar));
  }, [bars, selectedBarIds]);

  // Keep the guest's crawl on the device as they build it (spec §6.1). Also
  // fixes refresh-loses-your-crawl for signed-in users, which was a live bug.
  useEffect(() => {
    if (selectedBars.length < 2) return;
    writeGuestCrawl({ selectedBars, mapCenter, searchRadius });
  }, [selectedBars, mapCenter, searchRadius]);

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

  // Handler for draw complete events — filters bars to the drawn polygon
  const handleDrawComplete = (feature: Feature | null) => {
    if (feature && feature.geometry.type === "Polygon") {
      setDrawnPolygon(feature);
      toast.success("Showing bars inside your drawn area");
    } else {
      setDrawnPolygon((prev) => {
        if (prev) toast.success("Area filter cleared");
        return null;
      });
    }
  };

  return (
    <PageTransition>
    <div className="planner-page">
      <Sidebar
        user={user}
        onSignOut={signout}
        bars={polygonFilteredBars}
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
        <AnimatePresence>
          {activeSession?.id && (
            <motion.button
              className="resume-crawl-banner"
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              onClick={() =>
                navigate("/live", { state: { sessionId: activeSession.id } })
              }
            >
              <span className="resume-crawl-pulse" />
              <span className="resume-crawl-text">
                <strong>Crawl in progress</strong>
                <span>
                  {activeSession.crawlName
                    ? `${activeSession.crawlName} — tap to resume`
                    : "Tap to resume your night"}
                </span>
              </span>
              <FiPlay className="resume-crawl-icon" />
            </motion.button>
          )}

          {/* No live session, but a crawl was built earlier and is sitting in
              storage. /route restores it from there, so this is just the way
              back to it. Only shown when nothing is selected here, so it never
              competes with a crawl being built right now. */}
          {!activeSession?.id &&
            savedGuestCrawl &&
            savedGuestCrawl.stops >= 2 &&
            selectedBarIds.size === 0 && (
              <motion.button
                className="resume-crawl-banner"
                initial={{ opacity: 0, y: -16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                onClick={() => navigate("/route")}
              >
                <span className="resume-crawl-pulse" />
                <span className="resume-crawl-text">
                  <strong>Your crawl is still here</strong>
                  <span>
                    {savedGuestCrawl.name
                      ? `${savedGuestCrawl.name} — tap to pick it back up`
                      : `${savedGuestCrawl.stops} stops — tap to pick it back up`}
                  </span>
                </span>
                <FiPlay className="resume-crawl-icon" />
              </motion.button>
            )}
        </AnimatePresence>

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
          totalBars={polygonFilteredBars.length}
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

      {/* Held back until the map has actually painted bars. With the
          permission modal no longer auto-opening, an ungated tutorial would
          simply become the new thing blocking a new user's first view. */}
      <LocationTutorial
        isVisible={
          showTutorial && !showLocationPermission && !isLoading && bars.length > 0
        }
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

      <GuestSignupPrompt
        open={guestPrompt !== null}
        reason={guestPrompt ?? "search"}
        onClose={() => setGuestPrompt(null)}
      />
    </div>
    </PageTransition>
  );
};

export default Home;
