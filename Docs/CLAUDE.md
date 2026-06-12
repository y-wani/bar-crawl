# CLAUDE.md — BarHop Project Guide

> AI assistant reference for working on this codebase. Read this before making changes.

---

## What This App Is

**BarHop** is a React + TypeScript SPA for planning and sharing bar crawl routes. Users search for bars near a location, select a set of stops, optimize the walking route, and save/share the result. The app is cyberpunk-themed with neon aesthetics, Mapbox-powered maps, and Firebase for auth + data persistence.

Live: https://bar-crawl.vercel.app/

---

## Project Status: Core Flows Working, Polish Phase

As of 2026-06-11 all core flows work end-to-end (auth → search → select → route → save → load → share) after a bug-fix pass that resolved the expired Mapbox token, a map-pin rendering race condition, the Load Crawl geolocation bug, and the blank shared-link page.

**See [KNOWN-ISSUES.md](KNOWN-ISSUES.md) for the full, current list of bugs, UX gaps, performance issues, and the prioritized improvement plan.** That file is the source of truth for what to work on next; this table is no longer maintained.

---

## Environment Variables

Create a `.env` file in the project root (never commit it):

```env
VITE_MAPBOX_ACCESS_TOKEN=pk.your_token_here
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

All Vite env vars must be prefixed with `VITE_` to be accessible in the frontend.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19, TypeScript 5.8, Vite 7 |
| Routing | React Router 7 |
| Maps | Mapbox GL JS 3, Mapbox Directions API, Turf.js |
| Auth + DB | Firebase 12 (Auth, Firestore) |
| Animations | Framer Motion 12, Three.js / R3F / Drei |
| Styling | Plain CSS with CSS variables (no Tailwind despite README claim) |
| Deployment | Vercel (vercel.json handles SPA rewrites) |

---

## Directory Map

```
src/
├── App.tsx                  # Root — wraps ThemeProvider, AuthProvider, AppRouter
├── main.tsx                 # Entry point
├── components/              # Shared/reusable UI pieces
│   ├── MapContainer.tsx     # The main Mapbox map — most complex component
│   ├── Sidebar.tsx          # Left panel — bar list + route controls
│   ├── BarList.tsx / BarListItem.tsx
│   ├── SaveCrawlModal.tsx   # Save route dialog
│   ├── ShareRouteButton.tsx
│   ├── SearchBar.tsx / MapSearchControl.tsx / AddressAutocomplete.tsx
│   ├── LocationPermission.tsx / LocationTutorial.tsx
│   ├── Toaster.tsx           # toast.success/error from anywhere
│   ├── motion/               # Framer Motion shared variants + PageTransition
│   ├── SwirlBackground.tsx   # Three.js swirl (Landing + auth pages)
│   └── ErrorBoundary.tsx / LoadingSpinner.tsx / FilterGroup.tsx
├── pages/
│   ├── Landing.tsx          # Public landing page
│   ├── Home.tsx             # Main app page — bar search + map (most logic here)
│   ├── Route.tsx            # Route planning view
│   ├── SavedCrawls.tsx      # Manage saved routes
│   ├── SignIn.tsx / SignUp.tsx
├── routes/
│   ├── AppRouter.tsx        # Route definitions
│   ├── ProtectedRoute.tsx   # Requires auth
│   └── PublicRoute.tsx      # Redirects if already authed
├── context/
│   ├── AuthContext.tsx      # Firebase auth state
│   └── useAuth.ts
├── hooks/
│   ├── useLocationPermission.ts
│   ├── useAddressAutocomplete.ts
│   ├── useCacheManager.ts
│   ├── usePulsingIndicators.ts
│   └── useRouteAnimations.ts
├── services/
│   ├── barCacheService.ts   # Caches Mapbox bar search results in Firestore
│   └── crawlService.ts      # CRUD for saved crawl routes in Firestore
├── firebase/
│   └── config.ts            # Firebase app init
├── types/
│   ├── firestore.ts         # Firestore data model types
│   └── mapbox-gl-directions.d.ts
├── utils/
│   ├── mapLayers.ts
│   └── firebaseTest.ts
└── styles/
    ├── tokens.css           # DESIGN TOKENS — single source of truth (colors, type, spacing)
    ├── system/              # Shared classes: .btn family, .glass, .field-*, .modal-*
    └── *.css                # Per-page/feature CSS, all written on tokens
```

---

## Data Models

### Firestore Collections

**`crawls/{userId}/routes/{routeId}`**
```ts
{
  id: string
  name: string
  description?: string
  bars: BarStop[]
  startLocation?: Coordinates
  endLocation?: Coordinates
  isPublic: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
  userId: string
  sharedToken?: string
}
```

**`barCache/{cacheKey}`**
```ts
{
  bars: Bar[]
  location: { lat: number, lng: number }
  radius: number
  cachedAt: Timestamp
  expiresAt: Timestamp  // 24h TTL
}
```

### Bar Object (from Mapbox POI search)
```ts
{
  id: string
  name: string
  address: string
  coordinates: [number, number]  // [lng, lat]
  category?: string
  distance?: number
  rating?: number
}
```

---

## Key Flows

### Bar Search Flow
1. User enters location or grants geolocation in `Home.tsx`
2. `barCacheService.ts` checks Firestore for cached results within 2-mile radius
3. On cache miss → Mapbox POI search API call
4. Results stored in Firestore cache with 24h expiry
5. Bars rendered as map pins in `MapContainer.tsx` and list in `Sidebar.tsx`

### Route Planning Flow
1. User selects bars (state in `Home.tsx`)
2. Nearest-neighbor optimization runs on ordered selection
3. Route displayed in `Route.tsx` with drag-to-reorder
4. `MapContainer` draws animated path between stops
5. Distance/duration calculated via Haversine formula

### Auth Flow
- Firebase Auth (email/password + Google OAuth)
- `AuthContext.tsx` holds current user state
- `ProtectedRoute` gates `/home`, `/route`, `/saved`
- `PublicRoute` redirects authed users away from `/signin`, `/signup`

---

## Common Tasks

### Adding a new page
1. Create `src/pages/NewPage.tsx`
2. Add a route in `src/routes/AppRouter.tsx`
3. Wrap with `ProtectedRoute` if auth required
4. Add styles in `src/styles/NewPage.css`

### Adding a Firestore operation
1. Add the function to `src/services/crawlService.ts`
2. Import and use the typed models from `src/types/firestore.ts`
3. Use the `db` export from `src/firebase/config.ts`

### Changing colors / design tokens
- Single theme ("refined nightlife"): deep ink + glass + whiskey-amber accent
- All tokens live in `src/styles/tokens.css`; shared component classes in `src/styles/system/`
- Do not hardcode colors — always use the tokens (`var(--accent)`, `var(--glass-2)`, etc.)
- The Landing page (`Landing.tsx` + `Landing.css`) is intentionally self-contained — leave it as is

### Working on the map
- All Mapbox logic is in `src/components/MapContainer.tsx`
- Map layers/sources are set up in `src/utils/mapLayers.ts`
- Pulsing indicators via `src/hooks/usePulsingIndicators.ts`
- Route animations via `src/hooks/useRouteAnimations.ts`

---

## Known TODOs / Unfinished Work

- [ ] **Polygon filter** — `Home.tsx` ~570: filter bars within a drawn polygon on the map
- [ ] **Cache cleanup** — `useCacheManager.ts` has `cleanupExpiredCache()` but it's never invoked
- [ ] **Share flow** — verify end-to-end: generate token → store in Firestore → shared URL → load public route
- [ ] **Error handling** — several API calls lack proper catch/error display
- [ ] **Mobile UX** — map + sidebar layout needs testing on small screens
- [ ] **Party theme perf** — `ThreePartyBackground` may drop frames on lower-end devices

---

## Development Commands

```bash
npm install        # Install dependencies (run first)
npm run dev        # Dev server at http://localhost:5173
npm run build      # Production build (outputs to dist/)
npm run preview    # Preview production build locally
npm run lint       # ESLint
```

---

## Deployment

- Hosted on **Vercel** — push to `main` triggers auto-deploy
- `vercel.json` rewrites all routes to `index.html` (required for React Router)
- Firebase keys in `.env` must also be set as Vercel environment variables
- Mapbox token should be URL-restricted in the Mapbox dashboard to `bar-crawl.vercel.app`
