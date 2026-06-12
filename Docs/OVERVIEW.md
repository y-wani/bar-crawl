# BarHop — Project Overview

## What It Is

BarHop is a single-page web app for planning bar crawl routes. You search for bars near a location, pick the ones you want to visit, and the app builds an optimized walking route between them. Routes can be saved to your account and shared with friends.

---

## Current State

The project is **partially complete**. The core architecture is solid and the main features have been built, but several flows are broken or unfinished. The app appears to have been live at one point (`bar-crawl.vercel.app`) and is being resumed for completion.

### What Works (or Should Work)
- Landing page with auth (sign in / sign up, Google OAuth)
- Bar search by location using Mapbox POI API
- Interactive map with markers and route visualization
- Basic route planning with nearest-neighbor optimization
- Saving routes to Firestore
- Dark/light/party theme toggle

### What's Broken or Incomplete
- Polygon-based bar filtering is stubbed but not implemented
- Share route flow (`/shared/:token`) needs end-to-end verification
- Cache cleanup is written but never called
- Some error states have no user-facing feedback
- Mobile layout needs testing

---

## Architecture at a Glance

```
Browser
  └── React SPA (Vite)
        ├── React Router — Landing, Home, Route, SavedCrawls, Auth pages
        ├── AuthContext — Firebase Auth session
        ├── ThemeContext — dark/light/party CSS variable switching
        ├── MapContainer — Mapbox GL JS map with pins, route lines, draw tools
        ├── Sidebar — bar list, selection, route controls
        └── Services
              ├── barCacheService — Mapbox search → Firestore cache (24h TTL)
              └── crawlService — CRUD for saved routes in Firestore

External Services
  ├── Mapbox GL JS — interactive vector map tiles
  ├── Mapbox Directions API — turn-by-turn routing
  ├── Mapbox POI Search — bar/pub discovery
  ├── Firebase Auth — email/password + Google OAuth
  └── Firestore — bar cache + user's saved crawls
```

---

## Page Routing

| Path | Component | Auth Required |
|------|-----------|---------------|
| `/` | `Landing.tsx` | No |
| `/home` | `Home.tsx` | Yes |
| `/route` | `Route.tsx` | Yes |
| `/saved` | `SavedCrawls.tsx` | Yes |
| `/signin` | `SignIn.tsx` | No (redirects if authed) |
| `/signup` | `SignUp.tsx` | No (redirects if authed) |

---

## Core User Journey

```
Landing page
    ↓
Sign up / Sign in
    ↓
Home — enter location → bars appear on map + sidebar
    ↓
Select bars → click "Plan Route"
    ↓
Route page — optimized order, drag to reorder, see total distance
    ↓
Save crawl (name + description) → stored in Firestore
    ↓
Saved Crawls page — view, reload, or delete past routes
```

---

## File Quick Reference

| What you want to change | File |
|-------------------------|------|
| Map behavior / pins / layers | [src/components/MapContainer.tsx](../src/components/MapContainer.tsx) |
| Bar search + main app logic | [src/pages/Home.tsx](../src/pages/Home.tsx) |
| Route planning UI | [src/pages/Route.tsx](../src/pages/Route.tsx) |
| Saved routes page | [src/pages/SavedCrawls.tsx](../src/pages/SavedCrawls.tsx) |
| Firestore read/write for crawls | [src/services/crawlService.ts](../src/services/crawlService.ts) |
| Bar data caching logic | [src/services/barCacheService.ts](../src/services/barCacheService.ts) |
| Auth (sign in/out/state) | [src/context/AuthContext.tsx](../src/context/AuthContext.tsx) |
| Theme colors (CSS vars) | [src/theme/theme.css](../src/theme/theme.css) |
| Route definitions | [src/routes/AppRouter.tsx](../src/routes/AppRouter.tsx) |
| Firebase init + config | [src/firebase/config.ts](../src/firebase/config.ts) |

---

## Design Language

The app uses a **cyberpunk / neon aesthetic**:
- Dark backgrounds (`#0a0a0a` base)
- Neon accents: cyan (`#00f5ff`), magenta (`#ff00ff`), yellow-green (`#39ff14`)
- Glowing box shadows and animated borders
- Custom CSS (no Tailwind — README is incorrect on this point)
- CSS variables for all theme tokens in `src/theme/theme.css`
- Three modes: dark (default), light, party (Three.js animated background)

---

## Dependencies Worth Knowing

| Package | Why It's Here |
|---------|---------------|
| `mapbox-gl` | Core map rendering |
| `@mapbox/mapbox-gl-directions` | Turn-by-turn route overlay |
| `@mapbox/mapbox-gl-draw` | Polygon/shape drawing tools on map |
| `@mapbox/search-js-react` | Location autocomplete UI component |
| `@turf/turf` | Geospatial math (distance, bbox, etc.) |
| `firebase` | Auth + Firestore |
| `framer-motion` | Page transitions + component animations |
| `three` + `@react-three/fiber` + `@react-three/drei` | 3D backgrounds for party theme |
| `@tsparticles/*` | Particle effects |
| `react-icons` | Icon set (FontAwesome, Feather, etc.) |
| `party-js` | Confetti/celebration effects |
| `lodash` | Utility functions (debounce, etc.) |
| `@vercel/analytics` | Page view tracking |

---

## Environment Setup

`.env` file required in project root:

```env
VITE_MAPBOX_ACCESS_TOKEN=
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

For Vercel deployment, set the same variables in the Vercel project dashboard under Settings → Environment Variables.

---

## Immediate Priorities (Suggested Completion Order)

1. **Verify the app runs locally** — `npm install` then `npm run dev` with a valid `.env`
2. **Fix the share flow** — generate token, write to Firestore, load shared route at `/shared/:token`
3. **Implement polygon filter** — `Home.tsx` has a TODO; wire up Mapbox Draw to filter `bars` state
4. **Wire cache cleanup** — call `cleanupExpiredCache()` on app startup or on a schedule
5. **Error handling pass** — add `try/catch` + toast/banner feedback on API failures
6. **Mobile layout audit** — test sidebar + map layout at 375px width
