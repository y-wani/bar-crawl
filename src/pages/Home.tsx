// src/pages/Home.tsx

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Sidebar } from "../components/Sidebar";
import { MapContainer, type MapBounds } from "../components/MapContainer";
import { useAuth } from "../context/useAuth";
import type { Bar } from "../components/BarListItem";
import { MapSearchControl } from "../components/MapSearchControl";
import { debounce } from "lodash";
import type { Feature } from "geojson";

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
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

const Home: React.FC = () => {
  const { user, signout } = useAuth();
  const [bars, setBars] = useState<AppBat[]>([]);
  const [selectedBarIds, setSelectedBarIds] = useState<Set<string>>(new Set());
  const [hoveredBarId, setHoveredBarId] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([
    -83.0007, 39.9612,
  ]);
  const [searchRadius, setSearchRadius] = useState<number>(1);
  const [searchedLocation, setSearchedLocation] = useState("Columbus, Ohio");
  const [isLoading, setIsLoading] = useState(false);
  const [showOnlyInRadius, setShowOnlyInRadius] = useState(false);

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

  // --- NEW: Function to fetch bars within specific map bounds ---
  const fetchBarsInArea = async (bounds: MapBounds | [number, number]) => {
    setIsLoading(true);
    const categories = ["bar", "pub", "nightclub"];
    const allBars: AppBat[] = [];
    const fetchedBarIds = new Set<string>();

    const searchParams = new URLSearchParams({
      access_token: MAPBOX_ACCESS_TOKEN,
      limit: "25",
    });

    // Use bbox for bounds search, proximity for point search
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
            (feature: MapboxFeature) => ({
              id: feature.properties.mapbox_id,
              name: feature.properties.name || "Unknown Bar",
              rating: parseFloat((Math.random() * 1.5 + 3.5).toFixed(1)),
              distance: 0,
              location: feature.geometry,
            })
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

    setBars(allBars);
    setIsLoading(false);
  };

  // --- UPDATED: Geocode search to use the new fetch function ---
  const handleLocationSearch = async (location: string) => {
    setIsLoading(true);
    setSearchedLocation(location);
    setSelectedBarIds(new Set());
    setHoveredBarId(null);
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
      // fetch bars around point
      fetchBarsInArea([lng, lat]);
    } catch (error) {
      console.error("Geocoding failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Debounced handler for when map view changes (optional)
  const handleMapViewChange = useCallback(
    debounce((bounds: MapBounds) => {
      fetchBarsInArea(bounds);
      setSearchedLocation("Current map area");
    }, 800),
    []
  );

  // Initial load
  useEffect(() => {
    fetchBarsInArea(mapCenter);
  }, []);

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
          isLoading={isLoading}
          initialLocation={searchedLocation}
          initialRadius={searchRadius}
          showOnlyInRadius={showOnlyInRadius}
          barsInRadius={barsInRadius}
          totalBars={bars.length}
        />

        <MapContainer
          center={mapCenter}
          radius={searchRadius} // <-- now dynamic
          bars={bars}
          selectedBarIds={selectedBarIds}
          hoveredBarId={hoveredBarId}
          onToggleBar={handleToggleBar}
          onHoverBar={setHoveredBarId}
          onMapViewChange={handleMapViewChange}
          onDrawComplete={handleDrawComplete}
        />
      </div>
    </div>
  );
};

export default Home;
