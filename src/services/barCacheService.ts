// src/services/barCacheService.ts

import {
  collection,
  addDoc,
  query,
  getDocs,
  serverTimestamp,
  orderBy,
  where,
  limit,
  Timestamp
} from 'firebase/firestore';
import { db } from '../firebase/config';
import type { AppBat } from '../pages/Home';
import { isGooglePlacesEnabled } from './placesService';

// Dev logging stub — swap for console.log when debugging
const debug = (..._args: unknown[]) => {};

interface CachedBarArea {
  id?: string;
  centerLat: number;
  centerLng: number;
  radius: number; // in miles
  bars: AppBat[];
  fetchedAt: Timestamp;
  location: string; // Human readable location name
  seeded?: boolean;
}

interface CacheSearchResult {
  bars: AppBat[];
  isFromCache: boolean;
  cacheAge?: number; // in hours
}

// V2 collection holds Google Places data (real ratings); the legacy
// collection holds Mapbox results with generated ratings. Keeping them
// separate means switching data sources never serves mismatched cache.
const COLLECTION_NAME = isGooglePlacesEnabled ? 'barCacheV5' : 'barCache';
// User-driven searches expire daily. Seeded metro areas last far longer: bar
// listings don't change day to day, and re-seeding 33 metros nightly would
// reintroduce the per-visitor Places cost that seeding exists to remove.
const CACHE_EXPIRY_HOURS = 24;
const SEEDED_CACHE_EXPIRY_HOURS = 24 * 30;
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
export const isCacheValid = (fetchedAt: Timestamp, seeded = false): boolean => {
  const hoursDiff =
    (Date.now() - fetchedAt.toDate().getTime()) / (1000 * 60 * 60);
  return hoursDiff < (seeded ? SEEDED_CACHE_EXPIRY_HOURS : CACHE_EXPIRY_HOURS);
};

// Walk a list of cached areas and return the first one that is both within
// searchRadius and still valid (respecting the seeded 30-day window). Shared
// by both the recent-50 pass and the seeded-fallback pass in getCachedBars
// so the proximity+expiry logic exists in exactly one place.
export const findCachedMatch = (
  areas: CachedBarArea[],
  centerLat: number,
  centerLng: number,
  searchRadius: number
): CacheSearchResult | null => {
  for (const cacheData of areas) {
    // Check if this cached area is close enough
    const distance = calculateDistance(
      centerLat,
      centerLng,
      cacheData.centerLat,
      cacheData.centerLng
    );

    if (distance <= searchRadius && isCacheValid(cacheData.fetchedAt, cacheData.seeded === true)) {
      debug(`✅ Found valid cache within ${distance.toFixed(2)} miles`);
      const cacheAge = (new Date().getTime() - cacheData.fetchedAt.toDate().getTime()) / (1000 * 60 * 60);

      return {
        bars: cacheData.bars,
        isFromCache: true,
        cacheAge: cacheAge
      };
    }
  }

  return null;
};

// Get cached bars for a location
export const getCachedBars = async (
  centerLat: number,
  centerLng: number,
  searchRadius: number = SEARCH_RADIUS_MILES
): Promise<CacheSearchResult> => {
  try {
    debug(`🔍 Searching cache for bars near (${centerLat}, ${centerLng})`);

    // Query Firestore for nearby cached areas
    const cacheQuery = query(
      collection(db, COLLECTION_NAME),
      orderBy('fetchedAt', 'desc'),
      limit(50) // Get recent caches
    );

    const querySnapshot = await getDocs(cacheQuery);
    const recentMatch = findCachedMatch(
      querySnapshot.docs.map((doc) => doc.data() as CachedBarArea),
      centerLat,
      centerLng,
      searchRadius
    );
    if (recentMatch) return recentMatch;

    // Seeded metros (seeded: true) can be pushed out of the recent-50 window
    // by ordinary user traffic well before their 30-day window is up. Fall
    // back to a query restricted to seeded docs. Equality filter + limit,
    // NO orderBy — that only needs the automatic single-field index, unlike
    // orderBy which would require a hand-created composite index.
    const seededQuery = query(
      collection(db, COLLECTION_NAME),
      where('seeded', '==', true),
      limit(50)
    );
    const seededSnapshot = await getDocs(seededQuery);
    const seededMatch = findCachedMatch(
      seededSnapshot.docs.map((doc) => doc.data() as CachedBarArea),
      centerLat,
      centerLng,
      searchRadius
    );
    if (seededMatch) return seededMatch;

    debug("❌ No valid cache found");
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
  radius: number = 2,
  seeded: boolean = false
): Promise<void> => {
  try {
    debug(`💾 Caching ${bars.length} bars for ${location}`);

    const cacheData: CachedBarArea = {
      centerLat,
      centerLng,
      radius,
      bars,
      fetchedAt: serverTimestamp() as Timestamp,
      location,
      seeded
    };
    
    await addDoc(collection(db, COLLECTION_NAME), cacheData);
    debug("✅ Bars cached successfully");
    
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
    debug("🏠 Default location cache initialized");
  } else {
    debug("🏠 Default location cache already exists");
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
      if (!isCacheValid(cacheData.fetchedAt, cacheData.seeded === true)) {
        toDelete.push(doc.id);
      }
    });
    
    // Note: In a real app, you'd batch delete these
    debug(`🧹 Found ${toDelete.length} expired cache entries`);
    
  } catch (error) {
    console.error("Error cleaning up cache:", error);
  }
};