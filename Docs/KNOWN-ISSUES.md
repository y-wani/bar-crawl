# Known Issues & Improvement Plan

> State of the app as of 2026-06-11, after the token fix and core bug-fix pass.
> All core flows work (auth → search → select → route → save → load → share),
> but the app does not yet feel like a polished product. This doc captures why,
> and what to do about it — ordered by how much each item hurts the experience.

---

## Recently Fixed (for context)

These were fixed and verified in-browser on 2026-06-11 — listed so we don't re-investigate them:

| Issue | Fix |
|---|---|
| Entire site broken (expired Mapbox token, no `.env`) | New token in `.env` |
| Bars never rendered on map | Race condition in `MapContainer.tsx` — data was set before the async marker/layer creation finished; fixed with `mapReady` state gating |
| Two modals stacked on first visit | Tutorial now waits for location permission dialog |
| "Created Unknown" on Saved Crawls | `formatDate` didn't handle `Date` instances |
| Load Crawl routed 306 mi to Michigan | Saved start/end coords now restored instead of browser geolocation |
| Shared links (`/route?crawlId=`) blank page | Removed `return null` guard that killed the crawlId path |

### Map & Performance Overhaul (sections 1 + 2, completed 2026-06-11)

| Item | What changed |
|---|---|
| Pin redesign (1.1) | New bold teardrop pin with martini glyph, registered at 2x pixelRatio — legible at real zoom sizes (`mapLayers.ts`) |
| Selection states (1.2) | Glow-circle layers deleted; selected bars are numbered magenta circles (stop order), hover = opacity/radius bump. Selection is data-driven via `selectedOrder` property |
| Route page chaos (1.3) | `useRouteAnimations` rewritten: per-frame rAF particle/gradient loop and 10 glow layers replaced with casing + cyan→magenta gradient line, simple start (play) / end (flag) pins. Zero per-frame work |
| Console spam (2.1) | Render/hover-path logs removed; fetch/cache logs routed through a no-op `debug()` stub |
| Popup churn (2.2) | Single persistent popup, moved/refilled on hover; rainbow-animated popup CSS replaced with a calm dark card (`components.css`) |
| Feature-state loop (2.3) | Hover effect now touches only the 2 affected features instead of all 75 bars per mouse move |
| Full-page loading gate (2.4) | Removed; layout renders immediately, map shows its own in-place loading indicator |
| Background city caching (2.5) | Deferred 8s after load so it can't compete with the visible page |
| `flyTo` on mount (2.6) | Skipped when the map is already at the target center |
| Fresh-route Michigan bug (new) | If browser geolocation is >25 mi from the searched area, the route anchors to the search center instead |

### Google Places Data Migration (completed 2026-06-11)

| Item | What changed |
|---|---|
| Fake ratings (4.5) | Bar data now comes from Google Places API (New) via `placesService.ts` — real ratings, review counts, addresses, open-now status, price level. The `Math.random()` ratings are gone |
| Result quality (4.2, 4.3) | `includedPrimaryTypes: bar/pub/night_club/wine_bar` — no more skate rinks, shopping plazas, or duplicate franchises. 20 curated results instead of 75 noisy ones |
| UI | Bar list shows "4.5 (3.2k)" + Open/Closed badge; map popup shows real rating, review count, open status, and address (fake "Vibe" labels removed) |
| Caching | Places data cached in a separate Firestore collection (`barCacheV3`) so legacy fake-rating caches are never served |
| Fallback | If `VITE_GOOGLE_PLACES_API_KEY` is missing, the app falls back to the legacy Mapbox category search automatically |
| Click-blocking overlay (new bug found) | `LocationPermission` rendered an invisible full-screen overlay during/after its closing animation, swallowing all clicks. Fixed: `pointer-events: none` while closing + no animation on initial mount |

**API key:** restricted by the user on 2026-06-11 (HTTP referrers + Places API New). Still needs adding to Vercel env vars before the next production deploy.

### Polish Batch (completed 2026-06-11)

| Item | What changed |
|---|---|
| Toast system (4.1) | New `Toaster.tsx` + `toast.success/error()` API, mounted in App. Both `alert()` calls in SavedCrawls replaced |
| Polygon filter (3.1) | Implemented — drawing a polygon filters the map pins, sidebar list, and radius counts via Turf `booleanPointInPolygon`; trash tool clears it. Toast feedback on apply/clear |
| Oversized permission modal (4.4) | Compact 440px card, `max-height: 90vh` with scroll, tightened spacing |
| Stale tutorial copy (4.10) | Steps rewritten to match the real UI (search above map, real ratings, list/pin selection, polygon pro-tip) |
| ETA ambiguity (4.7, partial) | Route page now labels duration "~N min walk". Full walk+dwell unification still open |
| Cache cleanup (3.2) | `cleanupOldCache()` now runs once per session (8s after load) in addition to the 12h interval |

### Mobile Fix + Bar Coverage (completed 2026-06-11)

| Item | What changed |
|---|---|
| Mobile unusable (section 6) | **Critical:** on stacked layouts the sidebar's 30-35vh + `overflow: hidden` clipped the bar list AND the Generate Route button — mobile users couldn't build a route at all. Fixed with an override block at the end of `responsive.css`: sidebar 52vh, bar list flex+scrolls, button pinned visible. Route page and SavedCrawls verified fine on mobile |
| Bar coverage (user report: Chicago) | `searchNearby` caps at 20/request. `fetchNearbyBars` now fans out 4 parallel requests (bar+wine_bar×popularity, bar+wine_bar×distance, pub, night_club) and dedupes by place id → ~60-75 unique bars per area (Chicago: 20→74, Columbus: 20→64) |
| Junk POIs | Places with no rating AND no reviews are filtered out (user-created placeholder pins like "St pattys chi town recs") |
| Cache | Bumped to `barCacheV5` (each Places-side data change gets a fresh collection) |

Cost note: each area search is now 4 Nearby Search (Pro SKU) calls instead of 1. Fine at hobby scale; if usage grows, add result caching beyond Firestore or trim to 3 requests.

### Auth Flows + Edit Crawl (completed 2026-06-11)

| Item | What changed |
|---|---|
| `/forgot-password` led to a blank page | Route didn't exist. New `ForgotPassword.tsx` page using Firebase `sendPasswordResetEmail` (already in AuthContext); doesn't reveal whether an account exists. Verified: reset email sent for test account |
| No 404 handling | Catch-all route added — unknown URLs redirect to the landing page |
| Signup untested | Verified end-to-end (account created, lands on /home). Found+fixed: greeting showed raw email after signup because `onAuthStateChanged` fires before the displayName profile update — now synced manually in `AuthContext.signup` |
| Greeting fallback | Falls back to email username (before the `@`), never the full email |
| Google OAuth untested | Verified the popup opens with correct client id, `select_account` prompt, and Firebase auth handler. (Full login can't be automated — needs a manual once-over) |
| Edit crawl duplicated on re-save | `SaveCrawlModal` now takes `existingCrawl`; loading a saved crawl prefills the form and the button becomes "Update Crawl" → `updateCrawl()` instead of `addDoc`. Verified: still one crawl after update |
| Duration mismatch (4.7) | Save modal stat now uses the same stored formula (`30 min/bar + walk @3mph`) and labels it "(walk + hangs)" — matches the saved-card display exactly |

Note: QA account `barhop.qa.20260611@gmail.com` (throwaway, password not stored here) was created in Firebase during signup testing — delete from Firebase Console → Authentication if unwanted.

### Popup + Route Optimization Fixes (completed 2026-06-11)

| Item | What changed |
|---|---|
| Popup teleported from top-left | The entrance animation animated `transform` on the popup root, which Mapbox positions via an inline transform — the animation overrode it for 180ms. Animation moved to the inner card; root never animates transform (comment in `components.css` warns against regressing this) |
| Popup hid behind radius control | Map controls overlay is z-index 20; popup now z-index 25 (below the search dropdown at 30) |
| Optimize ignored start/end | `optimizeBarOrder` now takes start AND end: nearest-neighbor seed + 2-opt refinement over the full start→bars→end path. "Optimize Route" button uses the actual route anchors (`startCoordinates`/`endCoordinates`) instead of raw user position |

### Optimizer Verification + Route Direction (completed 2026-06-11)

| Item | What changed |
|---|---|
| 2-opt could land 12% over optimum | Verified against brute force (200 random instances): plain 2-opt missed the optimum in 30/200, worst +12%. Now: **exact branch-and-bound for ≤8 stops** (guaranteed shortest, instant at crawl sizes) and NN + 2-opt + single-stop relocation for larger routes. Re-verified: 200/200 exact for ≤8, 30/30 exact at n=9 |
| End-awareness verified live | Start north/end south reversed the stop order vs start south/end north (Barley's→Ringside→Club 185→Cobra and vice versa) — confirmed in browser with real geocoded addresses |
| Route had no visible direction | White chevrons along the line (`symbol-placement: line`, auto-rotated to travel direction). Combined with the existing color language: **cyan = start, magenta = end** — the line gradient and the start (cyan/play) and end (magenta/flag) pins all match |
| Test artifact | Verification script at `%TEMP%\claude\optimize_test.mjs` (brute-force comparison) — worth porting into a real test suite when one exists |
| Optimize silently discarded user's order | Optimize now toasts "Stops reordered for the shortest walk"; a "↩ Restore my order" button appears whenever the current order differs from the user's original pick and puts it back with one click. Sidebar now passes bars in **click order** (Set insertion order) instead of list order so "my order" means what the user actually chose. Works for fresh routes (incl. the auto-optimize on page load) and loaded crawls |

---

## 1. Map Iconography & Visual Identity (the "not premium" feeling)

This is the biggest gap between current state and a product people would want to use.

### 1.1 Bar pins read as blobs, not pins
- The marker is a neon cocktail-glass SVG rendered at ~0.35–0.7 scale. At normal zoom it's an indistinct purple-cyan smudge — you can't tell it's a cocktail glass until you zoom way in.
- The SVG leans on `feDropShadow` filters for glow; rasterized small, the glow eats the silhouette.
- **Fix direction:** redesign the marker with a strong, simple silhouette first (classic pin or filled circle with glass glyph), glow as accent only. Test legibility at the actual rendered size (~20–40px), not at 56×70.

### 1.2 Selection/hover states are noisy circles, not states
- Hover = big cyan blurred circle, selected = bigger yellow blurred circle, non-selected = faint cyan halo on *every* pin. Three overlapping glow layers make the map look smeared, and the yellow selection circle hides the pin itself.
- There's no numbered ordering on selected pins — on the Home map you can't tell which bar is stop 1 vs stop 3.
- **Fix direction:** one visual change per state. Selected pin: swap to a filled/accent variant of the icon with a number badge. Hover: slight scale-up + tooltip. Kill the ambient halo on all non-selected pins entirely.

### 1.3 Route page map is visually chaotic
- Loaded route shows: neon pins + selection circles + route line + START marker + glow layers, all in saturated cyan/magenta/yellow on a dark map. Stops aren't numbered on the map; the route line styling fights with the highlights.
- **Fix direction:** on the Route page, replace generic pins with numbered stop markers (1, 2, 3…), distinct start/end markers, single restrained route line (one color + subtle casing), no hover halos.

### 1.4 Radius circle and draw tools
- The radius circle is fine, but the Mapbox Draw polygon/trash buttons (top-left) are default unstyled white widgets that clash with the dark neon theme — and the polygon tool doesn't even do anything yet (see 3.1).

---

## 2. Choppiness & Performance

Observed and code-level suspects for why the app feels janky rather than smooth.

### 2.1 Console logging on every render and interaction
- `MapContainer` logs its full props on **every render** (`🗺️ MapContainer received props`), and there are 40+ emoji logs through the search/cache path. Logging objects this large is real overhead and makes dev tools unusable.
- **Fix:** strip or gate all `console.log` behind a `DEBUG` flag. Quick win.

### 2.2 Popup churn on hover
- Hovering pins creates/destroys a Mapbox popup with a 300ms class-based fade plus `setTimeout` chains (30ms hover debounce + 300ms removal). Moving across several pins quickly creates overlapping create/remove cycles — visible popup flicker.
- **Fix:** single persistent popup instance, just `setLngLat` + `setHTML` on hover change; remove on leave.

### 2.3 Feature-state loop on every hover/selection change
- Effect #5 runs `setFeatureState` for **all 75 bars** on every hover change (hover state mutates per mouse move). The 3 highlight GeoJSON sources also get fully re-set each time.
- **Fix:** only update the bars whose state changed (previous hover, new hover, toggled selection).

### 2.4 Full-page loading gate before the map appears
- `Home.tsx` blocks the entire page behind `LoadingSpinner` until bars + map are ready, so first paint is a spinner → sudden full UI pop-in. Feels slow even when fast.
- **Fix:** render the layout shell (sidebar skeleton + map container) immediately; let the map fade/tiles load in place. Skeleton list items for bars.

### 2.5 Background city pre-caching on startup
- On first load the app immediately fetches and caches bars for New York, LA, and Chicago in the background (visible in logs). That's 3 extra Mapbox + Firestore round-trip chains competing with the visible page load.
- **Fix:** defer popular-city caching until idle (`requestIdleCallback`) or drop it.

### 2.6 `flyTo` fires on every center change
- Effect #2 calls `flyTo` whenever `center` changes, including the initial mount (a no-op animation to where it already is) and cache-driven re-fetches. Can cause the "map twitch" on load.

### 2.7 Three.js / particle backgrounds (Landing)
- Vanta/Three/TSParticles backgrounds on the Landing page are heavy on low-end machines. Acceptable if Landing-only — verify none of them stay mounted after navigating into the app.

---

## 3. Incomplete Features

### 3.1 Polygon draw filter does nothing — `Home.tsx` ~line 570
- The polygon tool is right there on the map, users will draw a shape, and nothing happens (`TODO: Implement filtering bars within drawn polygon`). Either implement it (Turf `booleanPointInPolygon` over `bars`) or remove the control until it works. **Shipping a visible dead control is worse than not having it.**

### 3.2 Cache cleanup never runs
- `useCacheManager` defines expired-cache cleanup but nothing calls it. Firestore cache grows forever.

### 3.3 "Popularity" sort unverified
- Sidebar has Distance/Popularity sort buttons; Popularity path hasn't been tested. Verify it actually re-sorts.

### 3.4 Search bar filter ("🔍 Search bars...") unverified
- The sidebar text filter hasn't been tested against the list.

---

## 4. UX Rough Edges

### 4.1 `alert()` for "Link copied to clipboard!"
- A native browser alert in the middle of a styled neon app is the single most jarring polish break. Replace with a small toast (the app has no toast system — worth adding one; it'll get reused for save success/errors).

### 4.2 Duplicate bars in results
- "Donerick's Pub" appears 4 times, "Old Bag of Nails Pub" twice. Mapbox returns nearby franchises/duplicate POIs; there's no dedupe.
- **Fix:** dedupe by name + proximity (e.g., same name within 150m → keep nearest/highest-rated).

### 4.3 Questionable POI quality
- Results include non-bars: "Johnstown Skate N Swim", "The Shoppes at Henderson Plaza", "Mysite 10", "GMP Hall", "Fans In Motion", "Morgan Grange". Looks like the POI category query is too broad.
- **Fix:** tighten the Mapbox category filter and/or post-filter obvious non-venues; cap displayed results to within ~2× radius (a "37.9 mi away" entry in a 1 mi search is noise).

### 4.4 Oversized location-permission modal
- The "Enable Location Access" dialog fills the entire viewport height with content visibly cut off at the bottom. Should be a compact centered card.

### 4.5 Ratings are fake-precise
- Ratings like "4.4" display with no source (Mapbox POIs don't include ratings — these appear generated). Either pull real ratings or stop implying review data; the "LEGENDARY/EPIC vibe" popup framing is fun and can stay, but a fabricated star number erodes trust.

### 4.6 Start/end address auto-fill is misleading
- The route page silently reverse-geocodes the map center into a specific street address ("3200 S High St Suites 2800…") as if the user chose it. Better: placeholder "Using map center — tap to change" or a clearer "Set start point" empty state.

### 4.7 Estimated duration math is inconsistent
- Save modal says "~2 hours", saved card says "1h 42m", route page says "~14 min" for the same crawl. Three different formulas (walk time vs walk+dwell). Pick one definition (walking time + ~30 min/bar dwell) and use it everywhere with a label ("walk + hang time").

### 4.8 Sidebar checkbox hit-target
- The styled checkbox itself isn't clickable in automation (likely visually-hidden input without proper label association) — works via card click, but indicates an a11y problem: keyboard and screen-reader users can't toggle bars. Make the whole card a `button`/labelled checkbox.

### 4.9 Typos and naming drift
- User-facing: greeting shows raw username ("Yasssh"); app is "BarHop" in navbar, "Bar Crawl" in tutorial, "BarHop - Plan Your Perfect Night Out" in title. Pick one name.
- Code: `AppBat` type (should be `AppBar`), was "crawlfamap" in loading copy (fixed).

### 4.10 Tutorial content is stale
- Tutorial step 1 says "Click the search bar at the top to enter your city" — the search is top-center of the map, and step 3 says "Click on bars" while the primary flow is sidebar checkboxes. Rewrite to match actual UI.

---

## 5. Code Health (doesn't block users, blocks contributors)

- **No tests.** Zero unit/integration tests; every regression so far was found by hand.
- `Home.tsx` is ~650 lines mixing data fetching, caching, geolocation, and UI state. Extract a `useBars` hook.
- Error handling: many `fetch` calls have `catch` → `console.error` only — no user-visible error states (e.g., Directions API failure leaves the spinner state silently).
- Duplicate distance/Haversine implementations in at least 3 files (`Home.tsx`, `Route.tsx`, `SavedCrawls.tsx` area). Centralize in `utils/geo.ts`.
- README claims TailwindCSS and React 18; project uses plain CSS and React 19. Update README.
- `.env` is gitignored (good) but there's no `.env.example` — add one so setup isn't guesswork.
- Firestore security rules unverified — `barCrawls` collection reads in the share flow must be readable by non-owners for `isPublic` crawls, otherwise shared links only work for the owner. **Needs verification.**

---

## 6. Untested Areas

| Area | Risk |
|---|---|
| Mobile / small screens | High — sidebar+map layout almost certainly breaks at 375px |
| Google OAuth sign-in | Medium — button exists, flow untested |
| Sign-up + forgot-password flows | Medium — `/forgot-password` link exists; page may not |
| Drag-to-reorder stops | Medium — implemented, not yet exercised |
| Optimize Route button | Low — code path looks sound |
| Theme toggle (light/party) | Low — party mode perf unknown |
| Edit crawl (pencil icon) | It just calls Load Crawl — there's no real "edit existing" (saving again creates a duplicate) |

---

## 7. Suggested Order of Attack

1. **Map visual overhaul** (sections 1.1–1.3) — pin redesign, state design, numbered route stops. Biggest perceived-quality jump.
2. **Choppiness pass** (2.1–2.4) — strip logging, fix popup churn, incremental feature-state, skeleton loading. App feels fast.
3. **Result quality** (4.2, 4.3) — dedupe + category tightening. Data feels trustworthy.
4. **Toast system + alert removal** (4.1), compact permission modal (4.4).
5. **Polygon filter** (3.1) — implement or hide.
6. **Mobile audit** (section 6).
7. **Copy/naming/duration consistency** (4.7, 4.9, 4.10).
8. **Code health** (section 5) as ongoing hygiene with each touched file.
