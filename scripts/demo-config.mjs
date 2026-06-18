// scripts/demo-config.mjs
//
// Shared config for the demo scripts. The Firebase web config is the PUBLIC
// client config (safe to commit — same values ship in the browser bundle).
// The demo login is a deliberately shareable showcase account.

export const PROJECT_ID = "bar-crawl-planner-5985f";

export const FIREBASE_WEB_CONFIG = {
  apiKey: "AIzaSyCLWeKgrI_7OHGbyBFtQUVYDQWESwF2cps",
  authDomain: "bar-crawl-planner-5985f.firebaseapp.com",
  projectId: "bar-crawl-planner-5985f",
  storageBucket: "bar-crawl-planner-5985f.firebasestorage.app",
  messagingSenderId: "235279583042",
  appId: "1:235279583042:web:f740344412b3381180aadb",
};

export const DEMO_EMAIL = process.env.DEMO_EMAIL || "demo@gobarhop.app";
export const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "BarHopDemo2026";
export const DEMO_NAME = "Demo";

// Prod is where maps + the billed proxy actually work (the Mapbox token is
// restricted to gobarhop.app), so the demo runs against the live site.
export const DEMO_URL = process.env.DEMO_URL || "https://www.gobarhop.app";

// Downtown Columbus — the demo's "current location" (matches the app's default
// center, so the map, bar fetch, and pins all stay aligned in automation). The
// browser is given this geolocation; the first crawl stop sits ~0.2mi away so
// the squad tracker shows a live ETA.
export const DEMO_GEO = { latitude: 39.9612, longitude: -83.0007 };
