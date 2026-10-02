#!/usr/bin/env node
//
// scripts/metrics.mjs — the weekly numbers for the organizer strategy.
//
//   npm run metrics                # last 30 days
//   npm run metrics -- --days 7    # any window
//
// READ-ONLY. Costs one Firestore read per document scanned and nothing else.
// Run it every Monday and paste the output into the crawl ledger.
//
// Why a script and not the Vercel dashboard: Vercel events are anonymous
// aggregates (and absent entirely on the Hobby plan), so they can count joins
// but can never say "this attendee went on to plan their own crawl". The
// questions below need per-uid history, which lives in Firestore:
//
//   crawlSessions — the source of truth for live crawls (members, status)
//   barCrawls     — saved crawls, incl. "Run it again" copies (duplicatedFrom)
//   events        — first-party event log written by src/services/eventLog.ts
//
// The events collection only has rows from the deploy that introduced it, so
// event-based numbers start from that date; session numbers go back further.
//
// Auth: FIREBASE_SERVICE_ACCOUNT from .env — the same credential as
// seed-metro-cache.mjs, used the same way (OAuth JWT → Firestore REST).

import { SignJWT, importPKCS8 } from "jose";

const PROJECT_ID = "bar-crawl-planner-5985f";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Attendee → planner and organizer repeat are 90-day questions by design. */
const COHORT_DAYS = 90;
/** An "active" session this old was never finished — the night is over. */
const STALE_ACTIVE_MS = 12 * 60 * 60 * 1000;

// --- argv ----------------------------------------------------------------
const args = process.argv.slice(2);
let days = 30;
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--days" && /^\d+$/.test(args[i + 1] ?? "")) {
    days = Number(args[i + 1]);
    i += 1;
  } else {
    console.error(`Unknown argument: ${args[i]}\nUsage: npm run metrics -- [--days N]`);
    process.exit(1);
  }
}

if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error("FIREBASE_SERVICE_ACCOUNT is not set (expected in .env).");
  process.exit(1);
}

// --- Firestore REST --------------------------------------------------------
const getAccessToken = async () => {
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  const key = await importPKCS8(sa.private_key.replace(/\\n/g, "\n"), "RS256");
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/datastore" })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience(TOKEN_URL)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!r.ok) throw new Error(`token ${r.status}: ${await r.text()}`);
  return (await r.json()).access_token;
};

/** Firestore REST typed value → plain JS. Timestamps become Dates. */
const fromValue = (v) => {
  if (!v || "nullValue" in v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("timestampValue" in v) return new Date(v.timestampValue);
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(fromValue);
  if ("mapValue" in v) return fromFields(v.mapValue.fields ?? {});
  return null;
};
const fromFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([k, x]) => [k, fromValue(x)]));

/** Every doc in `collection` whose `field` >= since. Single-field range
 *  filter, so it only needs Firestore's automatic index. */
const querySince = async (token, collection, field, since) => {
  const r = await fetch(`${FS_BASE}:runQuery`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: collection }],
        where: {
          fieldFilter: {
            field: { fieldPath: field },
            op: "GREATER_THAN_OR_EQUAL",
            value: { timestampValue: since.toISOString() },
          },
        },
      },
    }),
  });
  if (!r.ok) throw new Error(`${collection} query ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const rows = await r.json();
  return rows
    .filter((row) => row.document)
    .map((row) => ({
      id: row.document.name.split("/").pop(),
      ...fromFields(row.document.fields ?? {}),
    }));
};

// --- helpers ---------------------------------------------------------------
const pct = (n, d) => (d === 0 ? "—" : `${Math.round((n / d) * 100)}%`);
const avg = (xs) => (xs.length === 0 ? "—" : (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2));
const uniq = (xs) => new Set(xs).size;
const line = (label, value, note = "") =>
  console.log(`  ${label.padEnd(34)} ${String(value).padStart(8)}${note ? `   ${note}` : ""}`);
const heading = (title) => console.log(`\n${title}\n${"-".repeat(title.length)}`);

// --- main ------------------------------------------------------------------
const now = Date.now();
const windowStart = new Date(now - days * DAY_MS);
const cohortStart = new Date(now - Math.max(days, COHORT_DAYS) * DAY_MS);

const token = await getAccessToken();
const [sessionsAll, crawls, eventsAll] = await Promise.all([
  querySince(token, "crawlSessions", "startedAt", cohortStart),
  querySince(token, "barCrawls", "createdAt", windowStart),
  querySince(token, "events", "at", cohortStart),
]);

const inWindow = (d) => d instanceof Date && d.getTime() >= windowStart.getTime();
const sessions = sessionsAll.filter((s) => inWindow(s.startedAt));
const events = eventsAll.filter((e) => inWindow(e.at));

console.log(`BarHop metrics — last ${days} days (since ${windowStart.toISOString().slice(0, 10)})`);
const firstEvent = eventsAll.reduce(
  (min, e) => (e.at && (!min || e.at < min) ? e.at : min),
  null
);
console.log(
  firstEvent
    ? `Event log has rows from ${firstEvent.toISOString().slice(0, 10)}; event numbers start there.`
    : "Event log is empty — event-based numbers below will read zero until the deploy that adds it."
);

// 1. Live crawls ------------------------------------------------------------
heading("Live crawls (crawlSessions)");
const status = (s) => {
  if (s.status === "active" && s.startedAt && now - s.startedAt.getTime() > STALE_ACTIVE_MS) {
    return "never finished";
  }
  return s.status ?? "unknown";
};
const byStatus = {};
for (const s of sessions) byStatus[status(s)] = (byStatus[status(s)] ?? 0) + 1;
line("Started", sessions.length);
for (const [k, v] of Object.entries(byStatus)) line(`  ${k}`, v, pct(v, sessions.length));
const completed = sessions.filter((s) => s.status === "completed");
line("Completion rate", pct(completed.length, sessions.length), "completed / started");

// 2. Group multiplier ---------------------------------------------------------
heading("Group multiplier — the organizer thesis lives or dies here");
const sizes = sessions.map((s) => (Array.isArray(s.memberUids) ? s.memberUids.length : 1));
line("Avg people per live crawl", avg(sizes), "host included");
line("Avg joiners per live crawl", avg(sizes.map((n) => n - 1)), "~0 means nobody joins");
const bucket = (lo, hi) => sizes.filter((n) => n >= lo && n <= hi).length;
line("  solo (1)", bucket(1, 1));
line("  2–4", bucket(2, 4));
line("  5–9", bucket(5, 9));
line("  10+", bucket(10, Infinity), "watch Firestore write load here");
const joins = events.filter((e) => e.name === "crawl_joined");
const guestJoins = joins.filter((e) => e.props?.wasGuest === true).length;
line("Joins (event log)", joins.length);
line("  of which as guests", guestJoins, pct(guestJoins, joins.length));

// 3. Plan → run ---------------------------------------------------------------
heading("Plan → run");
const uidsWith = (name, list = events) =>
  new Set(list.filter((e) => e.name === name).map((e) => e.uid));
const planners = uidsWith("route_generated");
const starters = uidsWith("crawl_started");
line("People who generated a route", planners.size);
line("People who saved a crawl", uidsWith("crawl_created").size);
line("People who started a live crawl", starters.size, pct(starters.size, planners.size) + " of route builders");
line("Saved crawls created", crawls.length);
line("Live crawls started", sessions.length);
const listCompletes = events.filter((e) => e.name === "list_completed").length;
line("No-account list nights finished", listCompletes, "the /c list, reached last stop");

// 4. Recap -------------------------------------------------------------------
heading("Recap");
const recapViewers = uidsWith("recap_viewed");
const recapSharers = uidsWith("recap_shared");
line("People who saw a recap", recapViewers.size);
line("People who shared it", recapSharers.size, pct(recapSharers.size, recapViewers.size) + " share rate");
const recapOpens = events.filter((e) => e.name === "shared_link_opened" && e.ref === "recap").length;
line("Recap links opened", recapOpens, "first touch = recap");

// 5. Repeat organizers (90d) ---------------------------------------------------
heading(`Repeat organizers (last ${COHORT_DAYS} days)`);
const hostCounts = {};
for (const s of sessionsAll) {
  if (s.hostUid) hostCounts[s.hostUid] = (hostCounts[s.hostUid] ?? 0) + 1;
}
const hosts = Object.values(hostCounts);
const repeatHosts = hosts.filter((n) => n >= 2).length;
line("Hosts", hosts.length);
line("Hosts with 2+ live crawls", repeatHosts, pct(repeatHosts, hosts.length) + " repeat rate");
const dupes = crawls.filter((c) => c.duplicatedFrom).length;
line(`"Run it again" copies (${days}d)`, dupes);

// 6. Attendee → planner (90d) ----------------------------------------------------
heading(`Attendee → planner (last ${COHORT_DAYS} days)`);
// An attendee is anyone whose FIRST appearance in the log was on the receiving
// end of someone else's crawl. Converted = generated a route of their own
// afterwards. Uses the full 90-day log regardless of --days.
const ATTENDEE_EVENTS = new Set(["shared_link_opened", "crawl_joined", "plan_rsvp"]);
const byUid = {};
for (const e of eventsAll) {
  if (!e.uid || !e.at) continue;
  (byUid[e.uid] ??= []).push(e);
}
let attendees = 0;
let converted = 0;
for (const list of Object.values(byUid)) {
  list.sort((a, b) => a.at - b.at);
  const firstAttendee = list.find((e) => ATTENDEE_EVENTS.has(e.name));
  if (!firstAttendee) continue;
  // They planned before ever receiving a crawl → a planner, not an attendee.
  const plannedBefore = list.some((e) => e.name === "route_generated" && e.at < firstAttendee.at);
  if (plannedBefore) continue;
  attendees += 1;
  if (list.some((e) => e.name === "route_generated" && e.at > firstAttendee.at)) converted += 1;
}
line("Attendees", attendees);
line("…who later planned their own", converted, pct(converted, attendees));
const ctas = events.filter((e) => e.name === "planner_cta");
line(`"Plan your own" taps (${days}d)`, ctas.length);
for (const from of ["recap", "list", "venue_map"]) {
  line(`  from ${from}`, ctas.filter((e) => e.props?.from === from).length);
}

// 7. Outreach scoreboard --------------------------------------------------------
heading("By source — which links produced real nights");
// `ref` is each device's first touch: an organizer's ?s= tag from
// batch-routes.mjs, a CTA tag, or list / invite / plan_invite / direct.
const refs = {};
for (const e of events) {
  const r = (refs[e.ref ?? "direct"] ??= { uids: new Set(), opened: 0, routes: 0, started: 0, joined: 0 });
  r.uids.add(e.uid);
  if (e.name === "shared_link_opened" || e.name === "venue_map_opened") r.opened += 1;
  if (e.name === "route_generated") r.routes += 1;
  if (e.name === "crawl_started") r.started += 1;
  if (e.name === "crawl_joined") r.joined += 1;
}
const rows = Object.entries(refs).sort((a, b) => b[1].uids.size - a[1].uids.size);
if (rows.length === 0) {
  console.log("  (no events in this window)");
} else {
  console.log(`  ${"source".padEnd(22)} ${"people".padStart(7)} ${"opened".padStart(7)} ${"routes".padStart(7)} ${"started".padStart(8)} ${"joined".padStart(7)}`);
  for (const [ref, r] of rows) {
    console.log(
      `  ${ref.padEnd(22)} ${String(r.uids.size).padStart(7)} ${String(r.opened).padStart(7)} ${String(r.routes).padStart(7)} ${String(r.started).padStart(8)} ${String(r.joined).padStart(7)}`
    );
  }
}
console.log(`\n  ${uniq(events.map((e) => e.uid))} people in the event log this window.`);
