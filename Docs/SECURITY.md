# Security & abuse protection

## Why this exists

BarHop is a client-side SPA, so anything compiled into the browser bundle is
public. Previously the **Google Places** and **Gemini** API keys were shipped to
the browser (`VITE_*`). HTTP-referrer restrictions don't stop a scripted
attacker (the `Referer`/`Origin` header is trivially forged), so a leaked key
can be called directly against Google — which is what drained the billing
budget.

## The fix: an auth-gated serverless proxy

The billed calls now go through Vercel serverless functions in `/api`:

| Endpoint              | Replaces (client) | Google API it proxies        |
| --------------------- | ----------------- | ---------------------------- |
| `POST /api/places/nearby` | `fetchNearbyBars`   | Places `searchNearby` (×4 fan-out) |
| `POST /api/places/text`   | `searchPlaceByText` | Places `searchText`          |
| `POST /api/ai/clean`      | `cleanBarListWithAI`| Gemini `generateContent`     |

Each request must carry a valid Firebase ID token
(`Authorization: Bearer <token>`); the proxy verifies it with `firebase-admin`
before spending. The keys live only in **server** env vars and never reach the
browser (verified: the keys no longer appear in `dist/`).

### Shared cache is server-owned

`barCacheV5` is **read-only to clients** (`firestore.rules`); writes happen only
in the proxy via the Admin SDK (`api/_lib/cache.ts`). The `nearby` endpoint
checks the cache *before* calling Google and writes it *after*, so a client that
bypasses its own cache check still rarely bills a Places request, and no
signed-in user can poison the shared cache with fabricated venues. The old
client-side popular-city prefetch is disabled on the Places path (it billed
Google for unvisited cities); the proxy populates the cache from real searches.

### Rate limits (per user, enforced in `api/_lib/guard.ts`)

| Endpoint        | Per minute | Per day |
| --------------- | ---------- | ------- |
| `places-nearby` | 10         | 80      |
| `places-text`   | 60         | 300     |
| `ai-clean`      | 8          | 40      |

Counters live in the Firestore `rateLimits/{uid}` doc, written via the Admin SDK
(bypasses security rules; clients cannot read or tamper with them). Adjust the
numbers in the endpoint files.

## Deploy checklist (do these BEFORE deploying — or prod search breaks)

### 1. Rotate the leaked Google Places key
Cloud Console → APIs & Services → Credentials → delete/regenerate the old
Places key. The old one is public forever.

### 2. Set the server env vars in Vercel
Project → Settings → Environment Variables (Production + Preview). These are
**not** prefixed `VITE_`:
- `GOOGLE_PLACES_API_KEY` = the rotated key
- `GEMINI_API_KEY` = the Gemini key
- `FIREBASE_SERVICE_ACCOUNT` = service-account JSON on one line
  (Firebase Console → Project settings → Service accounts → Generate new private
  key; paste the whole JSON, with `private_key` newlines as `\n`).

Public client flags (these stay `VITE_`):
- `VITE_GOOGLE_PLACES_ENABLED=true`
- `VITE_GEMINI_ENABLED=true`
- `VITE_MAPBOX_ACCESS_TOKEN=...` (still client-side — see step 5)

### 3. Cap the billing damage (defense in depth)
- Cloud Console → APIs & Services → each API → **Quotas**: set realistic daily
  request caps on Places `searchNearby` / `searchText` (NOT 0 — that breaks the
  app; pick a number above normal usage).
- Cloud Billing → **Budgets & alerts**: budget with email alerts at 50/90/100%.

### 4. Restrict the new server key
**Application restriction = None.** ⚠️ A newly created key often defaults to
"HTTP referrers" — leave that on and the proxy's server-to-server calls get
`403 API_KEY_HTTP_REFERRER_BLOCKED` (no referer header). The key is called
server-side now and Vercel egress IPs rotate, so IP-allowlisting is impractical
too — the proxy's auth + rate limit + the quota cap are the real gate.
API restriction = Places API (New) + Geocoding only.

### 5. Restrict the Mapbox token
Mapbox GL needs its token client-side, so it can't be proxied. In the Mapbox
account, add a **URL restriction** to the public token
(`https://bar-crawl.vercel.app/*`) and scope it to public styles/tiles only.

### 6. (Recommended) Firebase App Check
Enable App Check (reCAPTCHA Enterprise / v3) so only your real app — not a
scripted client with a stolen token — can call Firebase and the proxy.

## Local development

Plain `vite` does NOT run the `/api` functions, so bar search won't work under
`npm run dev`. To exercise the proxy locally, run `vercel dev` with the server
env vars set in `.env`. (Alternatively set `VITE_GOOGLE_PLACES_ENABLED=false` to
fall back to the Mapbox category search.)
