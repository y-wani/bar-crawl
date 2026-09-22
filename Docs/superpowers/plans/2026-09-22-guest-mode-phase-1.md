# Phase 1: Guest Mode Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A first-time visitor can search bars, select them, optimise a route and see that route without creating an account — and the crawl they built survives signup under the same uid.

**Architecture:** An anonymous Firebase user is minted on `/home` so the billed proxy still gets a token and per-uid limits still bind. `/home` and `/route` open up; save, live, plan and saved-crawls stay gated. The crawl lives in `localStorage` (primary) and a `guestCrawls/{uid}` doc (iOS ITP durability). Signup upgrades the anonymous account in place with `linkWithCredential`/`linkWithPopup`, with an explicit fallback when the email already exists. The proxy learns to tell an anonymous caller from a real one and caps it harder.

**Tech Stack:** React 19 + TypeScript + Vite 7, Firebase Auth (anonymous + link), Firestore (client SDK + REST from the proxy), Vercel serverless (`api/proxy.ts`), Vitest 5 + jsdom.

**Spec:** `Docs/superpowers/specs/2026-09-21-guest-mode-design.md` (§4.2, §5, §6, §7, and §9 — see "Scope amendment")

## Global Constraints

- **Phase 0 is complete.** Metro seeding ran (33 seeded docs, verified), App Check enforcement is live in Production (verified 2026-09-22: `POST /api/proxy` with no token returns `401 {"error":"Missing App Check token"}`), and GCP billing alerts are configured. Both spec §7.3 prerequisites are satisfied.
- **`api/proxy.ts` must stay self-contained.** Its only runtime import is `jose`. Vercel's ESM tracer does not bundle local modules under `api/` or `lib/` — an import of a shared local file resolves to "Cannot find module" at runtime. Add logic inline; never extract a helper file.
- Anonymous Places caps, verbatim from spec §7.1/§7.2: **5/min, 15/day** per anonymous uid for nearby search; real accounts stay **10/min, 80/day**. Global anonymous ceiling **500 per UTC day**.
- **No TTL on the guest's own crawl** (spec §6.1). Expiring a visitor's work to pressure signup is explicitly rejected. The 30-day expiry applies only to the server-side durability doc.
- Save-prompt copy, verbatim from spec §6.2: **"This crawl is only on this device — save it so it's there on the night."**
- Vitest must stay **v5+**. v2 bundles its own Vite 5 and conflicts with this project's Vite 7.
- Anonymous users must never be counted as accounts. Any user-facing count, dashboard or audit query excludes `isAnonymous` (spec §5).
- The cache proximity rule is **duplicated on purpose** in `src/services/barCacheService.ts` (client) and `api/proxy.ts` `readBarCache` (server). Any change to one must be made to the other in the same commit.
- Run `npm run build` (`tsc -b && vite build`) and `npm test` before every commit. The app build compiles `src` only; `api/` is typechecked separately via `api/tsconfig.json`.

## Scope Amendment Discovered During Planning

**Spec §9 (email verification) must land inside Phase 1, not after it.** The spec's phase table (§12a) assigns §9 to no phase, but `ProtectedRoute.tsx:41-48` bounces any user with `emailVerified === false` to `/verify-email`. An anonymous user has `emailVerified === false`. The moment guests exist, a guest tapping "Start Crawl" is sent to a verification page for an email address they do not have. The verification gate comes off the app surfaces in Task 11; `/verify-email` itself and password reset are untouched.

## Decision 1 — RESOLVED 2026-09-22 (owner ruling: keep anon read)

`firestore.rules:16` allows **any signed-in user to read every document in `barCrawls`**. That was deliberate: shared `/route?crawlId=` links point at crawls that are not necessarily `isPublic`. Once anonymous users exist, "any signed-in user" includes any visitor who loads the site.

**Ruling: keep it.** A guest must be able to open a shared crawl link — that is the virality path guest mode exists to feed, and locking it out would block the exact visitor the link was sent to. Exposure is bounded by App Check enforcement (live in Production since 2026-09-22), which requires a real browser to mint a uid, and signing up was already free to anyone. `firestore.rules` needs **no change** for `barCrawls` in this phase; Task 9 only adds the `guestCrawls` block.

Rejected: restricting reads with `request.auth.token.firebase.sign_in_provider != 'anonymous'`.

## Decision 2 — RESOLVED 2026-09-22 (owner approved: snap-to-seed)

Measured in production on 2026-09-22: a London search centred at `51.497, -0.322` missed `seed-london-uk` (centre `51.5072, -0.1276`) by **8.4 miles** and billed a fresh Places call, writing a new cache doc. A second missed by 10.9 miles. `SEARCH_RADIUS_MILES = 2` (`barCacheService.ts:45`) and `CACHE_RADIUS_MILES = 2` (`api/proxy.ts:480`) are in sync, so this is a design limit, not a bug: **each seeded metro is a 2-mile disc, not metro coverage.**

Today that costs one billed call per off-centre user search. Under guest mode it would cost one **on page load, per visitor** — the exact cost seeding was run to remove.

**Ruling: snap the coarse IP-geo centre to the nearest seed metro within ~15 miles.** Zero extra spend. A first-time visitor in Isleworth opens on central-London bars, which for a first view is better than their suburb, and their first real search bills normally. Only the IP-geo branch is snapped — a visitor who granted precise location is never moved off their own coordinates. Task 5 implements it.

Rejected alternatives, recorded so they are not relitigated: seeding a ring of points per large metro (real coverage, but another deliberate Places spend), and raising the match radius to ~5 miles (cheapest to write, but bars would be served from up to 5 miles away and distance sorting becomes misleading).

---

### Task 1: Proxy learns who the caller is

The proxy returns only `payload.sub` from a verified ID token, so it cannot distinguish an anonymous caller from a real account. Every cost control in this phase depends on that distinction.

**Files:**
- Modify: `api/proxy.ts:58-64` (`verifyIdToken`), `api/proxy.ts:231-245` (`verifyAuth`), `api/proxy.ts:770-772` (handler)
- Modify: `api/tsconfig.json`
- Create: `api/__tests__/proxy.identity.test.ts`
- Create: `.vercelignore`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `export interface CallerIdentity { uid: string; isAnonymous: boolean }`
  - `export const isAnonymousProvider: (payload: Record<string, unknown>) => boolean`
  - `verifyIdToken(token: string): Promise<CallerIdentity>`
  - `verifyAuth(req, res): Promise<CallerIdentity | null>`

- [ ] **Step 1: Stop Vercel deploying test files as serverless functions**

Vercel treats **every** file under `/api` as a function entrypoint, so `api/__tests__/foo.test.ts` would be deployed as an endpoint. Create `.vercelignore` at the repo root:

```
api/**/*.test.ts
api/__tests__
```

Add an exclude to `api/tsconfig.json` so `tsc` there does not typecheck test files using Vitest globals it has no types for:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["node"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "resolveJsonModule": true
  },
  "include": ["**/*.ts"],
  "exclude": ["__tests__"]
}
```

`vite.config.ts` already lists `api/**/*.test.ts` in `test.include`, so no change is needed there. (Verified during planning: `api/proxy.ts` imports cleanly under Vitest — its module-level `createRemoteJWKSet` calls make no network request at construction time, and service-account loading is lazy.)

- [ ] **Step 2: Write the failing test**

Create `api/__tests__/proxy.identity.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isAnonymousProvider } from "../proxy";

describe("isAnonymousProvider", () => {
  it("is true for an anonymous sign-in", () => {
    expect(
      isAnonymousProvider({ firebase: { sign_in_provider: "anonymous" } })
    ).toBe(true);
  });

  it("is false for a password account", () => {
    expect(
      isAnonymousProvider({ firebase: { sign_in_provider: "password" } })
    ).toBe(false);
  });

  it("is false for a Google account", () => {
    expect(
      isAnonymousProvider({ firebase: { sign_in_provider: "google.com" } })
    ).toBe(false);
  });

  it("treats a missing claim as a real account", () => {
    expect(isAnonymousProvider({})).toBe(false);
    expect(isAnonymousProvider({ firebase: {} })).toBe(false);
  });
});
```

The missing-claim case resolves to "not anonymous" on purpose: a token that already passed JWKS verification but has an odd shape is far more likely to be a legitimate session than an attacker, and guessing "anonymous" would throttle a real user down to 15 searches a day.

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run api/__tests__/proxy.identity.test.ts`
Expected: FAIL — `isAnonymousProvider` is not exported by `../proxy`.

- [ ] **Step 4: Implement the identity helper**

In `api/proxy.ts`, replace `verifyIdToken` (lines 58-64) with:

```ts
export interface CallerIdentity {
  uid: string;
  isAnonymous: boolean;
}

// Firebase puts the sign-in method in a `firebase.sign_in_provider` claim.
// Anything other than the literal "anonymous" is treated as a real account:
// a verified token with an odd shape is far more likely to be a legitimate
// session than an attacker, and guessing wrong throttles a paying user.
export const isAnonymousProvider = (payload: Record<string, unknown>): boolean => {
  const firebase = payload.firebase as { sign_in_provider?: unknown } | undefined;
  return firebase?.sign_in_provider === "anonymous";
};

const verifyIdToken = async (token: string): Promise<CallerIdentity> => {
  const { payload } = await jwtVerify(token, idTokenJwks, {
    issuer: `https://securetoken.google.com/${PROJECT_ID}`,
    audience: PROJECT_ID,
  });
  if (!payload.sub) throw new Error("ID token missing subject");
  return {
    uid: payload.sub,
    isAnonymous: isAnonymousProvider(payload as Record<string, unknown>),
  };
};
```

- [ ] **Step 5: Thread the identity through `verifyAuth`**

In `api/proxy.ts`, change `verifyAuth` (lines 231-245):

```ts
const verifyAuth = async (
  req: VercelRequest,
  res: VercelResponse
): Promise<CallerIdentity | null> => {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer (.+)$/i);
  if (!match) {
    res.status(401).json({ error: "Missing auth token" });
    return null;
  }
  try {
    return await verifyIdToken(match[1]);
  } catch {
    res.status(401).json({ error: "Invalid or expired auth token" });
    return null;
  }
};
```

- [ ] **Step 6: Update the handler to unpack it**

In `api/proxy.ts`, replace lines 771-772:

```ts
  const caller = await verifyAuth(req, res);
  if (!caller) return;
  const { uid, isAnonymous } = caller;
```

Every existing `enforceRateLimit(uid, …)` call site keeps working unchanged — `uid` is still a string in scope. If the api typecheck flags `isAnonymous` as unused before Task 2 lands, use `caller.isAnonymous` inline at the Task 2 call sites instead of destructuring.

- [ ] **Step 7: Run the tests and the typecheck**

Run: `npx vitest run api/__tests__/proxy.identity.test.ts` → PASS (4 tests)
Run: `npx tsc -p api/tsconfig.json --noEmit` → no errors
Run: `npm test` → all existing suites pass

- [ ] **Step 8: Commit**

```bash
git add api/proxy.ts api/tsconfig.json api/__tests__/proxy.identity.test.ts .vercelignore
git commit -m "Teach the proxy to distinguish anonymous callers from real accounts"
```

---

### Task 2: Anonymous caps and the global ceiling

Two independent controls: a per-uid cap 5× tighter for guests, and a global daily ceiling on anonymous *billed* calls so a front-page post cannot drain the budget. Real accounts are untouched by both — a spike degrades the guest experience, never the experience of someone who already committed.

**Files:**
- Modify: `api/proxy.ts` (limits table, `nearby`, `text`, `clean`, `sendVerificationEmail`)
- Create: `api/__tests__/proxy.limits.test.ts`

**Interfaces:**
- Consumes: `CallerIdentity`, `isAnonymousProvider` (Task 1)
- Produces:
  - `export const ANON_GLOBAL_DAILY_CEILING = 500`
  - `export interface ActionLimits { minute: number; day: number }`
  - `export const limitsFor: (action: "nearby" | "text" | "clean", isAnonymous: boolean) => ActionLimits`
  - Guest-exhaustion response: HTTP 429 `{ error: string, code: "GUEST_QUOTA" }` (consumed by Task 10)

- [ ] **Step 1: Write the failing test**

Create `api/__tests__/proxy.limits.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { limitsFor, ANON_GLOBAL_DAILY_CEILING } from "../proxy";

describe("limitsFor", () => {
  it("leaves real accounts on the existing nearby limits", () => {
    expect(limitsFor("nearby", false)).toEqual({ minute: 10, day: 80 });
  });

  it("caps anonymous nearby search at the spec numbers", () => {
    expect(limitsFor("nearby", true)).toEqual({ minute: 5, day: 15 });
  });

  it("leaves real accounts on the existing text limits", () => {
    expect(limitsFor("text", false)).toEqual({ minute: 60, day: 300 });
  });

  it("caps anonymous text search below a real account", () => {
    expect(limitsFor("text", true).minute).toBeLessThan(limitsFor("text", false).minute);
    expect(limitsFor("text", true).day).toBeLessThan(limitsFor("text", false).day);
  });

  it("leaves real accounts on the existing AI-clean limits", () => {
    expect(limitsFor("clean", false)).toEqual({ minute: 8, day: 40 });
  });

  it("caps anonymous AI cleanup below a real account", () => {
    expect(limitsFor("clean", true).minute).toBeLessThan(limitsFor("clean", false).minute);
    expect(limitsFor("clean", true).day).toBeLessThan(limitsFor("clean", false).day);
  });
});

describe("ANON_GLOBAL_DAILY_CEILING", () => {
  it("is the 500/UTC-day figure from the spec", () => {
    expect(ANON_GLOBAL_DAILY_CEILING).toBe(500);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run api/__tests__/proxy.limits.test.ts`
Expected: FAIL — `limitsFor` is not exported by `../proxy`.

- [ ] **Step 3: Add the limits table and the global ceiling**

In `api/proxy.ts`, immediately after `enforceRateLimit` (after line 287), add:

```ts
// Per-uid limits. Real-account numbers are exactly what shipped before guest
// mode; anonymous numbers come from spec §7.1. The 5x gap on nearby search is
// deliberate — a guest gets a genuine trial, and signing up is a visible
// upgrade rather than a formality.
export interface ActionLimits {
  minute: number;
  day: number;
}
const LIMITS: Record<
  "nearby" | "text" | "clean",
  Record<"real" | "anon", ActionLimits>
> = {
  nearby: { real: { minute: 10, day: 80 }, anon: { minute: 5, day: 15 } },
  // text + clean are spec-silent. Both are reachable by a guest through the
  // bar-list importer and `clean` spends Gemini, so they get roughly the same
  // 4-5x ratio as nearby rather than being left wide open.
  text: { real: { minute: 60, day: 300 }, anon: { minute: 12, day: 60 } },
  clean: { real: { minute: 8, day: 40 }, anon: { minute: 2, day: 8 } },
};
export const limitsFor = (
  action: "nearby" | "text" | "clean",
  isAnonymous: boolean
): ActionLimits => LIMITS[action][isAnonymous ? "anon" : "real"];

// Global ceiling on anonymous BILLED Places calls per UTC day (spec §7.2).
// With cache-on-load a typical engaged guest makes 0-2 live calls, so 500
// covers roughly 250 engaged guests/day — well above the best traffic day on
// record (66 visitors) while bounding worst-case spend.
export const ANON_GLOBAL_DAILY_CEILING = 500;
const ANON_GLOBAL_DOC = "rateLimits/_anonGlobal";

// False when the guest ceiling is spent for the day. Counts only calls about
// to hit Google — a cache hit costs nothing and does not consume the pool.
//
// Fails OPEN, matching enforceRateLimit: a Firestore blip should not take
// guest mode down, and the Cloud quota cap plus the billing alert are the
// hard backstop for spend.
const reserveAnonGlobalCall = async (): Promise<boolean> => {
  try {
    const key = new Date().toISOString().slice(0, 10); // UTC day
    const data = (await fsGet(ANON_GLOBAL_DOC)) ?? {};
    const count =
      data["nearby__day__key"] === key ? Number(data["nearby__day__count"] ?? 0) : 0;
    if (count >= ANON_GLOBAL_DAILY_CEILING) return false;
    await fsPatch(ANON_GLOBAL_DOC, {
      "nearby__day__key": key,
      "nearby__day__count": count + 1,
    });
    return true;
  } catch (err) {
    console.error("anon global cap failed:", err);
    return true;
  }
};
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run api/__tests__/proxy.limits.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Apply the limits at each call site**

In the `nearby` case, replace the hardcoded limits:

```ts
      case "nearby": {
        const nearbyLimits = limitsFor("nearby", isAnonymous);
        const ok = await enforceRateLimit(
          uid,
          "placesNearby",
          [
            { ...minute, limit: nearbyLimits.minute },
            { ...day, limit: nearbyLimits.day },
          ],
          res
        );
        if (!ok) return;
```

In the `text` case:

```ts
      case "text": {
        const textLimits = limitsFor("text", isAnonymous);
        const ok = await enforceRateLimit(
          uid,
          "placesText",
          [
            { ...minute, limit: textLimits.minute },
            { ...day, limit: textLimits.day },
          ],
          res
        );
        if (!ok) return;
```

In the `clean` case:

```ts
      case "clean": {
        const cleanLimits = limitsFor("clean", isAnonymous);
        const ok = await enforceRateLimit(
          uid,
          "aiClean",
          [
            { ...minute, limit: cleanLimits.minute },
            { ...day, limit: cleanLimits.day },
          ],
          res
        );
        if (!ok) return;
```

- [ ] **Step 6: Gate the billed call behind the global ceiling**

Still in `nearby`, the cache read already happens before Google. Insert the ceiling check between the cache miss and `fetchNearbyBars`:

```ts
        const cached = await readBarCache(lat, lng);
        if (cached) {
          res.status(200).json({ bars: cached, cached: true });
          return;
        }
        // Cache miss — this is the call that costs money. Guests draw from a
        // shared daily pool; real accounts are never blocked by it.
        if (isAnonymous && !(await reserveAnonGlobalCall())) {
          res.status(429).json({
            error: "Guest searches are used up for today",
            code: "GUEST_QUOTA",
          });
          return;
        }
        const radius = radiusMeters as number;
        const bars = await fetchNearbyBars(lat, lng, radius);
```

- [ ] **Step 7: Reject anonymous callers from the verification-email action**

An anonymous account has no email, so this can only waste an Identity Toolkit call. As the first lines inside the `sendVerificationEmail` case:

```ts
      case "sendVerificationEmail": {
        if (isAnonymous) {
          res.status(403).json({ error: "Create an account first" });
          return;
        }
```

- [ ] **Step 8: Verify nothing else regressed**

Run: `npm test` → all suites pass
Run: `npx tsc -p api/tsconfig.json --noEmit` → no errors

- [ ] **Step 9: Commit**

```bash
git add api/proxy.ts api/__tests__/proxy.limits.test.ts
git commit -m "Cap anonymous callers and add a global guest ceiling on billed Places calls"
```

---

### Task 3: Guest crawl storage

Crawl state lives only in `location.state` (`Route.tsx:297`) and dies on refresh. This module is the primary durability layer, and it fixes refresh-loses-your-crawl for signed-in users too.

**Files:**
- Create: `src/services/guestCrawlStorage.ts`
- Create: `src/services/__tests__/guestCrawlStorage.test.ts`

**Interfaces:**
- Consumes: `AppBat` from `../pages/Home` (type-only import — the established pattern, see `MapContainer.tsx:4`)
- Produces:
  - `export const GUEST_CRAWL_KEY = "bh_guest_crawl"`
  - `export interface GuestCrawl { selectedBars: AppBat[]; mapCenter: [number, number]; searchRadius: number; crawlName?: string; updatedAt: number }`
  - `export const readGuestCrawl: () => GuestCrawl | null`
  - `export const writeGuestCrawl: (crawl: Omit<GuestCrawl, "updatedAt">) => void`
  - `export const clearGuestCrawl: () => void`
  - `export const isValidGuestCrawl: (value: unknown) => value is GuestCrawl`

- [ ] **Step 1: Write the failing test**

Create `src/services/__tests__/guestCrawlStorage.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  GUEST_CRAWL_KEY,
  readGuestCrawl,
  writeGuestCrawl,
  clearGuestCrawl,
  isValidGuestCrawl,
} from "../guestCrawlStorage";
import type { AppBat } from "../../pages/Home";

const makeBar = (id: string): AppBat =>
  ({
    id,
    name: `Bar ${id}`,
    address: "1 Test St",
    location: { type: "Point", coordinates: [-83.0007, 39.9612] },
    rating: 4.2,
  }) as unknown as AppBat;

const validCrawl = {
  selectedBars: [makeBar("a"), makeBar("b")],
  mapCenter: [-83.0007, 39.9612] as [number, number],
  searchRadius: 1,
};

beforeEach(() => {
  localStorage.clear();
});

describe("writeGuestCrawl / readGuestCrawl", () => {
  it("round-trips a crawl", () => {
    writeGuestCrawl(validCrawl);
    const read = readGuestCrawl();
    expect(read?.selectedBars.map((b) => b.id)).toEqual(["a", "b"]);
    expect(read?.mapCenter).toEqual([-83.0007, 39.9612]);
    expect(read?.searchRadius).toBe(1);
  });

  it("stamps updatedAt on write", () => {
    const before = Date.now();
    writeGuestCrawl(validCrawl);
    expect(readGuestCrawl()!.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it("preserves an optional crawl name", () => {
    writeGuestCrawl({ ...validCrawl, crawlName: "Bachelor party" });
    expect(readGuestCrawl()?.crawlName).toBe("Bachelor party");
  });

  it("never expires a stored crawl, however old", () => {
    const ancient = {
      ...validCrawl,
      updatedAt: Date.now() - 400 * 24 * 60 * 60 * 1000,
    };
    localStorage.setItem(GUEST_CRAWL_KEY, JSON.stringify(ancient));
    expect(readGuestCrawl()?.selectedBars).toHaveLength(2);
  });
});

describe("readGuestCrawl resilience", () => {
  it("returns null when nothing is stored", () => {
    expect(readGuestCrawl()).toBeNull();
  });

  it("returns null on unparseable JSON rather than throwing", () => {
    localStorage.setItem(GUEST_CRAWL_KEY, "{not json");
    expect(readGuestCrawl()).toBeNull();
  });

  it("returns null on a structurally wrong payload", () => {
    localStorage.setItem(GUEST_CRAWL_KEY, JSON.stringify({ selectedBars: "nope" }));
    expect(readGuestCrawl()).toBeNull();
  });

  it("rejects a crawl with fewer than two bars", () => {
    localStorage.setItem(
      GUEST_CRAWL_KEY,
      JSON.stringify({ ...validCrawl, selectedBars: [makeBar("a")], updatedAt: Date.now() })
    );
    expect(readGuestCrawl()).toBeNull();
  });
});

describe("clearGuestCrawl", () => {
  it("removes the stored crawl", () => {
    writeGuestCrawl(validCrawl);
    clearGuestCrawl();
    expect(readGuestCrawl()).toBeNull();
  });
});

describe("isValidGuestCrawl", () => {
  it("accepts a well-formed crawl", () => {
    expect(isValidGuestCrawl({ ...validCrawl, updatedAt: Date.now() })).toBe(true);
  });

  it("rejects a malformed mapCenter", () => {
    expect(
      isValidGuestCrawl({ ...validCrawl, mapCenter: [1], updatedAt: Date.now() })
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/services/__tests__/guestCrawlStorage.test.ts`
Expected: FAIL — cannot resolve `../guestCrawlStorage`.

- [ ] **Step 3: Implement the module**

Create `src/services/guestCrawlStorage.ts`:

```ts
// src/services/guestCrawlStorage.ts
//
// The guest's crawl, kept on the device. This is the PRIMARY persistence layer
// for a crawl built without an account (spec §6.1) and it also fixes
// refresh-loses-your-crawl for signed-in users, which was a live bug.
//
// There is deliberately NO TTL. Expiring a visitor's own work to pressure them
// into signing up is a dark pattern and was explicitly rejected in the spec.
// The 30-day window lives only on the server-side durability doc.
//
// Every read and write is wrapped: localStorage throws in private-mode Safari
// and can be disabled outright, and losing a crawl must never take the page
// down with it.

import type { AppBat } from "../pages/Home";

export const GUEST_CRAWL_KEY = "bh_guest_crawl";

export interface GuestCrawl {
  selectedBars: AppBat[];
  mapCenter: [number, number];
  searchRadius: number;
  crawlName?: string;
  /** epoch ms — informational only, never used to expire the crawl */
  updatedAt: number;
}

const isCoordinatePair = (value: unknown): value is [number, number] =>
  Array.isArray(value) &&
  value.length === 2 &&
  value.every((n) => typeof n === "number" && Number.isFinite(n));

export const isValidGuestCrawl = (value: unknown): value is GuestCrawl => {
  if (!value || typeof value !== "object") return false;
  const c = value as Partial<GuestCrawl>;
  if (!Array.isArray(c.selectedBars)) return false;
  // A route needs at least two stops; anything less can't be restored into
  // /route anyway — Route.tsx would bounce it straight back to /home.
  if (c.selectedBars.length < 2) return false;
  if (!c.selectedBars.every((b) => b && typeof (b as AppBat).id === "string")) {
    return false;
  }
  if (!isCoordinatePair(c.mapCenter)) return false;
  if (typeof c.searchRadius !== "number" || !Number.isFinite(c.searchRadius)) {
    return false;
  }
  if (c.crawlName !== undefined && typeof c.crawlName !== "string") return false;
  return true;
};

export const readGuestCrawl = (): GuestCrawl | null => {
  try {
    const raw = localStorage.getItem(GUEST_CRAWL_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValidGuestCrawl(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const writeGuestCrawl = (crawl: Omit<GuestCrawl, "updatedAt">): void => {
  try {
    const payload: GuestCrawl = { ...crawl, updatedAt: Date.now() };
    if (!isValidGuestCrawl(payload)) return;
    localStorage.setItem(GUEST_CRAWL_KEY, JSON.stringify(payload));
  } catch {
    /* storage unavailable or full — the in-memory crawl still works */
  }
};

export const clearGuestCrawl = (): void => {
  try {
    localStorage.removeItem(GUEST_CRAWL_KEY);
  } catch {
    /* nothing to do */
  }
};
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run src/services/__tests__/guestCrawlStorage.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: Build**

Run: `npm run build` → clean

- [ ] **Step 6: Commit**

```bash
git add src/services/guestCrawlStorage.ts src/services/__tests__/guestCrawlStorage.test.ts
git commit -m "Add device-local guest crawl storage"
```

---

### Task 4: Anonymous auth lifecycle

Minting is free; a Places call is not. The anonymous user is minted eagerly on `/home` — before the first cache read, because `firestore.rules:30` requires `request.auth != null` to read `barCacheV5` at all, so a guest with no token sees an empty map.

**The race that will break this if you get it wrong:** `auth.currentUser` is `null` while Firebase restores a session from IndexedDB. Minting on that null would give a returning signed-in user a fresh anonymous account and silently strand them out of their own. Every mint is gated on `loading === false`, which means `onAuthStateChanged` has already fired at least once.

**Files:**
- Create: `src/services/anonAuth.ts`
- Modify: `src/context/AuthContext.tsx`
- Modify: `src/context/types.ts`

**Interfaces:**
- Consumes: `auth` from `../firebase/config`
- Produces:
  - `export const ensureAnonymousUser: () => Promise<FirebaseUser>` (idempotent, de-duplicated)
  - `AuthContextType` gains `isGuest: boolean` and `ensureGuest: () => Promise<void>`

- [ ] **Step 1: Create the minting service**

Create `src/services/anonAuth.ts`:

```ts
// src/services/anonAuth.ts
//
// Anonymous Firebase users back guest mode. The anon user is what lets a guest
// read the shared bar cache (firestore.rules requires request.auth != null) and
// what gives the billed proxy a uid to rate-limit, so it must exist BEFORE the
// first cache read on /home.
//
// CALLER CONTRACT: never call this while auth is still restoring a session.
// auth.currentUser is null during that window, and minting on it would strand
// a returning signed-in user on a brand-new anonymous account. AuthContext
// enforces the gate (loading === false) inside ensureGuest.

import { signInAnonymously, type User as FirebaseUser } from "firebase/auth";
import { auth } from "../firebase/config";

// De-duplicates concurrent calls — React 19 StrictMode mounts effects twice in
// development, and two signInAnonymously calls would mint two accounts.
let pending: Promise<FirebaseUser> | null = null;

export const ensureAnonymousUser = (): Promise<FirebaseUser> => {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  if (pending) return pending;
  pending = signInAnonymously(auth)
    .then((cred) => cred.user)
    .finally(() => {
      pending = null;
    });
  return pending;
};
```

- [ ] **Step 2: Extend the auth context type**

In `src/context/types.ts`, add to `AuthContextType` directly after `loading`:

```ts
  /** True when the current session is an anonymous (guest) account. */
  isGuest: boolean;
  /** Mint an anonymous user if nobody is signed in. No-op while loading, and
   *  a no-op when a real or anonymous user already exists. */
  ensureGuest: () => Promise<void>;
```

- [ ] **Step 3: Implement them in the provider**

In `src/context/AuthContext.tsx`, add the import:

```ts
import { ensureAnonymousUser } from '../services/anonAuth';
```

Add above `contextValue`:

```ts
  // Guest mode: an anonymous account is a signed-in Firebase user, so every
  // "is this person logged in?" check in the app must ask isGuest too.
  const isGuest = !!user?.isAnonymous;

  // Mint an anonymous user for a visitor with no session. Gated on `loading`
  // because auth.currentUser is null while Firebase restores an existing
  // session from IndexedDB — minting there would sign a returning user out of
  // their own account and into a fresh guest.
  const ensureGuest = async (): Promise<void> => {
    if (loading || user) return;
    try {
      await ensureAnonymousUser();
    } catch (error) {
      // A failed mint means no cache reads and no proxy calls. The page still
      // renders; the visitor gets the signed-out experience.
      console.error('Anonymous sign-in failed:', error);
    }
  };
```

Add both to `contextValue`:

```ts
  const contextValue: AuthContextType = {
    user,
    loading,
    isGuest,
    ensureGuest,
    signup,
    signin,
    signinWithGoogle,
    signout,
    resetPassword,
    updateProfile,
    resendVerificationEmail,
    reloadUser,
  };
```

- [ ] **Step 4: Enable anonymous sign-in in the Firebase console**

Owner action; the code is inert without it. Firebase Console → Authentication → Sign-in method → **Anonymous** → Enable. Without it `signInAnonymously` fails with `auth/admin-restricted-operation` and every guest sees an empty map.

- [ ] **Step 5: Build**

Run: `npm run build` → clean. Nothing calls `ensureGuest` yet, so behaviour is unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/services/anonAuth.ts src/context/AuthContext.tsx src/context/types.ts
git commit -m "Add anonymous auth lifecycle to the auth context"
```

---

### Task 5: Snap the guest's first view onto a seeded metro

Implements Decision 2. A coarse IP-geo centre that lands more than 2 miles from a seed point misses the cache and bills a Places call on page load. Snapping that centre to the nearest seed metro within 15 miles turns a per-visitor charge into a free cache hit.

Only the **IP-geo** branch is snapped. A visitor who previously granted precise location keeps their real coordinates — moving someone off their own location to save a cache lookup would be the wrong trade.

**Files:**
- Modify: `src/hooks/useInitialCenter.ts`
- Create: `src/hooks/__tests__/useInitialCenter.snap.test.ts`

**Interfaces:**
- Consumes: `SEED_METROS`, `SeedMetro` from `../data/seedMetros`
- Produces: `export const snapToSeedMetro: (lng: number, lat: number) => { center: [number, number]; label: string } | null`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/__tests__/useInitialCenter.snap.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { snapToSeedMetro } from "../useInitialCenter";

describe("snapToSeedMetro", () => {
  it("snaps a west-London IP centre onto the London seed", () => {
    // The exact coordinates that missed the cache in production on 2026-09-22
    const snapped = snapToSeedMetro(-0.3219, 51.4973);
    expect(snapped).not.toBeNull();
    expect(snapped!.label).toBe("London, UK");
    expect(snapped!.center[0]).toBeCloseTo(-0.1276, 3);
    expect(snapped!.center[1]).toBeCloseTo(51.5072, 3);
  });

  it("snaps the second missed London centre too", () => {
    expect(snapToSeedMetro(-0.3708, 51.4669)?.label).toBe("London, UK");
  });

  it("returns null for a centre with no seed metro nearby", () => {
    // Louisville, KY — genuinely unseeded, also seen missing in production
    expect(snapToSeedMetro(-85.7588, 38.2532)).toBeNull();
  });

  it("returns null far out at sea", () => {
    expect(snapToSeedMetro(-30, 0)).toBeNull();
  });

  it("leaves a centre already on a seed point effectively unmoved", () => {
    const snapped = snapToSeedMetro(-0.1276, 51.5072);
    expect(snapped!.center).toEqual([-0.1276, 51.5072]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/hooks/__tests__/useInitialCenter.snap.test.ts`
Expected: FAIL — `snapToSeedMetro` is not exported by `../useInitialCenter`.

- [ ] **Step 3: Implement the snap**

In `src/hooks/useInitialCenter.ts`, add the import and the helper above `useInitialCenter`:

```ts
import { SEED_METROS } from "../data/seedMetros";

// A seeded metro covers a 2-mile disc (SEARCH_RADIUS_MILES in
// barCacheService.ts / CACHE_RADIUS_MILES in api/proxy.ts), but an IP-geo
// centre can land 8-11 miles off the city point — measured in production on
// 2026-09-22, where a west-London centre missed seed-london-uk by 8.4 miles
// and billed a fresh Places call. Snapping a coarse centre onto the metro it
// clearly belongs to turns that into a free cache hit.
//
// 15 miles is wide enough for the sprawl of London, NYC and LA and narrow
// enough that a genuinely different town is never mistaken for a seeded one.
const SNAP_RADIUS_MILES = 15;

const milesBetween = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number => {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/** Nearest seeded metro within SNAP_RADIUS_MILES, or null. */
export const snapToSeedMetro = (
  lng: number,
  lat: number
): { center: [number, number]; label: string } | null => {
  let best: { center: [number, number]; label: string } | null = null;
  let bestMiles = SNAP_RADIUS_MILES;
  for (const metro of SEED_METROS) {
    const miles = milesBetween(lat, lng, metro.lat, metro.lng);
    if (miles <= bestMiles) {
      bestMiles = miles;
      best = { center: [metro.lng, metro.lat], label: metro.name };
    }
  }
  return best;
};
```

- [ ] **Step 4: Apply it to the IP-geo branch only**

In `useInitialCenter`, replace the `geo?.available` branch body:

```ts
        if (
          geo?.available &&
          Number.isFinite(geo.lat) &&
          Number.isFinite(geo.lng)
        ) {
          // An IP centre is coarse by nature, so nudging it onto the metro it
          // belongs to costs the visitor nothing and buys a free cache hit.
          // Precise coords from a granted permission are never snapped — they
          // short-circuit above and never reach this branch.
          const snapped = snapToSeedMetro(geo.lng, geo.lat);
          settle(
            snapped
              ? { center: snapped.center, label: snapped.label }
              : { center: [geo.lng, geo.lat], label: geo.label || "Your Area" }
          );
        } else {
          settle();
        }
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/hooks/__tests__/useInitialCenter.snap.test.ts` → PASS (5 tests)
Run: `npm test` → all suites pass
Run: `npm run build` → clean

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useInitialCenter.ts src/hooks/__tests__/useInitialCenter.snap.test.ts
git commit -m "Snap a coarse IP-geo centre onto the nearest seeded metro"
```

---

### Task 6: Make Home work for a guest

`/home` is still behind `ProtectedRoute` after this task — nothing user-visible changes. The page simply stops assuming a real account exists.

**Files:**
- Modify: `src/pages/Home.tsx:88` (auth destructure), `:93-103` (active-session effect), the bar-fetch effects, and the selection handler
- Modify: `src/components/SidebarHeader.tsx`

**Interfaces:**
- Consumes: `isGuest`, `ensureGuest` (Task 4); `writeGuestCrawl` (Task 3)
- Produces: nothing new

- [ ] **Step 1: Mint the guest before anything reads the cache**

In `src/pages/Home.tsx`, change line 88 and add the mint effect directly below it:

```tsx
  const { user, loading: authLoading, isGuest, ensureGuest } = useAuth();
  const navigate = useNavigate();

  // A guest needs a Firebase uid before ANY cache read: firestore.rules
  // requires request.auth != null on barCacheV5, so a tokenless visitor would
  // see an empty map. Gated on authLoading so a returning signed-in user is
  // never overwritten by a fresh anonymous account mid-restore.
  useEffect(() => {
    if (authLoading || user) return;
    void ensureGuest();
  }, [authLoading, user, ensureGuest]);
```

- [ ] **Step 2: Skip the active-session lookup for guests**

`getActiveSessionForMember` queries `crawlSessions`, which a guest can never own. Replace the effect at lines 93-103:

```tsx
  useEffect(() => {
    if (!user || isGuest) return;
    let cancelled = false;
    (async () => {
      const active = await getActiveSessionForMember(user.uid);
      if (!cancelled) setActiveSession(active);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isGuest]);
```

- [ ] **Step 3: Hold the first bar fetch until a uid exists**

`fetchBarsInArea` calls `getCachedBars`, which needs `request.auth`. Add a uid guard as the first line of the `fetchBarsInArea` callback body (around line 244, before the coordinate resolution):

```tsx
      // No uid yet means no cache read and no proxy call — both would fail.
      // The mint effect above re-runs this once a user exists.
      if (!user) return;
```

Then add `user` to that `useCallback`'s dependency array.

- [ ] **Step 4: Persist the selection for a guest**

There is a commented-out `selectedBars` memo at `Home.tsx:672-675`. Replace those four commented lines with a live memo plus the persistence effect.

**Build the array the way `Sidebar.tsx:183-187` does, not with `bars.filter`.** `Set` keeps insertion order, so `Array.from(selectedBarIds)` is the order the user clicked the bars in, and the Route page treats that as "my order" for the Restore-my-order button. A `bars.filter` would silently store *list* order and a restored crawl would come back reordered.

```tsx
  // The order the user clicked the bars in — Set keeps insertion order, and
  // /route treats this as "my order". Mirrors Sidebar's construction; using
  // bars.filter here would silently store list order instead.
  const selectedBars = useMemo(() => {
    const barById = new Map(bars.map((bar) => [bar.id, bar]));
    return Array.from(selectedBarIds)
      .map((id) => barById.get(id))
      .filter((bar): bar is AppBat => Boolean(bar));
  }, [bars, selectedBarIds]);

  // Keep the guest's crawl on the device as they build it (spec §6.1). Also
  // fixes refresh-loses-your-crawl for signed-in users, which was a live bug.
  useEffect(() => {
    if (selectedBars.length < 2) return;
    writeGuestCrawl({ selectedBars, mapCenter, searchRadius });
  }, [selectedBars, mapCenter, searchRadius]);
```

`useMemo` is already imported in this file.

Add the import at the top of the file:

```tsx
import { writeGuestCrawl } from "../services/guestCrawlStorage";
```

- [ ] **Step 5: Give the header a signup CTA for guests**

`SidebarHeader` guards with `{user && …}` twice (lines 23 and 27), but an anonymous user is truthy — a guest would see "Sign Out" and "Welcome, crawler!" for an account they do not have, plus a Saved Crawls button that bounces them.

`SidebarHeader` receives `user` as a prop rather than from context. Rather than thread an extra prop through `Sidebar`, read the flag directly — every other component in the app uses `useAuth` this way. Replace the whole component body in `src/components/SidebarHeader.tsx`:

```tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FiFolder } from 'react-icons/fi';
import type { User } from '../context/types';
import { useAuth } from '../context/useAuth';
import '../styles/Home.css';

interface SidebarHeaderProps {
  user: User | null;
  onSignOut: () => void;
}

export const SidebarHeader: React.FC<SidebarHeaderProps> = ({ user, onSignOut }) => {
  const navigate = useNavigate();
  // A guest is a truthy `user`, so `{user && …}` alone would show them a
  // Sign Out button and a Saved Crawls link for an account they don't have.
  const { isGuest } = useAuth();
  const hasAccount = !!user && !isGuest;

  const handleSavedCrawlsClick = () => {
    navigate('/saved-crawls');
  };

  return (
    <div className="sidebar-header">
      <div className="header-top">
        <h1 className="sidebar-title">BarHop</h1>
        {hasAccount ? (
          <button onClick={onSignOut} className="btn-signout">Sign Out</button>
        ) : (
          <button onClick={() => navigate('/signup')} className="btn-signout">
            Sign up free
          </button>
        )}
      </div>
      {hasAccount && (
        <div className="user-info">
          <span className="user-welcome">
            Welcome, {user.displayName || user.email?.split("@")[0] || "crawler"}!
          </span>
          <button
            onClick={handleSavedCrawlsClick}
            className="btn-saved-crawls"
            title="View your saved crawls"
          >
            <FiFolder size={14} />
            Saved Crawls
          </button>
        </div>
      )}
    </div>
  );
};
```

The signup button reuses `.btn-signout` so it inherits the header's existing sizing; no new CSS is needed.

- [ ] **Step 6: Build and test**

Run: `npm run build` → clean
Run: `npm test` → all suites pass

- [ ] **Step 7: Commit**

```bash
git add src/pages/Home.tsx src/components/SidebarHeader.tsx
git commit -m "Make Home mint and tolerate a guest session"
```

---

### Task 7: Make Route work for a guest

Two jobs: restore the crawl when `location.state` is gone (refresh, or arriving after signup), and gate the three account-only actions behind a signup prompt instead of a silent no-op.

`handlePlanWithFriends` and `handleStartCrawl` currently open with `if (!user || …) return;` — for a guest that is a **dead button**, which is worse than a wall. Both must route to signup.

**Files:**
- Modify: `src/pages/Route.tsx` (guard effect ~:297-307, `handleSaveCrawl` :650, `handlePlanWithFriends` :660, `handleStartCrawl` :690)
- Create: `src/components/GuestSignupPrompt.tsx`
- Create: `src/styles/GuestSignupPrompt.css`

**Interfaces:**
- Consumes: `readGuestCrawl`, `writeGuestCrawl` (Task 3); `isGuest` (Task 4)
- Produces: `GuestSignupPrompt` with props `{ open: boolean; reason: "save" | "live" | "plan"; onClose: () => void }`

- [ ] **Step 1: Build the prompt component**

Create `src/components/GuestSignupPrompt.tsx`:

```tsx
// src/components/GuestSignupPrompt.tsx
//
// The moment a guest hits something that needs an account. The copy is framed
// on what is actually true — the crawl lives on this device — not on an expiry
// we impose, because the spec rejects manufactured urgency (§6.2).
//
// Google is visually primary at this moment on purpose (spec §9): it is
// pre-verified and one tap, so it is the cheapest possible path out of the
// highest-intent moment in the product.

import React from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { FcGoogle } from "react-icons/fc";
import { useAuth } from "../context/useAuth";
import { toast } from "./Toaster";
import "../styles/GuestSignupPrompt.css";

export type GuestPromptReason = "save" | "live" | "plan" | "search";

interface GuestSignupPromptProps {
  open: boolean;
  reason: GuestPromptReason;
  onClose: () => void;
}

const HEADLINES: Record<GuestPromptReason, string> = {
  save: "Save this crawl",
  live: "Start the crawl",
  plan: "Plan it together",
  search: "Sign up to keep searching",
};

// "search" is the daily guest pool running out, which is a different promise
// from losing the crawl — telling someone their crawl is at risk when it is
// not would be a lie in the service of a conversion.
const BODIES: Record<GuestPromptReason, string> = {
  save: "This crawl is only on this device — save it so it's there on the night.",
  live: "This crawl is only on this device — save it so it's there on the night.",
  plan: "This crawl is only on this device — save it so it's there on the night.",
  search: "Guest searches are used up for today. An account gets you the full allowance.",
};

const GuestSignupPrompt: React.FC<GuestSignupPromptProps> = ({
  open,
  reason,
  onClose,
}) => {
  const navigate = useNavigate();
  const { signinWithGoogle } = useAuth();

  const handleGoogle = async () => {
    try {
      await signinWithGoogle();
      onClose();
    } catch {
      toast.error("Couldn't finish sign-up — try again");
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="modal-panel guest-prompt"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="guest-prompt__title">{HEADLINES[reason]}</h2>
            <p className="guest-prompt__body">{BODIES[reason]}</p>
            <button className="btn btn-primary guest-prompt__google" onClick={handleGoogle}>
              <FcGoogle size={20} />
              Continue with Google
            </button>
            <button
              className="btn btn-ghost guest-prompt__email"
              onClick={() => navigate("/signup")}
            >
              Sign up with email
            </button>
            <button className="guest-prompt__dismiss" onClick={onClose}>
              Keep looking around
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default GuestSignupPrompt;
```

- [ ] **Step 2: Style it against the existing token system**

Create `src/styles/GuestSignupPrompt.css`:

```css
/* Uses the shared .modal-overlay / .modal-panel classes from
   src/styles/system/ — this file only adds the prompt's own layout. */
.guest-prompt {
  max-width: 380px;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.guest-prompt__title {
  font-family: var(--font-display);
  font-size: 1.5rem;
  margin: 0;
}

.guest-prompt__body {
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.5;
}

.guest-prompt__google {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
}

.guest-prompt__dismiss {
  background: none;
  border: none;
  color: var(--text-tertiary);
  font-size: var(--text-xs);
  cursor: pointer;
  padding: var(--space-1);
}
```

These token names are verified against `src/styles/tokens.css` (`--font-display:43`, `--text-secondary:24`, `--text-tertiary:25`, `--text-xs:45`, `--space-1/2/3:57-59`). Note there is **no** `--text-muted` in this system.

- [ ] **Step 3: Restore a guest crawl when navigation state is gone**

In `src/pages/Route.tsx`, replace the guard effect (lines 299-307) so it tries storage before bouncing to `/home`:

```tsx
  // location.state dies on refresh, and a guest returning from signup arrives
  // with none. Fall back to the stored crawl before giving up and bouncing.
  const [restoredState, setRestoredState] = useState<RoutePageState | null>(null);
  const effectiveState = routeState ?? restoredState;

  useEffect(() => {
    const crawlId = searchParams.get("crawlId");
    if (crawlId) return;
    if (routeState?.selectedBars && routeState.selectedBars.length >= 2) return;

    const stored = readGuestCrawl();
    if (stored) {
      setRestoredState({
        selectedBars: stored.selectedBars,
        mapCenter: stored.mapCenter,
        searchRadius: stored.searchRadius,
        crawlName: stored.crawlName,
      });
      return;
    }
    navigate("/home");
  }, [routeState, navigate, searchParams]);
```

Then replace every subsequent read of `routeState` in this component with `effectiveState`, including `mapCenter` (line 320), `searchRadius` (line 324) and `crawlName` (lines 668 and wherever else it appears). Add the import:

```tsx
import { readGuestCrawl } from "../services/guestCrawlStorage";
```

- [ ] **Step 4: Route the three gated actions to the prompt**

In `src/pages/Route.tsx`, widen the existing destructure at line 287 (`const { user } = useAuth();`) and add the prompt state beside the other `useState` calls:

```tsx
  const { user, isGuest } = useAuth();
  const [guestPrompt, setGuestPrompt] = useState<GuestPromptReason | null>(null);
```

Replace `handleSaveCrawl` (line 650):

```tsx
  const handleSaveCrawl = () => {
    if (!user || isGuest) {
      setGuestPrompt("save");
      return;
    }
    setShowSaveModal(true);
  };
```

Change the opening guard of `handlePlanWithFriends` (line 661):

```tsx
    if (draggableBars.length < 2 || !startCoordinates) return;
    if (!user || isGuest) {
      setGuestPrompt("plan");
      return;
    }
```

Change the opening guard of `handleStartCrawl` (line 691):

```tsx
    if (draggableBars.length < 2 || !startCoordinates) return;
    if (!user || isGuest) {
      setGuestPrompt("live");
      return;
    }
```

- [ ] **Step 5: Render the prompt**

Beside `<SaveCrawlModal … />` at the bottom of Route's JSX (around line 1055):

```tsx
      <GuestSignupPrompt
        open={guestPrompt !== null}
        reason={guestPrompt ?? "save"}
        onClose={() => setGuestPrompt(null)}
      />
```

Add the import:

```tsx
import GuestSignupPrompt, { type GuestPromptReason } from "../components/GuestSignupPrompt";
```

- [ ] **Step 6: Keep the stored crawl current as the guest reorders stops**

Add an effect near the other Route effects:

```tsx
  // Reordering, renaming and dragging all change the crawl, so the stored copy
  // has to follow — otherwise a refresh restores the pre-drag order.
  useEffect(() => {
    if (draggableBars.length < 2) return;
    writeGuestCrawl({
      selectedBars: draggableBars,
      mapCenter,
      searchRadius,
      crawlName: effectiveState?.crawlName,
    });
  }, [draggableBars, mapCenter, searchRadius, effectiveState?.crawlName]);
```

Extend the import from Task 3:

```tsx
import { readGuestCrawl, writeGuestCrawl } from "../services/guestCrawlStorage";
```

- [ ] **Step 7: Build and test**

Run: `npm run build` → clean
Run: `npm test` → all suites pass

- [ ] **Step 8: Commit**

```bash
git add src/pages/Route.tsx src/components/GuestSignupPrompt.tsx src/styles/GuestSignupPrompt.css
git commit -m "Restore guest crawls on Route and prompt for signup at the gates"
```

---

### Task 8: Upgrade the anonymous account in place

`linkWithCredential` keeps the uid, so anything written under it is already theirs and there is no migration step. **The failure path will definitely occur** (spec §5): a returning visitor builds a crawl as a guest, hits save, and linking fails with `auth/email-already-in-use`. Without a fallback, the most engaged returning visitors hit a dead end at the exact moment of conversion.

**Files:**
- Create: `src/services/accountUpgrade.ts`
- Create: `src/services/__tests__/accountUpgrade.test.ts`
- Modify: `src/context/AuthContext.tsx` (`signup`, `signinWithGoogle`)

**Interfaces:**
- Consumes: `auth`; `clearGuestCrawl`, `readGuestCrawl` (Task 3)
- Produces:
  - `export const LINK_COLLISION_CODES: readonly string[]`
  - `export const isLinkCollision: (code: unknown) => boolean`
  - `export const errorCodeOf: (error: unknown) => string | null`

- [ ] **Step 1: Write the failing test**

Create `src/services/__tests__/accountUpgrade.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isLinkCollision, errorCodeOf } from "../accountUpgrade";

describe("errorCodeOf", () => {
  it("pulls the code off a Firebase error", () => {
    expect(errorCodeOf({ code: "auth/email-already-in-use" })).toBe(
      "auth/email-already-in-use"
    );
  });

  it("returns null for anything else", () => {
    expect(errorCodeOf(new Error("boom"))).toBeNull();
    expect(errorCodeOf(null)).toBeNull();
    expect(errorCodeOf("auth/email-already-in-use")).toBeNull();
  });
});

describe("isLinkCollision", () => {
  it("is true when the email already has an account", () => {
    expect(isLinkCollision("auth/email-already-in-use")).toBe(true);
  });

  it("is true when the Google credential already has an account", () => {
    expect(isLinkCollision("auth/credential-already-in-use")).toBe(true);
  });

  it("is true when the provider is already linked", () => {
    expect(isLinkCollision("auth/provider-already-linked")).toBe(true);
  });

  it("is false for a weak password", () => {
    expect(isLinkCollision("auth/weak-password")).toBe(false);
  });

  it("is false for junk", () => {
    expect(isLinkCollision(null)).toBe(false);
    expect(isLinkCollision(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/services/__tests__/accountUpgrade.test.ts`
Expected: FAIL — cannot resolve `../accountUpgrade`.

- [ ] **Step 3: Implement the module**

Create `src/services/accountUpgrade.ts`:

```ts
// src/services/accountUpgrade.ts
//
// Turning a guest into an account. linkWithCredential preserves the uid, so
// the crawl they built is already theirs — no migration, no copying.
//
// The collision path is not an edge case. A returning visitor who already has
// an account, browses as a guest and then signs up will hit it every time, at
// the single highest-intent moment in the funnel. It gets a real path, not a
// red error message.

import {
  EmailAuthProvider,
  GoogleAuthProvider,
  linkWithCredential,
  linkWithPopup,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
  type User as FirebaseUser,
  type UserCredential,
} from "firebase/auth";
import { auth } from "../firebase/config";

/** Firebase codes meaning "this identity already belongs to another account". */
export const LINK_COLLISION_CODES = [
  "auth/email-already-in-use",
  "auth/credential-already-in-use",
  "auth/provider-already-linked",
] as const;

export const errorCodeOf = (error: unknown): string | null => {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code: unknown }).code;
    return typeof code === "string" ? code : null;
  }
  return null;
};

export const isLinkCollision = (code: unknown): boolean =>
  typeof code === "string" &&
  (LINK_COLLISION_CODES as readonly string[]).includes(code);

/** True when there is an anonymous session to upgrade rather than replace. */
const guestToUpgrade = (): FirebaseUser | null => {
  const current = auth.currentUser;
  return current?.isAnonymous ? current : null;
};

/**
 * Email/password signup. Upgrades the guest in place when one exists, and
 * falls back to a normal sign-in when the email already has an account — the
 * orphaned anonymous user is simply abandoned (it owns nothing; the crawl
 * lives in localStorage and is replayed by the caller).
 */
export const upgradeOrCreateWithEmail = async (
  email: string,
  password: string,
  displayName?: string
): Promise<{ credential: UserCredential; wasGuest: boolean; collided: boolean }> => {
  const guest = guestToUpgrade();
  if (!guest) {
    const { createUserWithEmailAndPassword } = await import("firebase/auth");
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) await updateProfile(credential.user, { displayName });
    return { credential, wasGuest: false, collided: false };
  }

  try {
    const credential = await linkWithCredential(
      guest,
      EmailAuthProvider.credential(email, password)
    );
    if (displayName) await updateProfile(credential.user, { displayName });
    return { credential, wasGuest: true, collided: false };
  } catch (error) {
    if (!isLinkCollision(errorCodeOf(error))) throw error;
    // They already have an account. Sign them into it; the guest uid is
    // discarded and the caller replays the stored crawl under the real one.
    const credential = await signInWithEmailAndPassword(auth, email, password);
    return { credential, wasGuest: true, collided: true };
  }
};

/** Google signup/sign-in, with the same upgrade-then-fallback shape. */
export const upgradeOrCreateWithGoogle = async (): Promise<{
  credential: UserCredential;
  wasGuest: boolean;
  collided: boolean;
}> => {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  const guest = guestToUpgrade();
  if (!guest) {
    return {
      credential: await signInWithPopup(auth, provider),
      wasGuest: false,
      collided: false,
    };
  }

  try {
    return {
      credential: await linkWithPopup(guest, provider),
      wasGuest: true,
      collided: false,
    };
  } catch (error) {
    if (!isLinkCollision(errorCodeOf(error))) throw error;
    return {
      credential: await signInWithPopup(auth, provider),
      wasGuest: true,
      collided: true,
    };
  }
};
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run src/services/__tests__/accountUpgrade.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Route the context's signup through the upgrade path**

In `src/context/AuthContext.tsx`, replace `signup`:

```ts
  const signup = async (
    email: string,
    password: string,
    displayName?: string
  ): Promise<void> => {
    try {
      const { credential, wasGuest } = await upgradeOrCreateWithEmail(
        email,
        password,
        displayName
      );
      analytics.signUp('email');
      if (displayName && credential.user) {
        // onAuthStateChanged fires before the profile update completes, so
        // sync the display name into local state manually.
        setUser((prev) => (prev ? { ...prev, displayName } : prev));
      }
      // wasGuest is the number that decides whether guest mode beat the cold
      // wall (spec §10). Phase 2 attaches it to the event; keeping the value
      // here means that is a one-line change.
      void wasGuest;
    } catch (error) {
      console.error('Sign up error:', error);
      throw error;
    }
  };
```

And `signinWithGoogle`:

```ts
  const signinWithGoogle = async (): Promise<void> => {
    try {
      const { credential, wasGuest } = await upgradeOrCreateWithGoogle();
      // Count only first-time Google users as a sign-up. A linked guest is
      // always new, since the anonymous account had no Google identity.
      if (wasGuest || getAdditionalUserInfo(credential)?.isNewUser) {
        analytics.signUp('google');
      }
    } catch (error) {
      console.error('Google sign-in error:', error);
      throw error;
    }
  };
```

Add the import and remove the now-unused `createUserWithEmailAndPassword`, `signInWithPopup` and `GoogleAuthProvider` imports if nothing else in the file uses them:

```ts
import { upgradeOrCreateWithEmail, upgradeOrCreateWithGoogle } from '../services/accountUpgrade';
```

- [ ] **Step 6: Build and test**

Run: `npm run build` → clean (watch for unused-import errors; `noUnusedLocals` is on)
Run: `npm test` → all suites pass

- [ ] **Step 7: Commit**

```bash
git add src/services/accountUpgrade.ts src/services/__tests__/accountUpgrade.test.ts src/context/AuthContext.tsx
git commit -m "Upgrade anonymous accounts in place, with a fallback when the email already exists"
```

---

### Task 9: Server-side guest crawl durability

**Safari's ITP evicts localStorage after 7 days without site interaction, and iOS is 48% of traffic.** BarHop is plan-ahead-for-an-occasion software — a bachelor party gets planned three weeks out. Client storage alone would silently lose those crawls on the majority platform, in precisely the use case the product is for.

This is a durability layer, not a sharing feature. Spec §14.2 explicitly rules out a pre-signup share link in Phase 1.

**Files:**
- Create: `src/services/guestCrawlDoc.ts`
- Create: `src/services/__tests__/guestCrawlDoc.test.ts`
- Modify: `firestore.rules`
- Modify: `src/pages/Route.tsx` (restore fallback)

**Interfaces:**
- Consumes: `db` from `../firebase/config`; `GuestCrawl` (Task 3)
- Produces:
  - `export const GUEST_CRAWL_TTL_DAYS = 30`
  - `export const isGuestDocExpired: (expiresAt: number, now?: number) => boolean`
  - `export const saveGuestCrawlDoc: (uid: string, crawl: GuestCrawl) => Promise<void>`
  - `export const loadGuestCrawlDoc: (uid: string) => Promise<GuestCrawl | null>`

- [ ] **Step 1: Write the failing test**

Create `src/services/__tests__/guestCrawlDoc.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isGuestDocExpired, GUEST_CRAWL_TTL_DAYS } from "../guestCrawlDoc";

const DAY = 24 * 60 * 60 * 1000;

describe("GUEST_CRAWL_TTL_DAYS", () => {
  it("is the 30-day window from the spec", () => {
    expect(GUEST_CRAWL_TTL_DAYS).toBe(30);
  });
});

describe("isGuestDocExpired", () => {
  const now = Date.parse("2026-09-22T00:00:00Z");

  it("is false for a doc expiring in the future", () => {
    expect(isGuestDocExpired(now + DAY, now)).toBe(false);
  });

  it("is true once the expiry has passed", () => {
    expect(isGuestDocExpired(now - 1, now)).toBe(true);
  });

  it("is true for a missing or nonsense expiry", () => {
    expect(isGuestDocExpired(Number.NaN, now)).toBe(true);
    expect(isGuestDocExpired(0, now)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/services/__tests__/guestCrawlDoc.test.ts`
Expected: FAIL — cannot resolve `../guestCrawlDoc`.

- [ ] **Step 3: Implement the module**

Create `src/services/guestCrawlDoc.ts`:

```ts
// src/services/guestCrawlDoc.ts
//
// Server-side durability for a guest's crawl. This exists because of a
// platform constraint, not a product preference: Safari's ITP evicts
// localStorage after 7 days without site interaction and iOS is 48% of
// traffic, so a crawl planned three weeks ahead of the night would silently
// vanish on the majority platform.
//
// 30 days, and it is NOT a sharing surface — spec §14.2 rules out a
// pre-signup share link in Phase 1. One doc per anonymous uid, readable and
// writable only by that uid.

import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { isValidGuestCrawl, type GuestCrawl } from "./guestCrawlStorage";

export const GUEST_CRAWL_TTL_DAYS = 30;
const COLLECTION = "guestCrawls";

export const isGuestDocExpired = (expiresAt: number, now = Date.now()): boolean =>
  !Number.isFinite(expiresAt) || expiresAt <= 0 || expiresAt < now;

/** Write the guest's crawl under their anonymous uid. Best-effort. */
export const saveGuestCrawlDoc = async (
  uid: string,
  crawl: GuestCrawl
): Promise<void> => {
  try {
    await setDoc(doc(db, COLLECTION, uid), {
      ...crawl,
      expiresAt: Date.now() + GUEST_CRAWL_TTL_DAYS * 24 * 60 * 60 * 1000,
    });
  } catch (error) {
    // Durability is a backstop; localStorage is the primary layer and the
    // crawl on screen is unaffected.
    console.error("guest crawl save failed:", error);
  }
};

/** Read it back — used when localStorage has been evicted. */
export const loadGuestCrawlDoc = async (uid: string): Promise<GuestCrawl | null> => {
  try {
    const snap = await getDoc(doc(db, COLLECTION, uid));
    if (!snap.exists()) return null;
    const data = snap.data() as Partial<GuestCrawl> & { expiresAt?: number };
    if (isGuestDocExpired(Number(data.expiresAt))) return null;
    return isValidGuestCrawl(data) ? data : null;
  } catch (error) {
    console.error("guest crawl load failed:", error);
    return null;
  }
};
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run src/services/__tests__/guestCrawlDoc.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Add the Firestore rule**

In `firestore.rules`, inside the `match /databases/{database}/documents` block, after the `barCacheV5` block:

```
    // ----- Guest crawl durability (spec §6.1 layer 2) -----
    // One doc per uid, named by that uid. Purely a durability backstop for
    // Safari ITP eviction — NOT a sharing surface, so reads are owner-only
    // (spec §14.2 rules out a pre-signup share link in Phase 1).
    match /guestCrawls/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
```

Deploy:

```bash
firebase deploy --only firestore:rules
```

- [ ] **Step 5b: Add a Firestore TTL policy so the docs actually get deleted**

Owner action, and it matters: **deleting an anonymous Auth account does not cascade to Firestore.** Firebase's "auto-delete anonymous users" removes the uid but leaves `guestCrawls/{uid}` behind forever, so without this the collection grows without bound.

Firebase Console → Firestore Database → **TTL** → Create policy:
- Collection group: `guestCrawls`
- Timestamp field: `expiresAt`

`saveGuestCrawlDoc` writes `expiresAt` as epoch **milliseconds**, but a Firestore TTL policy requires a **timestamp** field. Change the write in `src/services/guestCrawlDoc.ts` to store both — the number for the client-side `isGuestDocExpired` check, and a timestamp for the platform:

```ts
    const expiresMs = Date.now() + GUEST_CRAWL_TTL_DAYS * 24 * 60 * 60 * 1000;
    await setDoc(doc(db, COLLECTION, uid), {
      ...crawl,
      expiresAt: expiresMs,
      // Firestore TTL policies only accept a timestamp field. Kept alongside
      // the epoch-ms copy that isGuestDocExpired reads, so the client and the
      // platform expire the doc on exactly the same instant.
      expiresAtTs: Timestamp.fromMillis(expiresMs),
    });
```

Add `Timestamp` to the firestore import in that file:

```ts
import { doc, getDoc, setDoc, Timestamp } from "firebase/firestore";
```

TTL deletion is best-effort and can lag by up to 24 hours, which is why `isGuestDocExpired` still gates the read path rather than trusting the policy.

- [ ] **Step 6: Write the doc as the guest builds, and read it when storage is empty**

In `src/pages/Route.tsx`, extend the persistence effect from Task 7 Step 6:

```tsx
  useEffect(() => {
    if (draggableBars.length < 2) return;
    const crawl = {
      selectedBars: draggableBars,
      mapCenter,
      searchRadius,
      crawlName: effectiveState?.crawlName,
    };
    writeGuestCrawl(crawl);
    // iOS ITP backstop — only guests need it; a real account saves crawls
    // properly through barCrawls.
    if (user && isGuest) {
      void saveGuestCrawlDoc(user.uid, { ...crawl, updatedAt: Date.now() });
    }
  }, [draggableBars, mapCenter, searchRadius, effectiveState?.crawlName, user, isGuest]);
```

And extend the restore effect from Task 7 Step 3 so an evicted localStorage still recovers:

```tsx
    const stored = readGuestCrawl();
    if (stored) {
      setRestoredState({
        selectedBars: stored.selectedBars,
        mapCenter: stored.mapCenter,
        searchRadius: stored.searchRadius,
        crawlName: stored.crawlName,
      });
      return;
    }
    // localStorage can be evicted by Safari ITP after 7 idle days. Try the
    // server copy before giving up on the crawl entirely.
    if (user) {
      let cancelled = false;
      void loadGuestCrawlDoc(user.uid).then((remote) => {
        if (cancelled) return;
        if (remote) {
          setRestoredState({
            selectedBars: remote.selectedBars,
            mapCenter: remote.mapCenter,
            searchRadius: remote.searchRadius,
            crawlName: remote.crawlName,
          });
        } else {
          navigate("/home");
        }
      });
      return () => {
        cancelled = true;
      };
    }
    navigate("/home");
```

Add `user` to that effect's dependency array and the import:

```tsx
import { loadGuestCrawlDoc, saveGuestCrawlDoc } from "../services/guestCrawlDoc";
```

- [ ] **Step 7: Build and test**

Run: `npm run build` → clean
Run: `npm test` → all suites pass

- [ ] **Step 8: Commit**

```bash
git add src/services/guestCrawlDoc.ts src/services/__tests__/guestCrawlDoc.test.ts firestore.rules src/pages/Route.tsx
git commit -m "Add 30-day server-side durability for guest crawls"
```

---

### Task 10: Guest quota exhaustion is a prompt, not an error

Past the global ceiling, an anonymous caller receives cached results only "plus a distinct response code the client renders as 'sign up to keep searching'" (spec §7.2). On a cache miss there are no cached results, so the client must turn the `GUEST_QUOTA` code into the prompt rather than a red toast.

**Files:**
- Modify: `src/services/apiClient.ts`
- Modify: `src/pages/Home.tsx`

**Interfaces:**
- Consumes: the `429 { code: "GUEST_QUOTA" }` response (Task 2); `GuestSignupPrompt` (Task 7)
- Produces: `ApiError` gains a `code?: string` field

- [ ] **Step 1: Carry the server's code through `ApiError`**

Two things are wrong for this purpose today: `ApiError` is **not exported** (`apiClient.ts:11`), and it carries no code. Replace the class:

```ts
export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = "ApiError";
  }
}
```

**Do not use constructor parameter properties (`public status: number`) here.** `tsconfig.app.json` sets `"erasableSyntaxOnly": true`, which bans them outright — the build fails. The explicit field-then-assign form above is what the existing class already uses.

The third parameter is optional, so the existing two-argument call sites (`new ApiError(401, "You must be signed in")`) keep compiling unchanged.

In the `!res.ok` branch, capture the code alongside the message:

```ts
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let code: string | undefined;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
      if (typeof body?.code === "string") code = body.code;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message, code);
  }
```

Keep the existing parse logic if it differs in shape — the requirement is only that `code` survives.

- [ ] **Step 2: Render the prompt instead of a failure**

In `src/pages/Home.tsx`, in the `catch` around the bar fetch inside `fetchBarsInArea`:

```tsx
Keep the existing `catch` body intact and add the quota branch ahead of it:

```tsx
      } catch (error) {
        // A guest who has exhausted the shared daily pool is not an error
        // state — it is the moment to ask for the account. The "search"
        // reason exists so the copy talks about searches running out rather
        // than claiming their crawl is at risk, which would not be true.
        if (error instanceof ApiError && error.code === "GUEST_QUOTA") {
          setGuestPrompt("search");
          return;
        }
        // …the existing error handling stays exactly as it is…
      }
```

Add the prompt state, the render and the imports, mirroring Task 7:

```tsx
import { ApiError } from "../services/apiClient";
import GuestSignupPrompt, { type GuestPromptReason } from "../components/GuestSignupPrompt";
```

```tsx
  const [guestPrompt, setGuestPrompt] = useState<GuestPromptReason | null>(null);
```

```tsx
      <GuestSignupPrompt
        open={guestPrompt !== null}
        reason={guestPrompt ?? "search"}
        onClose={() => setGuestPrompt(null)}
      />
```

- [ ] **Step 3: Build and test**

Run: `npm run build` → clean
Run: `npm test` → all suites pass

- [ ] **Step 4: Commit**

```bash
git add src/services/apiClient.ts src/pages/Home.tsx
git commit -m "Turn guest quota exhaustion into a signup prompt"
```

---

### Task 11: Flip the auth boundary

The switch that turns guest mode on. Small, last, and independently revertable — everything before it is inert.

It also removes the email-verification gate from the app surfaces (spec §9). Verification never protected live crawls anyway: **the invite link controls who joins a session, not the email address.** It is retained where it does real work — password reset and account recovery.

**Files:**
- Modify: `src/routes/AppRouter.tsx` (`/home`, `/route`)
- Modify: `src/routes/ProtectedRoute.tsx`
- Modify: `src/routes/PublicRoute.tsx`

**Interfaces:**
- Consumes: `isGuest` (Task 4)
- Produces: `/home` and `/route` public; `/live`, `/plan`, `/saved-crawls` require a **non-anonymous** user

- [ ] **Step 1: Make ProtectedRoute treat a guest as signed-out**

This is the trap: an anonymous user is a truthy `user`, so the existing `if (!user)` check would wave a guest straight through to `/live`. In `src/routes/ProtectedRoute.tsx`:

```tsx
const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  redirectTo = '/signup'
}) => {
  const { user, loading, isGuest } = useAuth();
  const location = useLocation();

  if (loading) {
    return <LoadingSpinner message="Checking authentication..." />;
  }

  // A guest IS a signed-in Firebase user, so `!user` alone would wave them
  // through. These routes need a real account. Guests are sent to signup
  // rather than signin: they have nothing to sign in to.
  if (!user || isGuest) {
    return (
      <Navigate
        to={redirectTo}
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  // Email verification is deliberately NOT a gate here (spec §9). Starting a
  // live crawl is the highest-intent moment in the product — route built,
  // account created, possibly already standing outside the bar — and bouncing
  // to an inbox there is the most expensive friction in the funnel. The invite
  // link controls who joins a session, not the email address. Verification is
  // retained where it does real work: password reset and account recovery.
  return <>{children}</>;
};
```

- [ ] **Step 2: Stop PublicRoute bouncing guests away from signup**

Without this, a guest who taps "Sign up" is redirected straight back to `/home` — guest mode would have no exit. In `src/routes/PublicRoute.tsx`:

```tsx
  const { user, loading, isGuest } = useAuth();
  const location = useLocation();

  if (loading) {
    return <LoadingSpinner message="Checking authentication..." />;
  }

  // A guest must be able to REACH the signup form — they are technically
  // signed in, so the old `if (user)` redirect would trap them in guest mode
  // forever. Only a real account gets sent onward.
  if (user && !isGuest) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from || redirectTo} replace />;
  }

  return <>{children}</>;
```

The unverified-email redirect is removed here for the same reason as Step 1.

- [ ] **Step 3: Open the two routes**

In `src/routes/AppRouter.tsx`, unwrap `/home` and `/route`:

```tsx
        <RouterRoute path="/home" element={<Home />} />
        <RouterRoute path="/route" element={<Route />} />
```

Leave `/live`, `/plan` and `/saved-crawls` exactly as they are. `/plan` is only ever reached by an explicit action from `/route` (`Route.tsx:680`), so gating it does not break the preview.

- [ ] **Step 4: Build and test**

Run: `npm run build` → clean
Run: `npm test` → all suites pass

- [ ] **Step 5: Work through the manual verification checklist below**

Do not skip this. It is the only end-to-end coverage this phase has.

- [ ] **Step 6: Commit**

```bash
git add src/routes/AppRouter.tsx src/routes/ProtectedRoute.tsx src/routes/PublicRoute.tsx
git commit -m "Open /home and /route to guests and drop the verification gate"
```

---

## Manual Verification

The repo has no E2E harness (spec §13), so this phase is verified by hand, as `4831105` was. Run on a **preview deployment** first. The Mapbox basemap 403s on `*.vercel.app` (URL allowlist) — that is expected and does not invalidate anything; bars, the proxy and Firestore all work.

**Guest happy path**
- [ ] Open `/home` in a fresh private window. Bars paint without a signup wall.
- [ ] Firebase Console → Authentication shows a new user with **no provider** and `isAnonymous`.
- [ ] Select 3 bars → Generate → `/route` renders an optimised route.
- [ ] Refresh `/route`. The crawl comes back (not a bounce to `/home`).

**Cost controls**
- [ ] Before and after a guest session, count `barCacheV5` docs. Searching a **seeded metro** must not add a doc. (Baseline 2026-09-22: 488 total, 33 seeded.)
- [ ] With Task 5 in, an IP-geo centre inside a seeded metro must produce a cache hit, not a Places call.
- [ ] Make 6 distinct guest searches inside a minute → the 6th returns 429.
- [ ] Confirm `rateLimits/_anonGlobal` increments **only** on cache misses.
- [ ] Sign in with a real account and confirm it still gets 10/min — guests must never throttle a real user.

**Upgrade path — the one that will break**
- [ ] Guest builds a crawl → Save → signs up with a **new** email. Same uid before and after (check Firebase Console). Crawl still on screen.
- [ ] Guest builds a crawl → Save → signs up with an **email that already has an account**. Expect: signed into the existing account, crawl replayed, no dead end. This is the path spec §5 says will definitely occur.
- [ ] Same two cases via Google (`linkWithPopup`, then `auth/credential-already-in-use`).
- [ ] After upgrading, `/live` and `/saved-crawls` are reachable **without** an email-verification detour.

**Boundary**
- [ ] Guest navigating directly to `/live`, `/plan`, `/saved-crawls` lands on `/signup`, **not** `/verify-email`.
- [ ] Guest tapping "Sign up" reaches the form and is not bounced to `/home`.
- [ ] A returning signed-in user opening `/home` stays signed in — no anonymous account is minted over their session. (This is the `loading` race from Task 4; test it on a slow connection with a hard refresh.)
- [ ] Guest opening a shared `/route?crawlId=…` link works, per Decision 1.

**Mobile**
- [ ] Guest flow at 375px: the signup prompt fits, the bottom sheets still behave, nothing clips.

## What This Phase Deliberately Does Not Do

- **No funnel instrumentation.** That is Phase 2 (spec §10), and spec §12a says it can land with or before Phase 1. **Recommendation: land Phase 2 first or alongside.** `wasGuest` on `signup_completed` is the only measurement that answers whether guest mode beat the cold wall; shipping Phase 1 without it means re-running the whole judgement on inference. Task 8 already computes `wasGuest` and parks it, so Phase 2 is a one-line change at that site.
- **No anonymous-account cleanup job.** Spec §5 defers it: anonymous users with no linked provider and no activity after 60 days should be deleted by a scheduled job. Not required for launch; required before this runs at volume.
- **No pre-signup share link.** Decided against in spec §14.2.
- **No retention work.** Guest mode gets more people to first value and does nothing about the 1-in-10 return rate. Separate problem, separate work.
