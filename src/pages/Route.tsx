// src/pages/Route.tsx

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { MapContainer, type MapBounds } from "../components/MapContainer";
import { useAuth } from "../context/useAuth";
import type { AppBat } from "./Home";
import { FaBars, FaTimes, FaGripVertical, FaArrowLeft } from "react-icons/fa";
import {
  FiNavigation,
  FiZap,
  FiCompass,
  FiPlay,
  FiFlag,
  FiSave,
} from "react-icons/fi";
import "../styles/Route.css";
import { SaveCrawlModal } from "../components/SaveCrawlModal";

// Mapbox API constants and types
const MAPBOX_ACCESS_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

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

interface RoutePageState {
  selectedBars: AppBat[];
  mapCenter: [number, number];
  searchRadius: number;
}

interface DraggableBarItem extends AppBat {
  order: number;
}

// Helper function to calculate distance between two coordinates
const calculateDistance = (
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

// Optimize bar order using nearest neighbor algorithm
const optimizeBarOrder = (
  bars: AppBat[],
  startLocation: [number, number]
): AppBat[] => {
  if (bars.length <= 2) return bars;

  const unvisited = [...bars];
  const route: AppBat[] = [];
  let currentLocation = startLocation;

  while (unvisited.length > 0) {
    let nearestIndex = 0;
    let shortestDistance = Infinity;

    unvisited.forEach((bar, index) => {
      const distance = calculateDistance(
        currentLocation,
        bar.location.coordinates as [number, number]
      );
      if (distance < shortestDistance) {
        shortestDistance = distance;
        nearestIndex = index;
      }
    });

    const nearestBar = unvisited.splice(nearestIndex, 1)[0];
    route.push(nearestBar);
    currentLocation = nearestBar.location.coordinates as [number, number];
  }

  return route;
};

// Geocode coordinates to address
const reverseGeocode = async (
  coordinates: [number, number]
): Promise<string> => {
  try {
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${coordinates[0]},${coordinates[1]}.json?access_token=${MAPBOX_ACCESS_TOKEN}&limit=1`
    );
    const data = await response.json();
    if (data.features && data.features.length > 0) {
      return data.features[0].place_name;
    }
    return `${coordinates[1].toFixed(4)}, ${coordinates[0].toFixed(4)}`;
  } catch (error) {
    console.error("Reverse geocoding failed:", error);
    return `${coordinates[1].toFixed(4)}, ${coordinates[0].toFixed(4)}`;
  }
};

// Geocode address to coordinates
const geocodeAddress = async (
  address: string
): Promise<[number, number] | null> => {
  try {
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
        address
      )}.json?access_token=${MAPBOX_ACCESS_TOKEN}&limit=1`
    );
    const data = await response.json();
    if (data.features && data.features.length > 0) {
      return data.features[0].center;
    }
    return null;
  } catch (error) {
    console.error("Geocoding failed:", error);
    return null;
  }
};

// Function to fetch bars within specific map bounds
const fetchBarsInArea = async (
  bounds: MapBounds | [number, number]
): Promise<AppBat[]> => {
  console.log("Fetching bars for bounds:", bounds);
  const categories = ["bar", "pub", "nightclub"];
  const allBars: AppBat[] = [];
  const fetchedBarIds = new Set<string>();

  // Determine center coordinates for distance calculation
  let centerCoords: [number, number];
  if (Array.isArray(bounds) && bounds.length === 4) {
    centerCoords = [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
  } else if (Array.isArray(bounds) && bounds.length === 2) {
    centerCoords = bounds;
  } else {
    centerCoords = [-83.0007, 39.9612]; // Default Columbus coordinates
  }

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
              [centerLng, centerLat],
              [barLng, barLat]
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

  console.log(`🍺 Fetched ${allBars.length} bars from API for route area`);
  return allBars;
};

const Route: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signout } = useAuth();

  const routeState = location.state as RoutePageState | null;

  useEffect(() => {
    if (
      !routeState ||
      !routeState.selectedBars ||
      routeState.selectedBars.length < 2
    ) {
      navigate("/home");
    }
  }, [routeState, navigate]);

  const [isDrawerOpen, setIsDrawerOpen] = useState(true);
  const [draggableBars, setDraggableBars] = useState<DraggableBarItem[]>([]);
  const [startLocation, setStartLocation] = useState("");
  const [endLocation, setEndLocation] = useState("");
  const [startCoordinates, setStartCoordinates] = useState<
    [number, number] | null
  >(null);
  const [endCoordinates, setEndCoordinates] = useState<[number, number] | null>(
    null
  );
  const [userCoordinates, setUserCoordinates] = useState<
    [number, number] | null
  >(null);
  const [mapCenter] = useState<[number, number]>(
    routeState?.mapCenter || [-83.0007, 39.9612]
  );

  // Consolidated loading state
  const [isLoading, setIsLoading] = useState({
    location: true,
    optimizing: true,
    generating: true,
  });

  const [draggedItem, setDraggedItem] = useState<number | null>(null);
  const [routeData, setRouteData] =
    useState<GeoJSON.Feature<GeoJSON.LineString> | null>(null);
  const [hoveredBarId, setHoveredBarId] = useState<string | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [allBarsInArea, setAllBarsInArea] = useState<AppBat[]>([]);

  const isInitialLoad = useRef(true);

  const getCurrentLocation = useCallback(async (): Promise<
    [number, number]
  > => {
    setIsLoading((prev) => ({ ...prev, location: true }));
    try {
      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 300000,
          });
        }
      );
      const coords: [number, number] = [
        position.coords.longitude,
        position.coords.latitude,
      ];
      setUserCoordinates(coords);
      setStartCoordinates(coords);
      setEndCoordinates(coords);
      const address = await reverseGeocode(coords);
      setStartLocation(address);
      setEndLocation(address);
      return coords;
    } catch (error) {
      console.error("Error getting location:", error);
      const fallbackCoords: [number, number] = [mapCenter[0], mapCenter[1]];
      setUserCoordinates(fallbackCoords);
      setStartCoordinates(fallbackCoords);
      setEndCoordinates(fallbackCoords);
      const address = await reverseGeocode(fallbackCoords);
      setStartLocation(address);
      setEndLocation(address);
      return fallbackCoords;
    } finally {
      setIsLoading((prev) => ({ ...prev, location: false }));
    }
  }, [mapCenter]);

  const handleGenerateRoute = useCallback(
    async (
      barsToUse: DraggableBarItem[],
      start: [number, number] | null,
      end: [number, number] | null
    ) => {
      if (barsToUse.length < 2) return;
      setIsLoading((prev) => ({ ...prev, generating: true }));

      try {
        const coordinatesArray: string[] = [];
        if (start) {
          coordinatesArray.push(start.join(","));
        }
        barsToUse.forEach((bar) => {
          coordinatesArray.push(bar.location.coordinates.join(","));
        });
        if (end && (start?.[0] !== end?.[0] || start?.[1] !== end?.[1])) {
          coordinatesArray.push(end.join(","));
        }

        const coordinates = coordinatesArray.join(";");
        const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${coordinates}?geometries=geojson&access_token=${MAPBOX_ACCESS_TOKEN}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.routes && data.routes.length > 0) {
          setRouteData(
            data.routes[0].geometry as GeoJSON.Feature<GeoJSON.LineString>
          );
        }
      } catch (error) {
        console.error("Error fetching route:", error);
      } finally {
        setIsLoading((prev) => ({ ...prev, generating: false }));
      }
    },
    []
  );

  // Throttled route generation to prevent excessive API calls
  const throttledRouteGeneration = useRef<NodeJS.Timeout | null>(null);

  const throttledGenerateRoute = useCallback(
    (
      barsToUse: DraggableBarItem[],
      start: [number, number] | null,
      end: [number, number] | null
    ) => {
      if (throttledRouteGeneration.current) {
        clearTimeout(throttledRouteGeneration.current);
      }

      throttledRouteGeneration.current = setTimeout(() => {
        handleGenerateRoute(barsToUse, start, end);
      }, 300); // 300ms throttle to batch rapid changes
    },
    [handleGenerateRoute]
  );

  useEffect(() => {
    if (
      routeState?.selectedBars &&
      routeState.selectedBars.length >= 2 &&
      isInitialLoad.current
    ) {
      isInitialLoad.current = false; // Ensure this runs only once
      const initialize = async () => {
        setIsLoading({ location: true, optimizing: true, generating: true });
        const currentCoords = await getCurrentLocation();
        const optimizedBars = optimizeBarOrder(
          routeState.selectedBars,
          currentCoords
        );
        const initialBars = optimizedBars.map((bar, index) => ({
          ...bar,
          order: index,
        }));
        setDraggableBars(initialBars);
        setIsLoading((prev) => ({ ...prev, optimizing: false }));
        await throttledGenerateRoute(initialBars, currentCoords, currentCoords);
      };
      initialize();
    }
  }, [
    routeState,
    getCurrentLocation,
    handleGenerateRoute,
    throttledGenerateRoute,
  ]);

  // Fetch bars in the area when the component mounts
  useEffect(() => {
    const fetchAreaBars = async () => {
      if (mapCenter) {
        try {
          const barsInArea = await fetchBarsInArea(mapCenter);
          setAllBarsInArea(barsInArea);
        } catch (error) {
          console.error("Error fetching bars in area:", error);
        }
      }
    };

    fetchAreaBars();
  }, [mapCenter]);

  const handleOptimizeRoute = useCallback(async () => {
    if (!userCoordinates || draggableBars.length < 2) return;
    setIsLoading((prev) => ({ ...prev, optimizing: true, generating: true }));

    // Use a short delay to allow the UI to update and show the loading state
    await new Promise((res) => setTimeout(res, 50));

    const optimized = optimizeBarOrder(draggableBars, userCoordinates);
    const reorderedBars = optimized.map((bar, index) => ({
      ...bar,
      order: index,
    }));
    setDraggableBars(reorderedBars);

    setIsLoading((prev) => ({ ...prev, optimizing: false }));

    // Generate route with the newly optimized bars
    await throttledGenerateRoute(
      reorderedBars,
      startCoordinates,
      endCoordinates
    );
  }, [
    userCoordinates,
    draggableBars,
    startCoordinates,
    endCoordinates,
    handleGenerateRoute,
    throttledGenerateRoute,
  ]);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedItem(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedItem === null || draggedItem === dropIndex) {
      setDraggedItem(null);
      return;
    }
    const newBars = [...draggableBars];
    const [draggedBar] = newBars.splice(draggedItem, 1);
    newBars.splice(dropIndex, 0, draggedBar);
    const reorderedBars = newBars.map((bar, index) => ({
      ...bar,
      order: index,
    }));
    setDraggableBars(reorderedBars);
    setDraggedItem(null);

    // Trigger route update after reordering
    if (reorderedBars.length >= 2 && startCoordinates && endCoordinates) {
      throttledGenerateRoute(reorderedBars, startCoordinates, endCoordinates);
    }
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
  };

  const handleLocationSearch = async (query: string, isStart: boolean) => {
    if (!query.trim()) return;
    const coordinates = await geocodeAddress(query);
    if (coordinates) {
      if (isStart) setStartCoordinates(coordinates);
      else setEndCoordinates(coordinates);
    }
  };

  const handleFinalGenerateClick = () => {
    throttledGenerateRoute(draggableBars, startCoordinates, endCoordinates);
  };

  const handleSaveCrawl = () => {
    setShowSaveModal(true);
  };

  const handleSaveSuccess = (crawlId: string) => {
    setSaveSuccess(crawlId);
    // Auto-hide success message after 5 seconds
    setTimeout(() => setSaveSuccess(null), 5000);
  };

  const handleCloseSaveModal = () => {
    setShowSaveModal(false);
  };

  // Handle toggling bars on the map
  const handleToggleBar = useCallback(
    (barId: string) => {
      const isCurrentlySelected = draggableBars.some((bar) => bar.id === barId);

      if (isCurrentlySelected) {
        // Remove from selected bars
        const newBars = draggableBars.filter((bar) => bar.id !== barId);
        const reorderedBars = newBars.map((bar, index) => ({
          ...bar,
          order: index,
        }));
        setDraggableBars(reorderedBars);
      } else {
        // Add to selected bars
        const barToAdd = allBarsInArea.find((bar) => bar.id === barId);
        if (barToAdd) {
          const newBar: DraggableBarItem = {
            ...barToAdd,
            order: draggableBars.length,
          };
          setDraggableBars((prev) => [...prev, newBar]);
        }
      }
    },
    [draggableBars, allBarsInArea]
  );

  // Memoize expensive computations to prevent unnecessary re-renders (must be before early return)
  const selectedBarIds = useMemo(
    () => new Set(draggableBars.map((bar) => bar.id)),
    [draggableBars]
  );

  // Memoize the bars array to include all bars in area plus selected bars
  const memoizedBars = useMemo((): AppBat[] => {
    // Combine all bars in area with selected bars, removing duplicates
    const selectedBarIds = new Set(draggableBars.map((bar) => bar.id));
    const allBars: AppBat[] = [...draggableBars]; // draggableBars extends AppBat so this is safe

    // Add non-selected bars from the area
    allBarsInArea.forEach((bar) => {
      if (!selectedBarIds.has(bar.id)) {
        allBars.push(bar);
      }
    });

    return allBars;
  }, [draggableBars, allBarsInArea]);

  // Memoize route data to prevent unnecessary map updates
  const memoizedRouteData = useMemo(() => routeData, [routeData]);

  // Update route when bar order changes
  useEffect(() => {
    if (
      draggableBars.length >= 2 &&
      startCoordinates &&
      endCoordinates &&
      !isInitialLoad.current
    ) {
      // Small delay to batch rapid reorder changes
      const timeoutId = setTimeout(() => {
        if (!isLoading.optimizing) {
          throttledGenerateRoute(
            draggableBars,
            startCoordinates,
            endCoordinates
          );
        }
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  }, [
    draggableBars,
    startCoordinates,
    endCoordinates,
    throttledGenerateRoute,
    isLoading.optimizing,
  ]);

  if (!routeState) return null;

  const isBusy = isLoading.generating || isLoading.optimizing;

  return (
    <div className="route-page">
      <div className="route-header">
        <button className="back-button" onClick={() => navigate("/home")}>
          <FaArrowLeft /> Back to Planning
        </button>
        <h1 className="route-title">Create Your Route</h1>
        <div className="route-header-actions">
          <span className="selected-count">{draggableBars.length} stops</span>
          <button
            className="drawer-toggle"
            onClick={() => setIsDrawerOpen(!isDrawerOpen)}
          >
            {isDrawerOpen ? <FaTimes /> : <FaBars />}
          </button>
        </div>
      </div>

      <div className="route-content">
        <div className="route-map-container">
          <MapContainer
            center={mapCenter}
            radius={routeState.searchRadius}
            bars={memoizedBars}
            selectedBarIds={selectedBarIds}
            hoveredBarId={hoveredBarId}
            onToggleBar={handleToggleBar}
            onHoverBar={setHoveredBarId}
            onMapViewChange={() => {}}
            onDrawComplete={() => {}}
            route={memoizedRouteData}
            startCoordinates={startCoordinates}
            endCoordinates={endCoordinates}
          />
        </div>

        <div className={`route-drawer ${isDrawerOpen ? "open" : "closed"}`}>
          <div className="drawer-header">
            <div className="smart-controls">
              <button
                className={`btn-optimize-route ${
                  isLoading.optimizing ? "loading" : ""
                }`}
                onClick={handleOptimizeRoute}
                disabled={isBusy}
              >
                {isLoading.optimizing ? (
                  <>
                    <div className="spinner"></div> Optimizing...
                  </>
                ) : (
                  <>
                    <FiZap size={16} /> Optimize Route
                  </>
                )}
              </button>
              <button
                className={`btn-current-location ${
                  isLoading.location ? "loading" : ""
                }`}
                onClick={getCurrentLocation}
                disabled={isLoading.location}
              >
                {isLoading.location ? (
                  <>
                    <div className="spinner"></div> Finding...
                  </>
                ) : (
                  <>
                    <FiNavigation size={16} /> Use My Location
                  </>
                )}
              </button>
            </div>
            <div className="location-section">
              <div className="location-label">
                <FiPlay size={18} className="location-icon start" />
                <span>Start Location</span>
              </div>
              <input
                type="text"
                placeholder="Enter starting point..."
                value={startLocation}
                onChange={(e) => setStartLocation(e.target.value)}
                onBlur={(e) => handleLocationSearch(e.target.value, true)}
                className="location-input"
              />
            </div>
          </div>

          <div className="drawer-content">
            <div className="bars-section">
              <h3 className="section-title">Your Bar Crawl Route</h3>
              <p className="section-subtitle">
                {isBusy ? "Updating route..." : "Drag to reorder stops"}
              </p>
              <div className="draggable-bars-list">
                {draggableBars.map((bar, index) => (
                  <div
                    key={bar.id}
                    className={`draggable-bar-item ${
                      draggedItem === index ? "dragging" : ""
                    } ${isLoading.optimizing ? "optimizing" : ""}`}
                    draggable={!isBusy}
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, index)}
                    onDragEnd={handleDragEnd}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <div className={`drag-handle ${isBusy ? "disabled" : ""}`}>
                      <FaGripVertical />
                    </div>
                    <div className="bar-order-number">{index + 1}</div>
                    <div className="bar-details">
                      <h4 className="bar-name">{bar.name}</h4>
                      <div className="bar-meta">
                        <span>⭐ {bar.rating.toFixed(1)}</span>
                        <span>📍 {bar.distance.toFixed(2)} mi</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="drawer-footer">
            <div className="location-section">
              <div className="location-label">
                <FiFlag size={18} className="location-icon end" />
                <span>End Location</span>
              </div>
              <input
                type="text"
                placeholder="Enter ending point..."
                value={endLocation}
                onChange={(e) => setEndLocation(e.target.value)}
                onBlur={(e) => handleLocationSearch(e.target.value, false)}
                className="location-input"
              />
            </div>
            <div className="route-actions">
              {saveSuccess && (
                <div className="save-success-message">
                  ✅ Crawl saved successfully!
                  <button
                    className="save-success-close"
                    onClick={() => setSaveSuccess(null)}
                  >
                    ×
                  </button>
                </div>
              )}

              <div className="route-buttons">
                <button
                  className="btn-save-crawl"
                  onClick={handleSaveCrawl}
                  disabled={draggableBars.length < 2}
                  title={
                    draggableBars.length < 2
                      ? "Need at least 2 bars to save"
                      : "Save this crawl"
                  }
                >
                  <FiSave size={16} />
                  Save Crawl
                </button>

                <button
                  className={`btn-generate-final-route ${
                    isLoading.generating ? "loading" : ""
                  }`}
                  onClick={handleFinalGenerateClick}
                  disabled={isBusy}
                >
                  {isLoading.generating ? (
                    <>
                      <div className="spinner"></div> Generating...
                    </>
                  ) : (
                    <>
                      <FiCompass size={18} /> Generate Route
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <SaveCrawlModal
        isOpen={showSaveModal}
        onClose={handleCloseSaveModal}
        bars={draggableBars}
        mapCenter={mapCenter}
        searchRadius={routeState.searchRadius}
        startCoordinates={startCoordinates}
        endCoordinates={endCoordinates}
        onSaveSuccess={handleSaveSuccess}
      />
    </div>
  );
};

export default Route;
