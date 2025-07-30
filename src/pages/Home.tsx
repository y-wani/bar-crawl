// src/pages/Home.tsx

import React, { useState, useMemo, useEffect } from "react";
import { Sidebar } from "../components/Sidebar";
import { MapContainer } from "../components/MapContainer";
import { useAuth } from "../context/useAuth";
import type { Bar } from "../components/BarListItem";
import { MapSearchControl } from "../components/MapSearchControl";

// The Bar type needs to be consistently used
export interface AppBat extends Bar {
  location: {
    type: "Point";
    coordinates: [number, number]; // [lng, lat]
  };
}

const MAPBOX_ACCESS_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

const Home: React.FC = () => {
  const { user, signout } = useAuth();
  const [bars, setBars] = useState<AppBat[]>([]);
  const [selectedBarIds, setSelectedBarIds] = useState<Set<string>>(new Set());
  const [hoveredBarId, setHoveredBarId] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([-83.0007, 39.9612]);
  const [searchRadius, setSearchRadius] = useState<number>(1);
  const [searchedLocation, setSearchedLocation] = useState("Columbus, Ohio");
  const [isLoading, setIsLoading] = useState(false);

  const handleLocationSearch = async (location: string, radius: number) => {
    setIsLoading(true);
    setSearchedLocation(location);
    setSearchRadius(radius);
    setSelectedBarIds(new Set());
    setHoveredBarId(null);

    try {
      // First, get the coordinates for the given location name
      console.log("Mapbox token:", MAPBOX_ACCESS_TOKEN);
      console.log(`Starting geocode for "${location}" with radius ${radius}`);  // Identify the query :contentReference[oaicite:1]{index=1}


      const geocodeUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
        location
      )}.json?access_token=${MAPBOX_ACCESS_TOKEN}`;

      const geoResponse = await fetch(geocodeUrl);

      console.log('Geocode HTTP status:', geoResponse.status);  
      const geoData = await geoResponse.json();

      console.log('Geocode response:', geoData);

      if (!geoData.features.length) {
        console.warn('No geocode results, aborting bar search');            // Warn if empty :contentReference[oaicite:4]{index=4}
        setBars([]);
        return;
      }

      const [lng, lat] = geoData.features[0].center;
      setMapCenter([lng, lat]);

      // Now search for bars using the Mapbox Search Box API
      const barsUrl = new URL('https://api.mapbox.com/search/searchbox/v1/category');
      barsUrl.searchParams.set('access_token', MAPBOX_ACCESS_TOKEN);
      barsUrl.searchParams.set('types', 'poi');
      barsUrl.searchParams.set('categories', 'bar');
      barsUrl.searchParams.set('proximity', `${lng},${lat}`);
      barsUrl.searchParams.set('limit', '25');

      const barsResponse = await fetch(barsUrl.toString());

      console.log('Bars HTTP status:', barsResponse.status);
      if (!barsResponse.ok) {
        console.error('Bar fetch failed:', barsResponse.status, await barsResponse.text());
        setBars([]);
        return;
      }
      
      const barsData = await barsResponse.json();

      console.log('Bars response:', barsData);

      if (barsData.features) {
        console.log('Found bars:', barsData.features.length);

        const newBars: AppBat[] = barsData.features.map((feature: {
          id: string;
          properties: { name: string };
          geometry: { type: "Point"; coordinates: [number, number] }
        }) => ({
          id: feature.id,
          name: feature.properties.name || 'Unknown Bar',
          rating: parseFloat((Math.random() * 1.5 + 3.5).toFixed(1)), // Placeholder rating
          distance: 0, // This could be calculated if needed
          location: feature.geometry,
        }));
        setBars(newBars);
      } else {
        setBars([]);
      }
    } catch (error) {
      console.error("Failed to search for location or bars:", error);
      alert(
        "An error occurred while searching. Please check the console for details."
      );
      setBars([]);
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Watch your `bars` state changes
useEffect(() => {
  console.log('Updated bars state:', bars);                               // Confirm state updates :contentReference[oaicite:8]{index=8}
}, [bars]);

  // CRITICAL FIX: Changed useEffect dependency array to []
  // This ensures the initial search runs only ONCE on component mount.
  useEffect(() => {
    handleLocationSearch(searchedLocation, searchRadius);
  }, []); // Empty array means this effect runs only once

  const selectedBars = useMemo(() => {
    return bars.filter((bar) => selectedBarIds.has(bar.id));
  }, [bars, selectedBarIds]);

  const handleToggleBar = (barId: string) => {
    setSelectedBarIds((prev) => {
      const newSelected = new Set(prev);
      if (newSelected.has(barId)) {
        newSelected.delete(barId);
      } else {
        newSelected.add(barId);
      }
      return newSelected;
    });
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
      />
      <div className="map-wrapper">
        <MapSearchControl
          onSearch={handleLocationSearch}
          isLoading={isLoading}
          initialLocation={searchedLocation}
          initialRadius={searchRadius}
        />
        <MapContainer
          center={mapCenter}
          radius={searchRadius}
          bars={bars}
          selectedBars={selectedBars}
          selectedBarIds={selectedBarIds}
          hoveredBarId={hoveredBarId}
          onOptimizedRoute={() => {}}
        />
      </div>
    </div>
  );
};

export default Home;