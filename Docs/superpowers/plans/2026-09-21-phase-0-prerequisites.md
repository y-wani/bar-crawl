# Phase 0: Guest Mode Prerequisites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make it safe to open `/home` to guests — a test harness, a bar cache that actually covers where visitors are and does not expire daily, and the two cost controls that bound Places spend.

**Architecture:** Four independent pieces. A Vitest harness (this repo has none). A `seeded` flag on cache documents with a 30-day validity so seed data survives. A one-off Node seeding script following the existing `scripts/demo-*.mjs` pattern. App Check enforcement plus a billing alarm.

**Tech Stack:** Vitest + jsdom, Node 22 ESM scripts, Firestore REST via service account, Google Places API v1, Firebase App Check.

**Spec:** `Docs/superpowers/specs/2026-09-21-guest-mode-design.md` (§7.3, §8)

## Global Constraints

- **Nothing in Phase 1 may start until this phase is complete.** Guest mode without cache coverage shows empty maps; without caps and App Check it bills per visitor.
- Seed geography is **US + UK + Canada only** — top ~25 US metros, ~6 UK cities, Toronto and Vancouver. Germany/France deferred (spec §14.3).
- Anonymous Places caps, set in Phase 1: **5/min, 15/day** per uid; **500/UTC day** global. Real accounts stay 10/min, 80/day.
- The seeding script spends real money. It runs deliberately, never automatically on a developer's machine.
- Existing cache behaviour for user-driven searches must not change: 24h expiry stays for unseeded areas.

## Spec Amendment Discovered During Planning

`barCacheService.ts:40` sets `CACHE_EXPIRY_HOURS = 24`. Spec §8 assumed a one-off seed would persist; it would go stale within a day and every guest would fall through to a billed Places call — the exact cost this design avoids.

**Resolution:** seeded areas are marked `seeded: true` and validated against a 30-day window; user-driven cache keeps 24h. Bar listings do not change meaningfully day to day, so 30 days is safe and cuts recurring seed cost by ~30×. Task 2 implements this.

---

### Task 1: Vitest harness

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Create: `src/utils/__tests__/smoke.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `npm test` runs Vitest; `describe`/`it`/`expect` available globally; `jsdom` provides `localStorage` for later tasks

- [ ] **Step 1: Install Vitest and jsdom**

```bash
npm install -D vitest@^2 jsdom@^25
```

- [ ] **Step 2: Add the test script**

In `package.json`, add to `"scripts"`:

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 3: Configure Vitest in vite.config.ts**

Add as the first line of `vite.config.ts`:

```ts
/// <reference types="vitest" />
```

Then add a `test` key to the `defineConfig` object, as a sibling of `build`:

```ts
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'api/**/*.test.ts'],
  },
```

- [ ] **Step 4: Write a smoke test that fails**

Create `src/utils/__tests__/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('test harness', () => {
  it('runs and has localStorage from jsdom', () => {
    localStorage.setItem('probe', 'ok');
    expect(localStorage.getItem('probe')).toBe('WRONG');
  });
});
```

- [ ] **Step 5: Run it and confirm it fails for the right reason**

Run: `npm test`
Expected: FAIL — `expected 'ok' to be 'WRONG'`. A failure about `localStorage is not defined` means jsdom is not wired up; fix the config before continuing.

- [ ] **Step 6: Correct the assertion**

Change `'WRONG'` to `'ok'`.

- [ ] **Step 7: Run and confirm it passes**

Run: `npm test`
Expected: `1 passed`

- [ ] **Step 8: Confirm the production build is unaffected**

Run: `npm run build`
Expected: `✓ built in <n>s`

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json vite.config.ts src/utils/__tests__/smoke.test.ts
git commit -m "Add Vitest harness with jsdom environment"
```

---

### Task 2: Seeded cache entries with a 30-day window

**Files:**
- Modify: `src/services/barCacheService.ts:40` (constants), `:56-62` (`isCacheValid`), `:121-146` (`cacheBars`)
- Create: `src/services/__tests__/barCacheService.test.ts`

**Interfaces:**
- Consumes: Vitest from Task 1
- Produces:
  - `isCacheValid(fetchedAt: Timestamp, seeded?: boolean): boolean` — exported for test
  - `cacheBars(centerLat, centerLng, bars, location?, radius?, seeded?: boolean): Promise<void>` — new trailing `seeded` param, defaults `false`
  - `CachedBarArea` gains optional `seeded?: boolean`

- [ ] **Step 1: Write the failing test**

Create `src/services/__tests__/barCacheService.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { isCacheValid } from '../barCacheService';

const hoursAgo = (h: number) =>
  Timestamp.fromDate(new Date(Date.now() - h * 60 * 60 * 1000));

describe('isCacheValid', () => {
  it('accepts unseeded cache under 24h', () => {
    expect(isCacheValid(hoursAgo(23), false)).toBe(true);
  });

  it('rejects unseeded cache over 24h', () => {
    expect(isCacheValid(hoursAgo(25), false)).toBe(false);
  });

  it('accepts seeded cache well past 24h', () => {
    expect(isCacheValid(hoursAgo(24 * 20), true)).toBe(true);
  });

  it('rejects seeded cache past 30 days', () => {
    expect(isCacheValid(hoursAgo(24 * 31), true)).toBe(false);
  });

  it('defaults to the unseeded window when the flag is absent', () => {
    expect(isCacheValid(hoursAgo(25))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test -- barCacheService`
Expected: FAIL — `isCacheValid is not exported` (it is currently a module-private const)

- [ ] **Step 3: Implement the change**

In `src/services/barCacheService.ts`, replace the expiry constant:

```ts
const CACHE_EXPIRY_HOURS = 24; // Cache expires after 24 hours
```

with:

```ts
// User-driven searches expire daily. Seeded metro areas last far longer: bar
// listings don't change day to day, and re-seeding 33 metros nightly would
// reintroduce the per-visitor Places cost that seeding exists to remove.
const CACHE_EXPIRY_HOURS = 24;
const SEEDED_CACHE_EXPIRY_HOURS = 24 * 30;
```

Replace `isCacheValid` and export it:

```ts
export const isCacheValid = (fetchedAt: Timestamp, seeded = false): boolean => {
  const hoursDiff =
    (Date.now() - fetchedAt.toDate().getTime()) / (1000 * 60 * 60);
  return hoursDiff < (seeded ? SEEDED_CACHE_EXPIRY_HOURS : CACHE_EXPIRY_HOURS);
};
```

Add `seeded?: boolean;` to the `CachedBarArea` interface.

Update `cacheBars` to accept and persist the flag:

```ts
export const cacheBars = async (
  centerLat: number,
  centerLng: number,
  bars: AppBat[],
  location: string = "Unknown Location",
  radius: number = 2,
  seeded: boolean = false
): Promise<void> => {
```

and include `seeded` in the `cacheData` object literal.

- [ ] **Step 4: Update every `isCacheValid` call site to pass the flag**

Run: `grep -n "isCacheValid" src/services/barCacheService.ts`

At each call site inside `getCachedBars`, pass the document's own flag:

```ts
isCacheValid(cacheData.fetchedAt, cacheData.seeded === true)
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npm test -- barCacheService`
Expected: `5 passed`

- [ ] **Step 6: Typecheck**

Run: `npx tsc -b`
Expected: `No errors found`

- [ ] **Step 7: Commit**

```bash
git add src/services/barCacheService.ts src/services/__tests__/barCacheService.test.ts
git commit -m "Give seeded cache areas a 30-day window, keep 24h for user searches"
```

---

### Task 3: Metro seed list

**Files:**
- Create: `src/data/seedMetros.ts`
- Modify: `src/hooks/useCacheManager.ts:18-27` (replace `POPULAR_LOCATIONS` with an import)

**Interfaces:**
- Consumes: nothing
- Produces: `export interface SeedMetro { name: string; lat: number; lng: number }` and `export const SEED_METROS: SeedMetro[]` — consumed by Task 4's script and by `useCacheManager`

- [ ] **Step 1: Create the data file**

Create `src/data/seedMetros.ts`:

```ts
// Metros pre-seeded into the bar cache so a guest's first view is never empty.
// Scope is US + UK + Canada, matching observed traffic (US 76%, UK 8%, CA 4%).
// Germany and France are ~1 visitor each at current volume — deferred.
// Consumed by scripts/seed-metro-cache.mjs and useCacheManager.

export interface SeedMetro {
  name: string;
  lat: number;
  lng: number;
}

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
  { name: "Columbus, OH", lat: 39.9612, lng: -83.0007 },
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
```

- [ ] **Step 2: Write a test asserting the list is well formed**

Create `src/data/__tests__/seedMetros.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SEED_METROS } from '../seedMetros';

describe('SEED_METROS', () => {
  it('has no duplicate names', () => {
    const names = SEED_METROS.map((m) => m.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('has plausible coordinates', () => {
    for (const m of SEED_METROS) {
      expect(Math.abs(m.lat), m.name).toBeLessThanOrEqual(90);
      expect(Math.abs(m.lng), m.name).toBeLessThanOrEqual(180);
      expect(m.lat === 0 && m.lng === 0, m.name).toBe(false);
    }
  });

  it('covers all three target countries', () => {
    const names = SEED_METROS.map((m) => m.name).join(' ');
    expect(names).toContain(', UK');
    expect(names).toContain('Toronto');
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `npm test -- seedMetros`
Expected: `3 passed`

- [ ] **Step 4: Point useCacheManager at the shared list**

In `src/hooks/useCacheManager.ts`, delete the local `POPULAR_LOCATIONS` array (lines 18-27) and add at the top of the imports:

```ts
import { SEED_METROS } from '../data/seedMetros';
```

Then replace every `POPULAR_LOCATIONS` reference with `SEED_METROS`.

Run: `grep -n "POPULAR_LOCATIONS" src/hooks/useCacheManager.ts`
Expected: no output.

- [ ] **Step 5: Typecheck**

Run: `npx tsc -b`
Expected: `No errors found`

- [ ] **Step 6: Commit**

```bash
git add src/data/seedMetros.ts src/data/__tests__/seedMetros.test.ts src/hooks/useCacheManager.ts
git commit -m "Add shared metro seed list covering US, UK and Canada"
```

---

### Task 4: Seeding script

**Files:**
- Create: `scripts/seed-metro-cache.mjs`
- Modify: `package.json` (add `seed:metros` script)

**Interfaces:**
- Consumes: `SEED_METROS` from Task 3, `seeded: true` support from Task 2
- Produces: populated `barCacheV5` documents with `seeded: true`

This replaces client-side background caching for seed data. `useCacheManager` currently caches from the browser on app start, spending a signed-in user's Places quota and only covering 3 cities. Seeding is a deliberate, budgeted operation.

- [ ] **Step 1: Create the script**

Create `scripts/seed-metro-cache.mjs`:

```js
// Seeds barCacheV5 with bars for every metro in SEED_METROS.
//
// SPENDS REAL MONEY: one Places nearby-search per metro (~33 calls per run).
// Run deliberately, not on a schedule and not from CI.
//
//   node --env-file=.env scripts/seed-metro-cache.mjs --dry-run
//   node --env-file=.env scripts/seed-metro-cache.mjs
//
// Seeded docs carry seeded:true and are honoured for 30 days
// (SEEDED_CACHE_EXPIRY_HOURS in barCacheService.ts).

import { SignJWT, importPKCS8 } from 'jose';
import { readFileSync } from 'node:fs';

const PROJECT_ID = 'bar-crawl-planner-5985f';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const COLLECTION = 'barCacheV5';
const RADIUS_MILES = 2;
const RADIUS_METERS = RADIUS_MILES * 1609.34;

const DRY_RUN = process.argv.includes('--dry-run');

// Parse the metro list straight out of the TS source — one source of truth,
// no build step, no duplicated coordinates.
const parseMetros = () => {
  const src = readFileSync(new URL('../src/data/seedMetros.ts', import.meta.url), 'utf8');
  const out = [];
  const re = /\{\s*name:\s*"([^"]+)",\s*lat:\s*(-?[\d.]+),\s*lng:\s*(-?[\d.]+)\s*\}/g;
  let m;
  while ((m = re.exec(src))) out.push({ name: m[1], lat: +m[2], lng: +m[3] });
  return out;
};

const getAccessToken = async () => {
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  const key = await importPKCS8(sa.private_key.replace(/\\n/g, '\n'), 'RS256');
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/datastore' })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(sa.client_email).setSubject(sa.client_email)
    .setAudience(TOKEN_URL).setIssuedAt(now).setExpirationTime(now + 3600)
    .sign(key);
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!r.ok) throw new Error(`token ${r.status}: ${await r.text()}`);
  return (await r.json()).access_token;
};

const fetchBars = async (metro) => {
  const r = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.location,places.rating,places.userRatingCount,places.priceLevel,places.formattedAddress',
    },
    body: JSON.stringify({
      includedTypes: ['bar'],
      maxResultCount: 20,
      locationRestriction: {
        circle: {
          center: { latitude: metro.lat, longitude: metro.lng },
          radius: RADIUS_METERS,
        },
      },
    }),
  });
  if (!r.ok) throw new Error(`places ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).places ?? [];
};

// Firestore REST needs explicitly typed values.
const val = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(val) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, val(x)])) } };
};

const toAppBar = (p) => ({
  id: p.id,
  name: p.displayName?.text ?? 'Unknown',
  address: p.formattedAddress ?? '',
  rating: p.rating ?? 0,
  userRatingCount: p.userRatingCount ?? 0,
  priceLevel: p.priceLevel ?? '',
  location: { coordinates: [p.location.longitude, p.location.latitude] },
});

const main = async () => {
  const metros = parseMetros();
  console.log(`${metros.length} metros${DRY_RUN ? ' (DRY RUN — no Places calls, no writes)' : ''}`);
  if (DRY_RUN) {
    metros.forEach((m) => console.log(`  would seed ${m.name} (${m.lat}, ${m.lng})`));
    console.log(`\nWould make ${metros.length} Places calls.`);
    return;
  }

  const token = await getAccessToken();
  const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  let ok = 0, failed = 0;

  for (const metro of metros) {
    try {
      const places = await fetchBars(metro);
      const bars = places.map(toAppBar);
      if (!bars.length) { console.log(`  ⚠ ${metro.name}: 0 bars, skipping`); failed++; continue; }

      const fields = {
        centerLat: val(metro.lat),
        centerLng: val(metro.lng),
        radius: val(RADIUS_MILES),
        location: val(metro.name),
        seeded: val(true),
        bars: val(bars),
        fetchedAt: { timestampValue: new Date().toISOString() },
      };
      const r = await fetch(`${FS_BASE}/${COLLECTION}`, {
        method: 'POST', headers: H, body: JSON.stringify({ fields }),
      });
      if (!r.ok) throw new Error(`firestore ${r.status}: ${(await r.text()).slice(0, 200)}`);
      console.log(`  ✓ ${metro.name}: ${bars.length} bars`);
      ok++;
    } catch (err) {
      console.error(`  ✗ ${metro.name}: ${err.message}`);
      failed++;
    }
  }
  console.log(`\nSeeded ${ok}, failed ${failed}, ${metros.length} Places calls made.`);
};

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Add the npm script**

In `package.json` `"scripts"`:

```json
    "seed:metros": "node --env-file=.env scripts/seed-metro-cache.mjs"
```

- [ ] **Step 3: Dry run — confirms parsing without spending anything**

Run: `npm run seed:metros -- --dry-run`
Expected: lists 33 metros and `Would make 33 Places calls.` If it lists 0, the regex in `parseMetros` does not match Task 3's formatting — fix before continuing.

- [ ] **Step 4: Seed for real**

Run: `npm run seed:metros`
Expected: `✓` per metro with a non-zero bar count, ending `Seeded 33, failed 0`.

- [ ] **Step 5: Verify the documents landed with the seeded flag**

Run:
```bash
node --env-file=.env -e "
import('jose').then(async ({SignJWT,importPKCS8})=>{
const sa=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const key=await importPKCS8(sa.private_key.replace(/\\\\n/g,'\n'),'RS256');
const now=Math.floor(Date.now()/1000);
const a=await new SignJWT({scope:'https://www.googleapis.com/auth/datastore'}).setProtectedHeader({alg:'RS256'}).setIssuer(sa.client_email).setSubject(sa.client_email).setAudience('https://oauth2.googleapis.com/token').setIssuedAt(now).setExpirationTime(now+3600).sign(key);
const t=await (await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:a})})).json();
const r=await fetch('https://firestore.googleapis.com/v1/projects/bar-crawl-planner-5985f/databases/(default)/documents:runAggregationQuery',{method:'POST',headers:{Authorization:'Bearer '+t.access_token,'Content-Type':'application/json'},body:JSON.stringify({structuredAggregationQuery:{structuredQuery:{from:[{collectionId:'barCacheV5'}],where:{fieldFilter:{field:{fieldPath:'seeded'},op:'EQUAL',value:{booleanValue:true}}}},aggregations:[{count:{},alias:'c'}]}})});
console.log('seeded docs:',(await r.json())[0].result.aggregateFields.c.integerValue);});
"
```
Expected: `seeded docs: 33`

- [ ] **Step 6: Commit**

```bash
git add scripts/seed-metro-cache.mjs package.json
git commit -m "Add deliberate metro cache seeding script"
```

---

### Task 5: App Check enforcement and billing alarm

**Files:**
- Modify: Vercel project environment variables (no repo file)
- Modify: `Docs/superpowers/specs/2026-09-21-guest-mode-design.md` (tick §7.3)

**Interfaces:**
- Consumes: nothing
- Produces: `APPCHECK_ENFORCE=true` in production; a billing alert on the Places API

These are console operations, not code. The App Check verification path already exists in `api/proxy.ts` (`verifyAppCheckToken`, gated on `APPCHECK_ENFORCE`); it is dormant, not missing.

- [ ] **Step 1: Confirm `VITE_APPCHECK_SITE_KEY` is set in Vercel**

The client code is already in place: `src/firebase/config.ts:36-40` calls
`initializeAppCheck` with a `ReCaptchaV3Provider`, and `apiClient.ts` imports
the resulting handle. **But it is guarded by `if (appCheckSiteKey)`** — with no
`VITE_APPCHECK_SITE_KEY`, `appCheck` stays `undefined` and the browser sends no
App Check token. That key is *not* in the local `.env`.

Vercel → project → Settings → Environment Variables. Confirm
`VITE_APPCHECK_SITE_KEY` exists for both Preview and Production.

**If it is missing, stop.** Enabling `APPCHECK_ENFORCE=true` against a client
that sends no token will 401 every request — for existing signed-in users too,
not just guests. Registering a reCAPTCHA v3 site key in the Firebase console
and adding it to Vercel becomes a prerequisite task of its own.

- [ ] **Step 2: Enable enforcement on Preview first**

Vercel → project → Settings → Environment Variables → add `APPCHECK_ENFORCE=true` scoped to **Preview only**. Redeploy the preview.

- [ ] **Step 3: Verify the preview still works end to end**

In a browser signed into Vercel, open the preview `/home`, confirm bars still load. Check the Network tab for 401s from `/api/proxy`.
Expected: bars load, no 401s. A 401 means App Check tokens are not reaching the proxy — resolve before touching production.

- [ ] **Step 4: Enable enforcement on Production**

Add `APPCHECK_ENFORCE=true` scoped to **Production**. Redeploy.

- [ ] **Step 5: Verify production**

Open `https://www.gobarhop.app/home`, confirm bars load with no 401s.

- [ ] **Step 6: Set the billing alarm**

Google Cloud Console → Billing → Budgets & alerts → create a budget scoped to the Places API with alert thresholds at 50% / 90% / 100% of a monthly cap you are willing to lose. Set the cap now, before guests can spend it.

- [ ] **Step 7: Record completion in the spec**

In §7.3 of the spec, mark both prerequisites done with today's date.

- [ ] **Step 8: Commit**

```bash
git add Docs/superpowers/specs/2026-09-21-guest-mode-design.md
git commit -m "Record App Check enforcement and billing alarm as complete"
```

---

## Phase Exit Criteria

All must hold before Phase 1 begins:

- [ ] `npm test` passes
- [ ] `barCacheV5` contains 33 documents with `seeded: true`
- [ ] A cold `/home` load in a seeded metro produces **zero** `/api/proxy` bar-search calls
- [ ] `APPCHECK_ENFORCE=true` in production with no 401 regressions
- [ ] A billing alert exists on the Places API

## Notes

Task 5 Step 1 is a genuine stop-the-line check. The proxy's App Check verification exists, but nothing confirms the *client* obtains tokens. If it does not, enforcement breaks every request — including for existing signed-in users. Verify before enabling, on Preview before Production.
