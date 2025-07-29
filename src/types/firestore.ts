// Firestore data types for bar crawl application

export interface Bar {
  id: string;
  name: string;
  address: string;
  location: {
    lat: number;
    lng: number;
  };
  rating?: number;
  priceLevel?: 'budget' | 'moderate' | 'expensive';
  category?: string;
  phone?: string;
  website?: string;
  hours?: {
    [key: string]: string; // day of week -> hours
  };
  photos?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface BarCrawl {
  id: string;
  name: string;
  description?: string;
  bars: BarCrawlBar[];
  route: {
    startLocation: {
      lat: number;
      lng: number;
    };
    endLocation?: {
      lat: number;
      lng: number;
    };
    totalDistance?: number; // in meters
    estimatedDuration?: number; // in minutes
  };
  settings: {
    maxBars: number;
    maxDistance: number; // in meters
    priceRange?: 'budget' | 'moderate' | 'expensive' | 'any';
    categories?: string[];
  };
  createdBy: string; // user ID
  isPublic: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface BarCrawlBar {
  barId: string;
  order: number;
  estimatedTime: number; // minutes spent at this bar
  notes?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  preferences: {
    favoriteCategories?: string[];
    maxDistance?: number;
    priceRange?: 'budget' | 'moderate' | 'expensive' | 'any';
  };
  savedCrawls: string[]; // array of crawl IDs
  createdAt: Date;
  updatedAt: Date;
}

export interface CrawlSession {
  id: string;
  crawlId: string;
  participants: string[]; // user IDs
  currentBarIndex: number;
  status: 'planned' | 'active' | 'completed' | 'cancelled';
  startTime?: Date;
  endTime?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Firestore document references
export type BarDocument = Omit<Bar, 'id'>;
export type BarCrawlDocument = Omit<BarCrawl, 'id'>;
export type UserProfileDocument = Omit<UserProfile, 'id'>;
export type CrawlSessionDocument = Omit<CrawlSession, 'id'>; 