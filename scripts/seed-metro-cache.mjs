// Seeds barCacheV5 with bars for every metro in SEED_METROS.
//
// SPENDS REAL MONEY when run with --live: this mirrors api/proxy.ts's
// fetchNearbyBars multi-pass fan-out (bar/wine_bar x2 rank passes, pub,
// night_club — 4 Places nearby-search calls per metro), so a full run is
// ~4 x 33 = ~132 calls, not 33. Run deliberately, not on a schedule and
// not from CI.
//
// Default (no flags, or --dry-run): parses metros and previews the run.
// Zero Places calls, zero writes. This is the safe default specifically so
// a typo'd flag or a forgotten `--` in `npm run seed:metros -- --dry-run`
// can never fall through to the money-spending path.
//
//   node --env-file=.env scripts/seed-metro-cache.mjs
//   node --env-file=.env scripts/seed-metro-cache.mjs --dry-run
//
// Only --live spends money and writes:
//
//   node --env-file=.env scripts/seed-metro-cache.mjs --live
//
// Any other argv token is a hard, non-zero-exit abort (no silent fallback).
//
// Writes are idempotent: each metro's doc ID is deterministic
// (`seed-<slugified-metro-name>`, e.g. `seed-columbus-oh`), written via
// Firestore PATCH. Re-running --live refreshes each metro's doc in place
// instead of minting a new auto-ID row and doubling the collection.
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

// --- argv handling -----------------------------------------------------
// Dry-run is the default; spending requires the explicit --live flag.
// Any unrecognised token hard-aborts rather than being silently ignored,
// so a typo (--dryrun, --dry_run, -dry-run) can never be misread as a
// request to spend money.
const ACCEPTED_FLAGS = new Set(['--dry-run', '--live']);
const argv = process.argv.slice(2);
for (const arg of argv) {
  if (!ACCEPTED_FLAGS.has(arg)) {
    console.error(
      `Unrecognised flag: ${arg}\n` +
      'Accepted flags:\n' +
      '  --dry-run  preview only (default) — zero Places calls, zero writes\n' +
      '  --live     spend real Places API quota and write to Firestore'
    );
    process.exit(1);
  }
}
if (argv.includes('--dry-run') && argv.includes('--live')) {
  console.error('Conflicting flags: --dry-run and --live cannot both be set.');
  process.exit(1);
}
const LIVE = argv.includes('--live');
const DRY_RUN = !LIVE;

// Mirrors api/proxy.ts's fetchNearbyBars multi-pass fan-out, so the seeded
// cache matches what a live user actually gets (six UK metros in particular
// are close to worthless without the dedicated `pub` pass).
const PLACES_PASSES = [
  { types: ['bar', 'wine_bar'], rank: 'POPULARITY' },
  { types: ['bar', 'wine_bar'], rank: 'DISTANCE' },
  { types: ['pub'], rank: 'POPULARITY' },
  { types: ['night_club'], rank: 'POPULARITY' },
];

// Parse the metro list straight out of the TS source — one source of truth,
// no build step, no duplicated coordinates.
//
// seedMetros.ts references its default city (Columbus, OH) via the bare
// DEFAULT_SEED_METRO identifier inside the SEED_METROS array literal, rather
// than repeating it as an object literal. That means this function has to
// scan the WHOLE file text (not just an isolated `SEED_METROS = [...]`
// slice) and separately match the `DEFAULT_SEED_METRO` declaration line to
// find all 33 entries. If anyone later "cleans up" this regex to scope it to
// just the array slice, it would silently find 32 and drop Columbus — the
// default city. The assertion below turns that silent failure into a loud
// one on every run, dry or live.
const parseMetros = () => {
  const src = readFileSync(new URL('../src/data/seedMetros.ts', import.meta.url), 'utf8');
  const out = [];
  const re = /\{\s*name:\s*"([^"]+)",\s*lat:\s*(-?[\d.]+),\s*lng:\s*(-?[\d.]+)\s*\}/g;
  let m;
  while ((m = re.exec(src))) out.push({ name: m[1], lat: +m[2], lng: +m[3] });

  const names = out.map((metro) => metro.name);
  const unique = new Set(names);
  const hasColumbus = names.includes('Columbus, OH');
  if (out.length !== 33 || unique.size !== names.length || !hasColumbus) {
    throw new Error(
      `Expected 33 unique metros from seedMetros.ts, got ${out.length} — the parse regex no longer matches the file's formatting.`
    );
  }

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

const searchNearbyOnce = async (metro, includedPrimaryTypes, rankPreference) => {
  const r = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.location,places.rating,places.userRatingCount,places.priceLevel,places.formattedAddress',
    },
    body: JSON.stringify({
      includedPrimaryTypes,
      maxResultCount: 20,
      rankPreference,
      locationRestriction: {
        circle: {
          center: { latitude: metro.lat, longitude: metro.lng },
          radius: Math.min(50000, Math.max(1000, RADIUS_METERS)),
        },
      },
    }),
  });
  if (!r.ok) throw new Error(`places ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).places ?? [];
};

// Runs all PLACES_PASSES for one metro (mirroring fetchNearbyBars in
// api/proxy.ts), dedupes by place id, and reports how many calls were
// actually made so the summary doesn't just assume one-per-metro.
const fetchMetroBars = async (metro) => {
  const results = await Promise.allSettled(
    PLACES_PASSES.map((pass) => searchNearbyOnce(metro, pass.types, pass.rank))
  );
  const callsMade = results.length; // every pass is a real request, made whether it then resolved or rejected
  const seen = new Set();
  const places = [];
  let anySucceeded = false;
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    anySucceeded = true;
    for (const p of result.value) {
      if (p.id && !seen.has(p.id)) {
        seen.add(p.id);
        places.push(p);
      }
    }
  }
  if (!anySucceeded) {
    const firstError = results.find((r) => r.status === 'rejected');
    throw firstError?.reason ?? new Error('All Places passes failed');
  }
  return { places, callsMade };
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

// Same haversine distance calc as milesBetween in api/proxy.ts.
const milesBetween = (lat1, lon1, lat2, lon2) => {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// Same enum -> short text mapping as PRICE_TEXT in api/proxy.ts. The UI
// (BarListItem.tsx, MapContainer.tsx) reads `priceText` ("$"-"$$$$"), not
// the raw `priceLevel` enum, so that's what gets written.
const PRICE_TEXT = {
  PRICE_LEVEL_INEXPENSIVE: '$',
  PRICE_LEVEL_MODERATE: '$$',
  PRICE_LEVEL_EXPENSIVE: '$$$',
  PRICE_LEVEL_VERY_EXPENSIVE: '$$$$',
};

// Deterministic per-metro doc ID: "New York, NY" -> "seed-new-york-ny".
const slugify = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const toAppBar = (p, metro) => {
  const lat = p.location.latitude;
  const lng = p.location.longitude;
  const priceText = p.priceLevel ? PRICE_TEXT[p.priceLevel] : undefined;
  const bar = {
    id: p.id,
    name: p.displayName?.text ?? 'Unknown',
    address: p.formattedAddress ?? '',
    rating: p.rating ?? 0,
    userRatingCount: p.userRatingCount ?? 0,
    // Bar.distance / SavedBarData.distance are non-optional and Firestore
    // is initialised without ignoreUndefinedProperties, so an undefined
    // distance here would throw "Unsupported field value: undefined" the
    // first time a user saves a crawl built from a seeded bar.
    distance: milesBetween(metro.lat, metro.lng, lat, lng),
    location: { type: 'Point', coordinates: [lng, lat] },
  };
  if (priceText) bar.priceText = priceText;
  return bar;
};

const main = async () => {
  const metros = parseMetros();
  const projectedCalls = metros.length * PLACES_PASSES.length;
  console.log(`${metros.length} metros${DRY_RUN ? ' (DRY RUN — no Places calls, no writes)' : ''}`);
  if (DRY_RUN) {
    metros.forEach((m) => console.log(`  would seed ${m.name} (${m.lat}, ${m.lng})`));
    console.log(`\nWould make ${projectedCalls} Places calls (${PLACES_PASSES.length} passes x ${metros.length} metros).`);
    return;
  }

  const token = await getAccessToken();
  const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  let ok = 0, zeroBars = 0, errored = 0, totalCalls = 0;

  for (const metro of metros) {
    try {
      const { places, callsMade } = await fetchMetroBars(metro);
      totalCalls += callsMade;

      // A place missing id/location would throw inside toAppBar after the
      // (already paid for) call, so filter before mapping, not after.
      const valid = places.filter((p) => p.id && p.location);
      const bars = valid
        .map((p) => toAppBar(p, metro))
        .filter((b) => b.rating > 0 || b.userRatingCount > 0)
        .sort((a, b) => a.distance - b.distance);

      if (!bars.length) {
        console.log(`  ⚠ ${metro.name}: 0 bars returned (no rated results across ${callsMade} passes), skipping`);
        zeroBars++;
        continue;
      }

      const fields = {
        centerLat: val(metro.lat),
        centerLng: val(metro.lng),
        radius: val(RADIUS_MILES),
        location: val(metro.name),
        seeded: val(true),
        bars: val(bars),
        fetchedAt: { timestampValue: new Date().toISOString() },
      };
      const docId = `seed-${slugify(metro.name)}`;
      // PATCH to a deterministic doc ID (no updateMask = full replace) so
      // re-running refreshes the same 33 docs instead of POSTing fresh
      // auto-ID docs and doubling the collection (and the spend) each run.
      const r = await fetch(`${FS_BASE}/${COLLECTION}/${docId}`, {
        method: 'PATCH', headers: H, body: JSON.stringify({ fields }),
      });
      if (!r.ok) throw new Error(`firestore ${r.status}: ${(await r.text()).slice(0, 200)}`);
      console.log(`  ✓ ${metro.name}: ${bars.length} bars (doc ${docId}, ${callsMade} calls)`);
      ok++;
    } catch (err) {
      console.error(`  ✗ ${metro.name}: ${err.message}`);
      errored++;
    }
  }
  console.log(`\nSeeded ${ok}, zero-bar ${zeroBars}, errored ${errored}, ${totalCalls} Places calls made.`);
};

main().catch((e) => { console.error(e); process.exit(1); });
