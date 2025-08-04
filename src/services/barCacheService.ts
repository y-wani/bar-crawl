// src/services/barCacheService.ts

import { 
  collection, 
  addDoc,
  query, 
  getDocs, 
  serverTimestamp,
  orderBy,
  limit,
  Timestamp 
} from 'firebase/firestore';
import { db } from '../firebase/config';
import type { AppBat } from '../pages/Home';

interface CachedBarArea {
  id?: string;
  centerLat: number;
  centerLng: number;
  radius: number; // in miles
  bars: AppBat[];
  fetchedAt: Timestamp;
  location: string; // Human readable location name
}

interface CacheSearchResult {
  bars: AppBat[];
  isFromCache: boolean;
  cacheAge?: number; // in hours
}

const COLLECTION_NAME = 'barCache';
const CACHE_EXPIRY_HOURS = 24; // Cache expires after 24 hours
const SEARCH_RADIUS_MILES = 2; // Search within 2 miles for cached data

// Helper function to calculate distance between two points
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

// Check if cache is still valid
const isCacheValid = (fetchedAt: Timestamp): boolean => {
  const now = new Date();
  const cacheTime = fetchedAt.toDate();
  const hoursDiff = (now.getTime() - cacheTime.getTime()) / (1000 * 60 * 60);
  return hoursDiff < CACHE_EXPIRY_HOURS;
};

// Get cached bars for a location
export const getCachedBars = async (
  centerLat: number, 
  centerLng: number,
  searchRadius: number = SEARCH_RADIUS_MILES
): Promise<CacheSearchResult> => {
  try {
    console.log(`🔍 Searching cache for bars near (${centerLat}, ${centerLng})`);
    
    // Query Firestore for nearby cached areas
    const cacheQuery = query(
      collection(db, COLLECTION_NAME),
      orderBy('fetchedAt', 'desc'),
      limit(50) // Get recent caches
    );
    
    const querySnapshot = await getDocs(cacheQuery);
    
    for (const doc of querySnapshot.docs) {
      const cacheData = doc.data() as CachedBarArea;
      
      // Check if this cached area is close enough
      const distance = calculateDistance(
        centerLat, 
        centerLng, 
        cacheData.centerLat, 
        cacheData.centerLng
      );
      
      if (distance <= searchRadius && isCacheValid(cacheData.fetchedAt)) {
        console.log(`✅ Found valid cache within ${distance.toFixed(2)} miles`);
        const cacheAge = (new Date().getTime() - cacheData.fetchedAt.toDate().getTime()) / (1000 * 60 * 60);
        
        return {
          bars: cacheData.bars,
          isFromCache: true,
          cacheAge: cacheAge
        };
      }
    }
    
    console.log("❌ No valid cache found");
    return {
      bars: [],
      isFromCache: false
    };
    
  } catch (error) {
    console.error("Error fetching cached bars:", error);
    return {
      bars: [],
      isFromCache: false
    };
  }
};

// Cache bars for a location
export const cacheBars = async (
  centerLat: number,
  centerLng: number,
  bars: AppBat[],
  location: string = "Unknown Location",
  radius: number = 2
): Promise<void> => {
  try {
    console.log(`💾 Caching ${bars.length} bars for ${location}`);
    
    const cacheData: CachedBarArea = {
      centerLat,
      centerLng,
      radius,
      bars,
      fetchedAt: serverTimestamp() as Timestamp,
      location
    };
    
    await addDoc(collection(db, COLLECTION_NAME), cacheData);
    console.log("✅ Bars cached successfully");
    
  } catch (error) {
    console.error("Error caching bars:", error);
  }
};

// Get default location cache (Columbus, Ohio)
export const getDefaultLocationCache = async (): Promise<CacheSearchResult> => {
  const defaultLat = 39.9612;
  const defaultLng = -83.0007;
  
  return await getCachedBars(defaultLat, defaultLng, 5); // Larger search radius for default
};

// Pre-populate cache with default location
export const initializeDefaultCache = async (bars: AppBat[]): Promise<void> => {
  const defaultLat = 39.9612;
  const defaultLng = -83.0007;
  
  // Check if we already have recent cache for default location
  const existingCache = await getCachedBars(defaultLat, defaultLng, 1);
  
  if (!existingCache.isFromCache && bars.length > 0) {
    await cacheBars(defaultLat, defaultLng, bars, "Columbus, Ohio", 3);
    console.log("🏠 Default location cache initialized");
  } else {
    console.log("🏠 Default location cache already exists");
  }
};

// Clean up old cache entries (call periodically)
export const cleanupOldCache = async (): Promise<void> => {
  try {
    const cacheQuery = query(
      collection(db, COLLECTION_NAME),
      orderBy('fetchedAt', 'asc')
    );
    
    const querySnapshot = await getDocs(cacheQuery);
    const toDelete: string[] = [];
    
    querySnapshot.docs.forEach((doc) => {
      const cacheData = doc.data() as CachedBarArea;
      if (!isCacheValid(cacheData.fetchedAt)) {
        toDelete.push(doc.id);
      }
    });
    
    // Note: In a real app, you'd batch delete these
    console.log(`🧹 Found ${toDelete.length} expired cache entries`);
    
  } catch (error) {
    console.error("Error cleaning up cache:", error);
  }
};