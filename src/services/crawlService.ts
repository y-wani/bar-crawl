// src/services/crawlService.ts

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  type Timestamp,
} from "firebase/firestore";
import { db } from "../firebase/config";
import type { AppBat } from "../pages/Home";

// Enhanced bar crawl interface for Firestore
export interface SavedBarCrawl {
  id?: string;
  name: string;
  description?: string;
  bars: SavedBarData[];
  route: {
    startLocation: {
      lat: number;
      lng: number;
      address?: string;
    };
    endLocation: {
      lat: number;
      lng: number;
      address?: string;
    };
    totalDistance?: number; // in miles
    estimatedDuration?: number; // in minutes
  };
  mapCenter: [number, number];
  searchRadius: number;
  createdBy: string; // user ID
  isPublic: boolean;
  tags?: string[];
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}

export interface SavedBarData {
  id: string;
  name: string;
  rating: number;
  distance: number;
  location: {
    type: "Point";
    coordinates: [number, number];
  };
  order: number;
  notes?: string;
  estimatedTime?: number; // minutes to spend at this bar
}

const CRAWLS_COLLECTION = "barCrawls";

/**
 * Save a new bar crawl to Firestore
 */
export const saveCrawl = async (
  crawlData: Omit<SavedBarCrawl, "id" | "createdAt" | "updatedAt">
): Promise<string> => {
  try {
    console.log("🗄️ CrawlService: Starting save to Firestore...");
    console.log("📊 Collection:", CRAWLS_COLLECTION);
    console.log("🔍 Data validation:", {
      hasName: !!crawlData.name,
      hasCreatedBy: !!crawlData.createdBy,
      barsCount: crawlData.bars?.length || 0,
      hasMapCenter: !!crawlData.mapCenter,
    });

    const crawlWithTimestamps = {
      ...crawlData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    console.log("⏰ Adding timestamps and saving to Firestore...");
    const docRef = await addDoc(
      collection(db, CRAWLS_COLLECTION),
      crawlWithTimestamps
    );
    console.log("✅ Crawl saved successfully with ID:", docRef.id);
    return docRef.id;
  } catch (error) {
    console.error("❌ Error saving crawl:", error);
    console.error("Error type:", typeof error);
    console.error("Error constructor:", error?.constructor?.name);

    // Check for specific Firebase errors
    if ((error as any)?.code) {
      console.error("🔥 Firebase error code:", (error as any).code);
      console.error("🔥 Firebase error message:", (error as any).message);
    }

    throw new Error("Failed to save crawl. Please try again.");
  }
};

/**
 * Get all crawls for a specific user
 */
export const getUserCrawls = async (
  userId: string
): Promise<SavedBarCrawl[]> => {
  try {
    const q = query(
      collection(db, CRAWLS_COLLECTION),
      where("createdBy", "==", userId)
    );
    const querySnapshot = await getDocs(q);
    const crawls: SavedBarCrawl[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      // Safely convert Timestamps to Dates
      const createdAt = data.createdAt?.toDate
        ? data.createdAt.toDate()
        : new Date();
      const updatedAt = data.updatedAt?.toDate
        ? data.updatedAt.toDate()
        : new Date();

      crawls.push({
        id: doc.id,
        ...data,
        createdAt,
        updatedAt,
      } as SavedBarCrawl);
    });
    
    // Sort by creation date (newest first) since we can't use orderBy in query
    crawls.sort((a, b) => {
      const aDate = a.createdAt instanceof Date ? a.createdAt : new Date();
      const bDate = b.createdAt instanceof Date ? b.createdAt : new Date();
      return bDate.getTime() - aDate.getTime();
    });

    console.log(`📋 Retrieved ${crawls.length} crawls for user ${userId}`);
    return crawls;
  } catch (error) {
    console.error("❌ Error fetching user crawls:", error);
    throw new Error("Failed to load saved crawls. Please try again.");
  }
};

/**
 * Get a specific crawl by ID
 */
export const getCrawlById = async (
  crawlId: string
): Promise<SavedBarCrawl | null> => {
  try {
    const docRef = doc(db, CRAWLS_COLLECTION, crawlId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return {
        id: docSnap.id,
        ...docSnap.data(),
      } as SavedBarCrawl;
    } else {
      console.log("📭 No crawl found with ID:", crawlId);
      return null;
    }
  } catch (error) {
    console.error("❌ Error fetching crawl:", error);
    throw new Error("Failed to load crawl. Please try again.");
  }
};

/**
 * Update an existing crawl
 */
export const updateCrawl = async (
  crawlId: string,
  updates: Partial<SavedBarCrawl>
): Promise<void> => {
  try {
    const docRef = doc(db, CRAWLS_COLLECTION, crawlId);
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
    console.log("✅ Crawl updated successfully");
  } catch (error) {
    console.error("❌ Error updating crawl:", error);
    throw new Error("Failed to update crawl. Please try again.");
  }
};

/**
 * Delete a crawl
 */
export const deleteCrawl = async (crawlId: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, CRAWLS_COLLECTION, crawlId));
    console.log("✅ Crawl deleted successfully");
  } catch (error) {
    console.error("❌ Error deleting crawl:", error);
    throw new Error("Failed to delete crawl. Please try again.");
  }
};

/**
 * Get public crawls (for community features)
 */
export const getPublicCrawls = async (
  limit: number = 20
): Promise<SavedBarCrawl[]> => {
  try {
    const q = query(
      collection(db, CRAWLS_COLLECTION),
      where("isPublic", "==", true),
      orderBy("updatedAt", "desc")
    );

    const querySnapshot = await getDocs(q);
    const crawls: SavedBarCrawl[] = [];

    querySnapshot.forEach((doc) => {
      crawls.push({
        id: doc.id,
        ...doc.data(),
      } as SavedBarCrawl);
    });

    console.log(`🌐 Retrieved ${crawls.length} public crawls`);
    return crawls.slice(0, limit);
  } catch (error) {
    console.error("❌ Error fetching public crawls:", error);
    throw new Error("Failed to load public crawls. Please try again.");
  }
};

/**
 * Convert app bars to saved bar data format
 */
export const convertAppBarsToSavedBars = (bars: AppBat[]): SavedBarData[] => {
  return bars.map((bar, index) => ({
    id: bar.id,
    name: bar.name,
    rating: bar.rating,
    distance: bar.distance,
    location: bar.location,
    order: index,
    estimatedTime: 30, // Default 30 minutes per bar
  }));
};

/**
 * Convert saved bars back to app bars format
 */
export const convertSavedBarsToAppBars = (
  savedBars: SavedBarData[]
): AppBat[] => {
  return savedBars
    .sort((a, b) => a.order - b.order)
    .map((bar) => ({
      id: bar.id,
      name: bar.name,
      rating: bar.rating,
      distance: bar.distance,
      location: bar.location,
    }));
};
