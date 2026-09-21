// Metros pre-seeded into the bar cache so a guest's first view is never empty.
// Scope is US + UK + Canada, matching observed traffic (US 76%, UK 8%, CA 4%).
// Germany and France are ~1 visitor each at current volume — deferred.
// Consumed by scripts/seed-metro-cache.mjs and useCacheManager.

export interface SeedMetro {
  name: string;
  lat: number;
  lng: number;
}

// The default location used by getDefaultLocationCache() in barCacheService.ts,
// which is hardcoded to these coordinates. Referenced (not duplicated) below so
// the two can never drift apart.
export const DEFAULT_SEED_METRO: SeedMetro = { name: "Columbus, OH", lat: 39.9612, lng: -83.0007 };

export const SEED_METROS: SeedMetro[] = [
  // United States
  { name: "New York, NY", lat: 40.7128, lng: -74.0060 },
  { name: "Los Angeles, CA", lat: 34.0522, lng: -118.2437 },
  { name: "Chicago, IL", lat: 41.8781, lng: -87.6298 },
  { name: "Houston, TX", lat: 29.7604, lng: -95.3698 },
  { name: "Phoenix, AZ", lat: 33.4484, lng: -112.0740 },
  { name: "Philadelphia, PA", lat: 39.9526, lng: -75.1652 },
  { name: "San Antonio, TX", lat: 29.4241, lng: -98.4936 },
  { name: "San Diego, CA", lat: 32.7157, lng: -117.1611 },
  { name: "Dallas, TX", lat: 32.7767, lng: -96.7970 },
  { name: "Austin, TX", lat: 30.2672, lng: -97.7431 },
  { name: "San Francisco, CA", lat: 37.7749, lng: -122.4194 },
  { name: "Seattle, WA", lat: 47.6062, lng: -122.3321 },
  { name: "Denver, CO", lat: 39.7392, lng: -104.9903 },
  { name: "Boston, MA", lat: 42.3601, lng: -71.0589 },
  { name: "Nashville, TN", lat: 36.1627, lng: -86.7816 },
  { name: "Portland, OR", lat: 45.5152, lng: -122.6784 },
  { name: "Las Vegas, NV", lat: 36.1699, lng: -115.1398 },
  { name: "Miami, FL", lat: 25.7617, lng: -80.1918 },
  { name: "Atlanta, GA", lat: 33.7490, lng: -84.3880 },
  { name: "New Orleans, LA", lat: 29.9511, lng: -90.0715 },
  DEFAULT_SEED_METRO,
  { name: "Grand Rapids, MI", lat: 42.9634, lng: -85.6681 },
  { name: "Minneapolis, MN", lat: 44.9778, lng: -93.2650 },
  { name: "Pittsburgh, PA", lat: 40.4406, lng: -79.9959 },
  { name: "Charlotte, NC", lat: 35.2271, lng: -80.8431 },
  // United Kingdom
  { name: "London, UK", lat: 51.5072, lng: -0.1276 },
  { name: "Manchester, UK", lat: 53.4808, lng: -2.2426 },
  { name: "Birmingham, UK", lat: 52.4862, lng: -1.8904 },
  { name: "Leeds, UK", lat: 53.8008, lng: -1.5491 },
  { name: "Glasgow, UK", lat: 55.8642, lng: -4.2518 },
  { name: "Edinburgh, UK", lat: 55.9533, lng: -3.1883 },
  // Canada
  { name: "Toronto, ON", lat: 43.6532, lng: -79.3832 },
  { name: "Vancouver, BC", lat: 49.2827, lng: -123.1207 },
];
