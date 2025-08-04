// src/hooks/useCacheManager.ts

import { useEffect, useRef } from 'react';
import { 
  getDefaultLocationCache, 
  cacheBars, 
  cleanupOldCache 
} from '../services/barCacheService';
import type { AppBat } from '../pages/Home';

const MAPBOX_ACCESS_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

// Popular locations to pre-cache
const POPULAR_LOCATIONS = [
  { name: "Columbus, Ohio", lat: 39.9612, lng: -83.0007 },
  { name: "New York, NY", lat: 40.7128, lng: -74.0060 },
  { name: "Los Angeles, CA", lat: 34.0522, lng: -118.2437 },
  { name: "Chicago, IL", lat: 41.8781, lng: -87.6298 },
  { name: "Miami, FL", lat: 25.7617, lng: -80.1918 },
  { name: "Austin, TX", lat: 30.2672, lng: -97.7431 },
  { name: "Portland, OR", lat: 45.5152, lng: -122.6784 },
  { name: "Nashville, TN", lat: 36.1627, lng: -86.7816 }
];

// Calculate distance between two points
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

// Fetch bars for a specific location
const fetchBarsForLocation = async (lat: number, lng: number, locationName: string): Promise<AppBat[]> => {
  const categories = ["bar", "pub", "nightclub"];
  const allBars: AppBat[] = [];
  const fetchedBarIds = new Set<string>();

  const searchParams = new URLSearchParams({
    access_token: MAPBOX_ACCESS_TOKEN,
    limit: "25",
    proximity: `${lng},${lat}`
  });

  for (const category of categories) {
    try {
      const barsUrl = `https://api.mapbox.com/search/searchbox/v1/category/${category}?${searchParams.toString()}`;
      const response = await fetch(barsUrl);
      if (!response.ok) continue;
      
      const data = await response.json();
      const features = data.features || [];

      for (const feature of features) {
        const barId = feature.properties?.mapbox_id || `${feature.geometry.coordinates[0]}-${feature.geometry.coordinates[1]}`;
        
        if (fetchedBarIds.has(barId)) continue;
        fetchedBarIds.add(barId);

        const [barLng, barLat] = feature.geometry.coordinates;
        const distance = calculateDistance(lat, lng, barLat, barLng);

        const bar: AppBat = {
          id: barId,
          name: feature.properties?.name || "Unknown Bar",
          location: {
            type: "Point",
            coordinates: [barLng, barLat]
          },
          rating: Math.random() * 2 + 3, // Random rating between 3-5
          distance: distance
        };

        allBars.push(bar);
      }
    } catch (error) {
      console.error(`Error fetching ${category} bars:`, error);
    }
  }

  console.log(`🎯 Fetched ${allBars.length} bars for ${locationName}`);
  return allBars;
};

export const useCacheManager = () => {
  const backgroundCacheInterval = useRef<NodeJS.Timeout | null>(null);
  const cleanupInterval = useRef<NodeJS.Timeout | null>(null);

  // Initialize cache with popular locations on app start
  const initializeCache = async () => {
    try {
      console.log("🔄 Initializing popular location cache...");
      
      // Check if default location needs caching
      const defaultCache = await getDefaultLocationCache();
      
      if (!defaultCache.isFromCache) {
        console.log("📍 Caching default location (Columbus, Ohio)...");
        const defaultLocation = POPULAR_LOCATIONS[0];
        const bars = await fetchBarsForLocation(defaultLocation.lat, defaultLocation.lng, defaultLocation.name);
        
        if (bars.length > 0) {
          await cacheBars(defaultLocation.lat, defaultLocation.lng, bars, defaultLocation.name);
          console.log("✅ Default location cached successfully");
        }
      }
      
      // Background caching of other popular locations
      setTimeout(async () => {
        for (let i = 1; i < Math.min(4, POPULAR_LOCATIONS.length); i++) {
          const location = POPULAR_LOCATIONS[i];
          
          try {
            console.log(`🌍 Background caching ${location.name}...`);
            const bars = await fetchBarsForLocation(location.lat, location.lng, location.name);
            
            if (bars.length > 0) {
              await cacheBars(location.lat, location.lng, bars, location.name);
              console.log(`✅ ${location.name} cached successfully`);
            }
            
            // Wait between requests to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 2000));
            
          } catch (error) {
            console.error(`Error caching ${location.name}:`, error);
          }
        }
      }, 5000); // Start background caching after 5 seconds
      
    } catch (error) {
      console.error("Error initializing cache:", error);
    }
  };

  // Refresh cache periodically
  const startBackgroundRefresh = () => {
    // Refresh cache every 6 hours
    backgroundCacheInterval.current = setInterval(async () => {
      console.log("🔄 Background cache refresh started...");
      
      try {
        // Refresh default location
        const defaultLocation = POPULAR_LOCATIONS[0];
        const bars = await fetchBarsForLocation(defaultLocation.lat, defaultLocation.lng, defaultLocation.name);
        
        if (bars.length > 0) {
          await cacheBars(defaultLocation.lat, defaultLocation.lng, bars, defaultLocation.name);
          console.log("✅ Default location cache refreshed");
        }
      } catch (error) {
        console.error("Error refreshing cache:", error);
      }
    }, 6 * 60 * 60 * 1000); // 6 hours

    // Clean up old cache entries every 12 hours
    cleanupInterval.current = setInterval(async () => {
      console.log("🧹 Cleaning up old cache entries...");
      await cleanupOldCache();
    }, 12 * 60 * 60 * 1000); // 12 hours
  };

  // Stop background processes
  const stopBackgroundProcesses = () => {
    if (backgroundCacheInterval.current) {
      clearInterval(backgroundCacheInterval.current);
      backgroundCacheInterval.current = null;
    }
    
    if (cleanupInterval.current) {
      clearInterval(cleanupInterval.current);
      cleanupInterval.current = null;
    }
  };

  // Initialize on mount
  useEffect(() => {
    initializeCache();
    startBackgroundRefresh();

    return () => {
      stopBackgroundProcesses();
    };
  }, []);

  return {
    initializeCache,
    startBackgroundRefresh,
    stopBackgroundProcesses
  };
};