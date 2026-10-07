#!/usr/bin/env node
//
// scripts/load-test-live.mjs — can one live crawl hold a big group?
//
//   npm run loadtest:live                          # 25 people, 3 minutes
//   npm run loadtest:live -- --members 40 --minutes 5
//   npm run loadtest:live -- --keep                # leave the session + its docs
//   npm run loadtest:live -- --members 50 --yes    # allow a run over READ_BUDGET
//
// READS ARE THE COST. Every position goes to every member's listener, so a
// run reads roughly members² × minutes × 5 documents. On 2026-10-07 a series
// of runs (~125k reads) used up the free plan's 50,000 reads/day and took
// PRODUCTION Firestore down ("429 Quota exceeded") until the daily reset.
// Runs estimated above READ_BUDGET refuse to start without --yes; check the
// project's plan and today's usage first.
//
// Every group on an org crawl gets its OWN crawlSessions doc, so twenty groups
// never compete with each other. The risk is inside one big group. Firestore
// sustains about one write per second per document, and positions used to go
// into the session doc itself. Measured on that old design (2026-10-07): 25
// people fine, 35 lagging by seconds, 50 a minute behind with ZERO errors.
// Positions and walked miles now go to presence/{uid}, one doc per member,
// and this plays one group exactly the way the app does today:
//
//   - N test users (one Firebase app each, like N phones): fixed uids
//     loadtest-0…N signed in with custom tokens minted from the service
//     account, so the same accounts are reused every run. Fresh anonymous
//     accounts hit Firebase's ~100 sign-ups/hour/IP limit after one big run.
//   - the host starts the Denver crawl; everyone joins at once through the
//     real self-join rule (sessionService.joinSession's exact write)
//   - each member publishes a position (with their walked miles riding
//     along) every 12 s to their own presence doc (LiveCrawl.tsx); the host
//     checks in at each stop in turn, on the session doc
//   - every member listens to the session doc AND the presence collection,
//     like the open /live page
//
// It reports write latency and errors, how long a position takes to reach
// the other members, and the snapshot reads the group generated (billed).
//
// Uses the client SDK on purpose, so the security rules apply. App Check only
// guards the /api proxy, not Firestore. Writes to PRODUCTION Firestore; it
// deletes the session and its presence docs when it finishes (unless --keep).
// Needs FIREBASE_SERVICE_ACCOUNT (.env) to mint the sign-in tokens.

import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, signInWithCustomToken } from "firebase/auth";
import { SignJWT, importPKCS8 } from "jose";
import {
  getFirestore,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  setDoc,
  deleteDoc,
  collection,
  onSnapshot,
  arrayUnion,
  serverTimestamp,
  terminate,
} from "firebase/firestore";

// Same public web config as src/firebase/config.ts.
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCLWeKgrI_7OHGbyBFtQUVYDQWESwF2cps",
  authDomain: "bar-crawl-planner-5985f.firebaseapp.com",
  projectId: "bar-crawl-planner-5985f",
  storageBucket: "bar-crawl-planner-5985f.firebasestorage.app",
  messagingSenderId: "235279583042",
  appId: "1:235279583042:web:f740344412b3381180aadb",
};
const DENVER_CRAWL_ID = "1cgU2a8Pc7Xd2ajDFe9l";
// Mirrors LiveCrawl.tsx.
const POSITION_PUBLISH_MS = 12000;

// --- argv ----------------------------------------------------------------
const args = process.argv.slice(2);
const opts = { members: 25, minutes: 3, keep: false, yes: false, crawl: DENVER_CRAWL_ID };
const READ_BUDGET = 5000;
for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (a === "--keep") opts.keep = true;
  else if (a === "--yes") opts.yes = true;
  else if (a === "--members" && /^\d+$/.test(args[i + 1] ?? "")) opts.members = Number(args[++i]);
  else if (a === "--minutes" && /^\d+(\.\d+)?$/.test(args[i + 1] ?? "")) opts.minutes = Number(args[++i]);
  else if (a === "--crawl" && args[i + 1]) opts.crawl = args[++i];
  else {
    console.error(`Unknown argument: ${a}\nUsage: npm run loadtest:live -- [--members N] [--minutes M] [--crawl ID] [--keep]`);
    process.exit(1);
  }
}
if (opts.members < 2 || opts.members > 80) {
  console.error("--members must be 2–80.");
  process.exit(1);
}
// Each member publishes every 12 s and every other member's listener reads it.
const estimatedReads = Math.round(opts.members * (opts.members - 1) * (opts.minutes * 60 / 12));
if (estimatedReads > READ_BUDGET && !opts.yes) {
  console.error(
    `This run would read about ${estimatedReads.toLocaleString()} documents from PRODUCTION Firestore ` +
      `(budget ${READ_BUDGET.toLocaleString()}). On the free plan the whole app stops at 50,000 reads/day.
` +
      "Check the plan and today's usage, then re-run with --yes."
  );
  process.exit(1);
}
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error("FIREBASE_SERVICE_ACCOUNT is not set (expected in .env; run via npm run loadtest:live).");
  process.exit(1);
}

// A Firebase custom token: a JWT signed by the service account. Signing in
// with one creates the user on first use and reuses it after that.
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const signingKey = await importPKCS8(serviceAccount.private_key.replace(/\\n/g, "\n"), "RS256");
const customToken = (uid) => {
  const iat = Math.floor(Date.now() / 1000);
  return new SignJWT({ uid })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(serviceAccount.client_email)
    .setSubject(serviceAccount.client_email)
    .setAudience("https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit")
    .setIssuedAt(iat)
    .setExpirationTime(iat + 3600)
    .sign(signingKey);
};

// --- measurement ------------------------------------------------------------
const now = () => performance.now();
const writeStats = new Map(); // kind → { lat: number[], errors: Map<code, n> }
const record = (kind, ms, error) => {
  if (!writeStats.has(kind)) writeStats.set(kind, { lat: [], errors: new Map() });
  const s = writeStats.get(kind);
  if (error) {
    const code = error.code ?? error.message ?? "unknown";
    s.errors.set(code, (s.errors.get(code) ?? 0) + 1);
  } else {
    s.lat.push(ms);
  }
};
const timed = async (kind, fn) => {
  const t = now();
  try {
    await fn();
    record(kind, now() - t);
  } catch (error) {
    record(kind, now() - t, error);
  }
};

// Each published position is unique, so a listener can tell exactly which
// write it is seeing and how long it took to arrive.
const sentPositions = new Map(); // "lng,lat" → { uid, sentAt }
const propagationMs = [];
let serverSnapshots = 0;
let listenerErrors = 0;

const pct = (xs, p) => {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};
const fmt = (ms) => (ms == null ? "—" : ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`);

// --- members ---------------------------------------------------------------
const log = (msg) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);

const makeMember = async (i) => {
  const app = initializeApp(FIREBASE_CONFIG, `loadtest-${i}-${Date.now()}`);
  const auth = getAuth(app);
  const cred = await signInWithCustomToken(auth, await customToken(`loadtest-${i}`));
  return { i, app, auth, db: getFirestore(app), uid: cred.user.uid, name: `Load ${i}` };
};

log(`Signing in ${opts.members} test users…`);
const members = [];
for (let start = 0; start < opts.members; start += 5) {
  const batch = await Promise.allSettled(
    Array.from({ length: Math.min(5, opts.members - start) }, (_, k) => makeMember(start + k))
  );
  for (const r of batch) {
    if (r.status === "fulfilled") members.push(r.value);
    else log(`  sign-in failed: ${r.reason?.code ?? r.reason?.message}`);
  }
}
if (members.length < 2) {
  console.error("Not enough guests signed in to run a group (see errors above).");
  process.exit(1);
}
if (members.length < opts.members) log(`Continuing with ${members.length} guests.`);

const host = members[0];
const crawlSnap = await getDoc(doc(host.db, "barCrawls", opts.crawl));
if (!crawlSnap.exists()) {
  console.error(`barCrawls/${opts.crawl} not found.`);
  process.exit(1);
}
const crawl = crawlSnap.data();
const bars = [...crawl.bars].sort((a, b) => a.order - b.order);
const stops = bars.map((bar, order) => ({
  barId: bar.id,
  name: bar.name,
  rating: bar.rating,
  order,
  coordinates: bar.location.coordinates,
}));

// --- start the crawl (createSession's shape) --------------------------------
let sessionRef;
await timed("create", async () => {
  sessionRef = await addDoc(collection(host.db, "crawlSessions"), {
    hostUid: host.uid,
    memberUids: [host.uid],
    members: { [host.uid]: { displayName: host.name, joinedAt: serverTimestamp() } },
    status: "active",
    crawlId: opts.crawl,
    crawlName: "LOAD TEST (safe to delete)",
    orgSlug: "loadtest",
    stops,
    currentStopIndex: 0,
    checkIns: {},
    route: {
      startCoordinates: stops[0].coordinates,
      endCoordinates: stops[stops.length - 1].coordinates,
      plannedDistanceMiles: null,
      plannedDurationMin: null,
    },
    walkedMiles: 0,
    startedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
});
if (!sessionRef) {
  console.error("Couldn't create the session:", [...writeStats.get("create").errors.keys()]);
  process.exit(1);
}
log(`Session ${sessionRef.id} started by the host.`);

// --- everyone taps the invite at once (joinSession's exact write) -----------
const joinStart = now();
const inGroup = [host];
await Promise.all(
  members.slice(1).map((m) =>
    timed("join", async () => {
      await updateDoc(doc(m.db, "crawlSessions", sessionRef.id), {
        memberUids: arrayUnion(m.uid),
        [`members.${m.uid}`]: { displayName: m.name, joinedAt: serverTimestamp() },
        updatedAt: serverTimestamp(),
      });
      inGroup.push(m);
    })
  )
);
log(`${inGroup.length - 1}/${members.length - 1} joined in ${fmt(now() - joinStart)}.`);

// --- listeners (the open /live page on every phone) ---------------------------
// Billed reads: one per document delivered to a listener.
const countRead = (snap) => {
  if (snap.metadata.hasPendingWrites || snap.metadata.fromCache) return;
  serverSnapshots += typeof snap.docChanges === "function" ? snap.docChanges().length : 1;
};
const unsubs = inGroup.flatMap((m) => [
  onSnapshot(doc(m.db, "crawlSessions", sessionRef.id), countRead, () => {
    listenerErrors += 1;
  }),
  onSnapshot(
    collection(m.db, "crawlSessions", sessionRef.id, "presence"),
    (snap) => {
      // Every snapshot counts, including one that arrives while this phone's
      // own write is still in flight: docChanges are deltas, so a skipped
      // snapshot's changes never come round again.
      const t = now();
      for (const change of snap.docChanges()) {
        const uid = change.doc.id;
        if (uid === m.uid) continue; // my own write, echoed locally
        if (!snap.metadata.fromCache) serverSnapshots += 1;
        const pos = change.doc.data().lastPosition;
        if (!pos) continue;
        const sent = sentPositions.get(`${pos.lng},${pos.lat}`);
        if (!sent) continue;
        sent.seenBy ??= new Set();
        if (!sent.seenBy.has(m.uid)) {
          sent.seenBy.add(m.uid);
          propagationMs.push(t - sent.sentAt);
        }
      }
    },
    () => {
      listenerErrors += 1;
    }
  ),
]);

// --- the night ------------------------------------------------------------------
const durationMs = opts.minutes * 60 * 1000;
const t0 = now();
const timers = [];
let seq = 0;
let currentStop = 0;

const positionFor = (m) => {
  // Near the stop the group is heading to, ~30 m of scatter, plus a tiny
  // unique offset so each published fix is distinguishable.
  const [lng, lat] = stops[Math.min(currentStop, stops.length - 1)].coordinates;
  seq += 1;
  return [
    lng + (Math.random() - 0.5) * 0.0006 + seq * 1e-9,
    lat + (Math.random() - 0.5) * 0.0005 + m.i * 1e-10,
  ];
};

for (const m of inGroup) {
  const ref = doc(m.db, "crawlSessions", sessionRef.id, "presence", m.uid);
  // Phones don't tick in sync: start each timer at a random offset.
  const publish = () => {
    const [lng, lat] = positionFor(m);
    sentPositions.set(`${lng},${lat}`, { uid: m.uid, sentAt: now() });
    m.walked = (m.walked ?? 0) + 0.01;
    void timed("position", () =>
      setDoc(
        ref,
        {
          lastPosition: { lng, lat, at: serverTimestamp() },
          walkedMiles: Math.round(m.walked * 100) / 100,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
    );
  };
  timers.push(
    setTimeout(() => {
      publish();
      timers.push(setInterval(publish, POSITION_PUBLISH_MS));
    }, Math.random() * POSITION_PUBLISH_MS)
  );
}

// The host checks the group in at each stop, spread across the run.
const checkInEvery = durationMs / (stops.length + 1);
timers.push(
  setInterval(() => {
    if (currentStop >= stops.length) return;
    const stop = stops[currentStop];
    currentStop += 1;
    void timed("checkIn", () =>
      updateDoc(doc(host.db, "crawlSessions", sessionRef.id), {
        [`checkIns.${stop.barId}`]: {
          barId: stop.barId,
          at: serverTimestamp(),
          method: "manual",
          skipped: false,
          checkedInBy: host.uid,
          checkedInByName: host.name,
        },
        currentStopIndex: currentStop,
        updatedAt: serverTimestamp(),
      })
    );
  }, checkInEvery)
);

const progress = setInterval(() => {
  const pos = writeStats.get("position");
  const errs = [...writeStats.values()].reduce((n, s) => n + [...s.errors.values()].reduce((a, b) => a + b, 0), 0);
  log(
    `${Math.round((now() - t0) / 1000)} s: ${pos?.lat.length ?? 0} positions, ` +
      `write p95 ${fmt(pct(pos?.lat ?? [], 95))}, reach p95 ${fmt(pct(propagationMs, 95))}, errors ${errs}`
  );
}, 30000);

await new Promise((r) => setTimeout(r, durationMs));
timers.forEach((t) => clearTimeout(t) || clearInterval(t));
clearInterval(progress);
log("Stopping writers; giving listeners 10 s to catch up…");
await new Promise((r) => setTimeout(r, 10000));
const elapsedS = (now() - t0) / 1000;

// --- report ---------------------------------------------------------------------
const totalWrites = [...writeStats.values()].reduce(
  (n, s) => n + s.lat.length + [...s.errors.values()].reduce((a, b) => a + b, 0),
  0
);
const positionsSent = sentPositions.size;
const fullyDelivered = [...sentPositions.values()].filter(
  (s) => (s.seenBy?.size ?? 0) >= inGroup.length - 1
).length;

console.log(`\nLoad test: one group of ${members.length} on "${crawl.name}" for ${elapsedS.toFixed(0)} s\n`);
console.log("  write            ok    errors   p50       p95       max");
for (const [kind, s] of writeStats) {
  const errCount = [...s.errors.values()].reduce((a, b) => a + b, 0);
  console.log(
    `  ${kind.padEnd(14)} ${String(s.lat.length).padStart(4)}  ${String(errCount).padStart(6)}   ` +
      `${fmt(pct(s.lat, 50)).padEnd(9)} ${fmt(pct(s.lat, 95)).padEnd(9)} ${fmt(pct(s.lat, 100))}`
  );
  for (const [code, n] of s.errors) console.log(`      ${n} × ${code}`);
}
const sessionDocWrites = ["create", "join", "checkIn"].reduce(
  (n, k) => n + (writeStats.get(k)?.lat.length ?? 0),
  0
);
console.log(
  `\n  Writes: ${totalWrites} (${(totalWrites / elapsedS).toFixed(2)}/s) spread over ${inGroup.length + 1} docs; ` +
    `${sessionDocWrites} to the shared session doc, 1 per 12 s to each presence doc (guidance ≈ 1/s per doc)`
);
console.log(
  `  Position reaching the others:  p50 ${fmt(pct(propagationMs, 50))}, p95 ${fmt(pct(propagationMs, 95))}, max ${fmt(pct(propagationMs, 100))}`
);
console.log(
  `  Positions seen by every other member: ${fullyDelivered}/${positionsSent}` +
    "  (listeners may skip a fix that is replaced before it arrives; that is normal)"
);
console.log(`  Snapshot reads billed (server deliveries): ${serverSnapshots}  (~${Math.round((serverSnapshots / elapsedS) * 3600).toLocaleString()} per hour at this size)`);
console.log(`  Listener errors: ${listenerErrors}`);

// --- cleanup ------------------------------------------------------------------------
unsubs.forEach((u) => u());
if (opts.keep) {
  log(`--keep: left crawlSessions/${sessionRef.id} and its presence docs in place.`);
} else {
  await Promise.allSettled(
    inGroup.map((m) => deleteDoc(doc(m.db, "crawlSessions", sessionRef.id, "presence", m.uid)))
  );
  await timed("cleanup", () => deleteDoc(doc(host.db, "crawlSessions", sessionRef.id)));
  log("Deleted the session and its presence docs (the loadtest-N users are kept for reuse).");
}
await Promise.allSettled(members.map((m) => terminate(m.db).then(() => deleteApp(m.app))));
process.exit(0);
