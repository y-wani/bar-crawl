// src/pages/Route.tsx

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { MapContainer } from "../components/MapContainer";
import { useAuth } from "../context/useAuth";
import type { AppBat } from "./Home";
import {
  FaBars,
  FaTimes,
  FaGripVertical,
  FaMapMarkerAlt,
  FaRoute,
  FaArrowLeft,
  FaLocationArrow,
  FaMagic,
} from "react-icons/fa";
import "../styles/Route.css";

interface RoutePageState {
  selectedBars: AppBat[];
  mapCenter: [number, number];
  searchRadius: number;
}

interface DraggableBarItem extends AppBat {
  order: number;
}

const MAPBOX_ACCESS_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

// Helper function to calculate distance between two coordinates
const calculateDistance = (coord1: [number, number], coord2: [number, number]): number => {
  const R = 3959; // Earth's radius in miles
  const dLat = (coord2[1] - coord1[1]) * Math.PI / 180;
  const dLon = (coord2[0] - coord1[0]) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(coord1[1] * Math.PI / 180) * Math.cos(coord2[1] * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Optimize bar order using nearest neighbor algorithm
const optimizeBarOrder = (bars: AppBat[], startLocation: [number, number]): AppBat[] => {
  if (bars.length <= 2) return bars;

  const unvisited = [...bars];
  const route: AppBat[] = [];
  let currentLocation = startLocation;

  while (unvisited.length > 0) {
    let nearestIndex = 0;
    let shortestDistance = Infinity;

    unvisited.forEach((bar, index) => {
      const distance = calculateDistance(currentLocation, bar.location.coordinates as [number, number]);
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
const reverseGeocode = async (coordinates: [number, number]): Promise<string> => {
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
const geocodeAddress = async (address: string): Promise<[number, number] | null> => {
  try {
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${MAPBOX_ACCESS_TOKEN}&limit=1`
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

const Route: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signout } = useAuth();

  const routeState = location.state as RoutePageState | null;

  useEffect(() => {
    if (!routeState || !routeState.selectedBars || routeState.selectedBars.length < 2) {
      navigate("/home");
    }
  }, [routeState, navigate]);

  const [isDrawerOpen, setIsDrawerOpen] = useState(true);
  const [draggableBars, setDraggableBars] = useState<DraggableBarItem[]>([]);
  const [startLocation, setStartLocation] = useState("");
  const [endLocation, setEndLocation] = useState("");
  const [startCoordinates, setStartCoordinates] = useState<[number, number] | null>(null);
  const [endCoordinates, setEndCoordinates] = useState<[number, number] | null>(null);
  const [userCoordinates, setUserCoordinates] = useState<[number, number] | null>(null);
  const [mapCenter] = useState<[number, number]>(routeState?.mapCenter || [-83.0007, 39.9612]);
  
  // Consolidated loading state
  const [isLoading, setIsLoading] = useState({
    location: true,
    optimizing: true,
    generating: true,
  });

  const [draggedItem, setDraggedItem] = useState<number | null>(null);
  const [routeData, setRouteData] = useState<GeoJSON.Feature<GeoJSON.LineString> | null>(null);
  
  const isInitialLoad = useRef(true);

  const getCurrentLocation = useCallback(async (): Promise<[number, number]> => {
    setIsLoading(prev => ({ ...prev, location: true }));
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000,
        });
      });
      const coords: [number, number] = [position.coords.longitude, position.coords.latitude];
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
      setIsLoading(prev => ({ ...prev, location: false }));
    }
  }, [mapCenter]);

  const handleGenerateRoute = useCallback(async (barsToUse: DraggableBarItem[], start: [number, number] | null, end: [number, number] | null) => {
    if (barsToUse.length < 2) return;
    setIsLoading(prev => ({ ...prev, generating: true }));

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
        setRouteData(data.routes[0].geometry as GeoJSON.Feature<GeoJSON.LineString>);
      }
    } catch (error) {
      console.error("Error fetching route:", error);
    } finally {
      setIsLoading(prev => ({ ...prev, generating: false }));
    }
  }, []);

  // Throttled route generation to prevent excessive API calls
  const throttledRouteGeneration = useRef<NodeJS.Timeout | null>(null);
  
  const throttledGenerateRoute = useCallback((barsToUse: DraggableBarItem[], start: [number, number] | null, end: [number, number] | null) => {
    if (throttledRouteGeneration.current) {
      clearTimeout(throttledRouteGeneration.current);
    }
    
    throttledRouteGeneration.current = setTimeout(() => {
      handleGenerateRoute(barsToUse, start, end);
    }, 300); // 300ms throttle to batch rapid changes
  }, [handleGenerateRoute]);

  useEffect(() => {
    if (routeState?.selectedBars && routeState.selectedBars.length >= 2 && isInitialLoad.current) {
        isInitialLoad.current = false; // Ensure this runs only once
        const initialize = async () => {
            setIsLoading({ location: true, optimizing: true, generating: true });
        const currentCoords = await getCurrentLocation();
        const optimizedBars = optimizeBarOrder(routeState.selectedBars, currentCoords);
            const initialBars = optimizedBars.map((bar, index) => ({ ...bar, order: index }));
        setDraggableBars(initialBars);
            setIsLoading(prev => ({ ...prev, optimizing: false }));
            await throttledGenerateRoute(initialBars, currentCoords, currentCoords);
        };
        initialize();
    }
  }, [routeState, getCurrentLocation, handleGenerateRoute, throttledGenerateRoute]);
  
  const handleOptimizeRoute = useCallback(async () => {
    if (!userCoordinates || draggableBars.length < 2) return;
    setIsLoading(prev => ({ ...prev, optimizing: true, generating: true }));
    
    // Use a short delay to allow the UI to update and show the loading state
    await new Promise(res => setTimeout(res, 50));
    
    const optimized = optimizeBarOrder(draggableBars, userCoordinates);
    const reorderedBars = optimized.map((bar, index) => ({ ...bar, order: index }));
    setDraggableBars(reorderedBars);
    
    setIsLoading(prev => ({ ...prev, optimizing: false }));
    
    // Generate route with the newly optimized bars
    await throttledGenerateRoute(reorderedBars, startCoordinates, endCoordinates);
  }, [userCoordinates, draggableBars, startCoordinates, endCoordinates, handleGenerateRoute, throttledGenerateRoute]);

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
    const reorderedBars = newBars.map((bar, index) => ({ ...bar, order: index }));
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

  // Memoize expensive computations to prevent unnecessary re-renders (must be before early return)
  const selectedBarIds = useMemo(() => 
    new Set(draggableBars.map((bar) => bar.id)), 
    [draggableBars]
  );

  // Memoize the bars array to prevent MapContainer re-renders
  const memoizedBars = useMemo(() => draggableBars, [draggableBars]);

  // Memoize route data to prevent unnecessary map updates
  const memoizedRouteData = useMemo(() => routeData, [routeData]);

  // Update route when bar order changes
  useEffect(() => {
    if (draggableBars.length >= 2 && startCoordinates && endCoordinates && !isInitialLoad.current) {
      // Small delay to batch rapid reorder changes
      const timeoutId = setTimeout(() => {
        if (!isLoading.optimizing) {
          throttledGenerateRoute(draggableBars, startCoordinates, endCoordinates);
        }
      }, 100);
      
      return () => clearTimeout(timeoutId);
    }
  }, [draggableBars, startCoordinates, endCoordinates, throttledGenerateRoute, isLoading.optimizing]);

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
          <button className="drawer-toggle" onClick={() => setIsDrawerOpen(!isDrawerOpen)}>
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
            hoveredBarId={null}
            onToggleBar={() => {}}
            onHoverBar={() => {}}
            onMapViewChange={() => {}}
            onDrawComplete={() => {}}
            route={memoizedRouteData}
            startCoordinates={startCoordinates}
          />
        </div>

        <div className={`route-drawer ${isDrawerOpen ? "open" : "closed"}`}>
          <div className="drawer-header">
            <div className="user-info">
              <span>Hi, {user?.displayName || user?.email}!</span>
              <button onClick={signout} className="btn-signout-small">Sign Out</button>
            </div>
            <div className="smart-controls">
              <button
                className={`btn-optimize-route ${isLoading.optimizing ? "loading" : ""}`}
                onClick={handleOptimizeRoute}
                disabled={isBusy}
              >
                {isLoading.optimizing ? (
                  <><div className="spinner"></div> Optimizing...</>
                ) : (
                  <><FaMagic /> Optimize Route</>
                )}
              </button>
              <button
                className={`btn-current-location ${isLoading.location ? "loading" : ""}`}
                onClick={getCurrentLocation}
                disabled={isLoading.location}
              >
                {isLoading.location ? (
                  <><div className="spinner"></div> Finding...</>
                ) : (
                  <><FaLocationArrow /> Use My Location</>
                )}
              </button>
            </div>
            <div className="location-section">
              <div className="location-label">
                <FaMapMarkerAlt className="location-icon start" />
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
                    className={`draggable-bar-item ${draggedItem === index ? "dragging" : ""} ${isLoading.optimizing ? "optimizing" : ""}`}
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
                <FaMapMarkerAlt className="location-icon end" />
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
              <button
                className={`btn-generate-final-route ${isLoading.generating ? "loading" : ""}`}
                onClick={handleFinalGenerateClick}
                disabled={isBusy}
              >
                {isLoading.generating ? (
                  <><div className="spinner"></div> Generating...</>
                ) : (
                  <><FaRoute /> Generate Final Route</>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Route;