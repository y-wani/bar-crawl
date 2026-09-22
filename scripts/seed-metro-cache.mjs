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
