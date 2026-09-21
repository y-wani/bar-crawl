# Guest Mode — Design Spec

**Date:** 2026-09-21
**Status:** Draft for review
**Supersedes:** nothing. Extends the first-run activation work in `4831105`.

---

## 1. Why

A Reddit launch on 2026-09-20 produced 66 visitors in 24h — more than the
previous 30 days combined (25). The funnel it exposed:

```
66 landing  →  20 signup (30%)  →  6 accounts (30%)  →  0 saved crawls
```

Six accounts were created. **Zero** saved a crawl, started a live crawl, or
returned. Separately, ~60 of 66 visitors were lost before an account existed,
and every substantive Reddit comment named the same cause: the signup wall.

Two caveats that shape this spec:

- **The activation number is contaminated.** Commit `4831105` (IP-geo centre,
  no blocking permission modal) reached production only at the tail of that
  traffic window. Essentially all 6 accounts hit the *old* build — a permission
  dialog stacked over a map of Columbus, Ohio. 0% activation was measured on a
  bug that is now fixed, so it should be re-measured, not treated as settled.
- **Signup completion is not the leak.** It held at 30% across both the small
  (n=10) and larger (n=20) samples. People who start the form finish it. The
  losses are *before* the form and *after* the account.

Guest mode addresses the first loss. It does not address the second, and we
should not expect it to.

## 2. Goals

1. A first-time visitor can search bars, select them, optimise a route, and see
   that route **without creating an account**.
2. The crawl they build survives signup intact — the same uid, the same crawl.
3. Places API spend stays bounded under a traffic spike.
4. The funnel becomes observable end to end, including whether guest mode
   converts better than the cold wall.

## 3. Non-goals

- Removing accounts. Save, live crawl, plan lobby and recap stay gated.
- Retention. Guest mode gets more people to first value; it does nothing about
  the 1-in-10 return rate. Separate problem, separate work.
- Redesigning the landing page.

## 4. Architecture

### 4.1 The core decision: gate the expensive thing

Minting an anonymous Firebase user is free. A Google Places call is billed. So
the gate belongs on the Places call, not on the account and not on the bars.

```
/home load    →  IP-geo (api/geo)  →  mint anon user  →  read barCache  →  bars painted
                                                          [no Places charge]

custom search →  cache lookup  →  MISS  →  live Places call  →  [billed, capped]
                                  HIT   →  [no charge]
```

This reverses an earlier "mint lazily on first search" position. Lazy minting
was rejected because `firestore.rules:30` requires `request.auth != null` to
read `barCacheV5` — an unauthenticated guest cannot read cached bars at all, so
lazy minting would reproduce the empty-first-view regression that the Reddit
thread was unanimous about.

### 4.2 Auth boundary

| Route | Before | After |
|---|---|---|
| `/home` | ProtectedRoute | **Public** |
| `/route` | ProtectedRoute | **Public** |
| `/live` | ProtectedRoute | ProtectedRoute |
| `/plan` | ProtectedRoute | ProtectedRoute |
| `/saved-crawls` | ProtectedRoute | ProtectedRoute |

Confirmed safe: `/plan` is created by an explicit action *from* `/route`
(`Route.tsx:679-680`, beside `handleStartCrawl`). Route building never touches
it, so gating `/plan` does not break the preview.

`SidebarHeader` already guards with `{user && …}`. `Home` needs an audit for
remaining non-null `user` assumptions.

## 5. Anonymous auth lifecycle

**Mint:** `signInAnonymously(auth)` on `/home` mount, before the first cache
read. Idempotent — reuse `auth.currentUser` when one exists.

**Upgrade on signup:**
- Email → `linkWithCredential(auth.currentUser, EmailAuthProvider.credential(...))`
- Google → `linkWithPopup(auth.currentUser, googleProvider)`

The uid is preserved, so anything written under it is already theirs. No
migration step.

**The failure path that will definitely occur.** A returning user builds a
crawl as a guest, hits save, and linking fails with `auth/email-already-in-use`
(or `auth/credential-already-in-use` for Google). This must:

1. Catch the error
2. Sign in normally to the existing account
3. Replay the guest crawl from local storage under the existing uid
4. Discard the orphaned anonymous user

Without this, the most engaged returning visitors hit a dead end at the exact
moment of conversion.

**Metrics hygiene.** Anonymous users have empty `providerUserInfo` in the
Identity Toolkit response, so the existing audit script already buckets them
separately as `none`. Real-account counts stay clean. Any dashboard or query
reporting "users" must exclude `isAnonymous`.

**Cleanup.** Anonymous accounts with no linked provider and no activity after
60 days are deleted by a scheduled job. Not required for launch; required
before this runs at volume.

## 6. Guest crawl persistence

Today crawl state lives only in `location.state` (`Route.tsx:297`) and dies on
refresh. That must change for the save prompt to be honest.

### 6.1 Two layers

**Layer 1 — client (primary).** `localStorage['bh_guest_crawl']`:

```ts
{
  selectedBars: SavedBarData[],
  mapCenter: [number, number],
  searchRadius: number,
  name?: string,
  updatedAt: number   // epoch ms
}
```

Written on selection change and on navigate to `/route`. `Route.tsx` reads it
whenever `location.state` is absent. **No TTL.** Expiring a user's own work to
pressure them into signing up is a dark pattern and is explicitly rejected.

Side benefit: this fixes refresh-loses-your-crawl for signed-in users too,
which is a live bug.

**Layer 2 — server (the occasion case).** A `guestCrawls/{anonUid}` doc,
**30-day** expiry, written once the guest has ≥2 bars selected.

This exists because of a platform constraint, not a product preference:
**Safari's ITP evicts localStorage and IndexedDB after 7 days without site
interaction, and iOS is 48% of traffic.** BarHop is plan-ahead-for-an-occasion
software — a bachelor party gets planned three weeks out. Client-side storage
alone would silently lose those crawls on the majority platform, precisely in
the use case the product is for.

### 6.2 Copy

The nudge is framed on what is actually true, not on an expiry we impose:

> "This crawl is only on this device — save it so it's there on the night."

## 7. Cost controls

### 7.1 Per-uid cap

`verifyIdToken` (`api/proxy.ts:58`) currently returns only `payload.sub`. It
must also return `payload.firebase.sign_in_provider`, so the proxy can tell an
anonymous caller from a real one.

Anonymous uids get a tighter daily Places-search budget than real accounts
(exact numbers TBD at implementation against current usage, but materially
lower — enough for a genuine trial, not enough to be a free API).

### 7.2 Global anonymous ceiling

A counter doc `rateLimits/_anonGlobal` tracking anonymous Places calls per UTC
day. Past the ceiling, anonymous callers receive cached results only, plus a
distinct response code the client renders as "sign up to keep searching."
Real accounts are unaffected — a spike degrades the guest experience, never the
experience of people who already committed.

### 7.3 Non-negotiable prerequisites

- **App Check enforced** (`APPCHECK_ENFORCE=true`). Already scaffolded and
  dormant. This is the control that stops bulk anonymous-uid minting from
  outside a real browser, and without it the per-uid cap is trivially bypassed.
- **GCP billing alarm** on the Places API.

Neither is optional once guests can spend the Places budget.

## 8. Metro cache seeding (prerequisite)

`POPULAR_LOCATIONS` (`src/hooks/useCacheManager.ts:18`) currently holds 8 US
cities: Columbus, NYC, LA, Chicago, Miami, Austin, Portland, Nashville.
`barCacheV5` holds 435 docs. There is **no UK coverage** despite the UK being
8% of traffic.

Cache-on-load only avoids an empty first view where the cache actually covers.
Outside these 8 cities a guest gets a miss, and a miss on load is either an
empty map (the regression we are fixing) or an uncapped Places call on every
visit (the cost we are avoiding).

**Required:** expand the seed list to match real traffic geography — top ~25 US
metros plus the main UK cities — and run the seeding job before guest mode
ships. One-time Places cost, budgeted and executed deliberately rather than
incurred one visitor at a time.

This gates the whole approach. It is work, not an assumption.

## 9. Email verification

Verification is removed as a gate on anything a user came to do.

| Surface | Verification required? |
|---|---|
| `/home`, `/route`, save a crawl | No |
| Start a live crawl | **No** (changed) |
| `/plan` | No |
| Password reset / account recovery | Yes — unchanged |

Rationale: starting a live crawl is the highest-intent moment in the product —
route built, account created, about to walk out the door, possibly already at
the bar. Bouncing to an inbox there is the most expensive friction in the
funnel. Verification never protected that surface anyway: **the invite link
controls who joins a session, not the email address.**

Two supporting moves:
- Make Google/OAuth the visually primary signup option at the save and
  start-crawl moments — pre-verified, one tap, no inbox trip.
- Ask for verification at a genuinely low-intent moment after the crawl
  ("verify your email to get your recap sent to you").

Verification is retained where it does real work: account recovery.

## 10. Instrumentation

New events in `src/utils/analytics.ts`:

| Event | Props | Answers |
|---|---|---|
| `landing_cta_click` | `position` | Which CTA earns the click |
| `guest_search` | `cached: boolean` | Guest engagement + cache hit rate |
| `guest_bars_selected` | `count` | Do guests build anything |
| `guest_route_built` | `stops` | Did they reach the payoff |
| `save_prompt_shown` | — | Loss-aversion moment reached |
| `signup_started` | `wasGuest` | Form entry |
| `signup_failed` | `code`, `wasGuest` | Where the form breaks |
| `signup_completed` | `method`, `wasGuest` | **Does guest mode convert better** |
| `guest_crawl_restored` | `stops` | Did the upgrade actually preserve it |

`wasGuest` on `signup_completed` is the point of the whole taxonomy: it
measures guest mode against the cold wall directly rather than by inference.

Note this reverses an earlier position that funnel instrumentation was
premature. That was correct at 25 visitors/month and is not correct at 66/day.

## 11. Repositioning (parallel, no code dependency)

Move the hero, meta description and OG tags off "discover bars near you" — a
proposition ChatGPT beats — and onto the actual wedge: **automatic
shortest-route planning and live group coordination.** Travel planning surfaced
organically as a use case in the Reddit thread and is worth leaning into.

Ships independently and first; it has no dependency on any of the above.

## 12. Risks

| Risk | Mitigation |
|---|---|
| Anonymous uid flood → Places spend | App Check + per-uid cap + global ceiling |
| Link failure at conversion | Explicit fallback path (§5) — must be tested |
| Seeding cost | One-time, budgeted, run deliberately |
| iOS ITP eviction | 30-day server doc (§6.1) |
| Places ToS on cached data | Cache stays auth-gated; guests read it as minted users, so no unauthenticated redistribution |
| Guest mode ships, activation still 0 | Expected possibility — the activation bug fix is unmeasured. Re-measure before concluding guest mode failed |

## 12a. Sequencing

This spec is larger than one implementation plan. It decomposes into four
pieces, and the ordering is load-bearing — Phase 0 is not optional polish, it
is what stops Phase 1 from either showing empty maps or billing per visitor.

| Phase | Contents | Blocks |
|---|---|---|
| **0 — Prerequisites** | Metro cache seeding (§8), App Check enforcement, GCP billing alarm | Phase 1 |
| **1 — Guest mode core** | Auth boundary (§4.2), anon lifecycle + upgrade path (§5), crawl persistence (§6), caps (§7) | — |
| **2 — Instrumentation** | Event taxonomy (§10) | Nothing; can land with or before Phase 1 |
| **P — Repositioning** | Copy/meta (§11) | Nothing; ship immediately |

Caps (§7) must ship *inside* Phase 1, not after it. Guest mode without a
ceiling is the uncapped option that was explicitly rejected.

Phase P has no dependencies and should go out before any of this is built.

## 13. Out of scope

Retention work, landing page redesign, SEO city pages, P2P/hosting-cost
experiments, test harness (this repo has none — verification for this work will
be manual, as it was for `4831105`).

## 14. Open questions

1. Exact per-uid and global cap numbers — set at implementation against
   observed usage.
2. Whether the 30-day server doc also backs a pre-signup share link, or stays
   purely a durability layer.
3. Seed list composition — needs a look at Vercel geography beyond the
   US/UK/CA/DE/FR split already observed.
