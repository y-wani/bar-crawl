// src/utils/analytics.ts
//
// Lightweight funnel analytics on top of Vercel Web Analytics (the <Analytics />
// component is already mounted in main.tsx, so page views are tracked). This
// centralizes the custom-event taxonomy.
//
// There are two funnels here and they answer different questions.
//
// THE ACCOUNT FUNNEL (the original one):
//   sign_up → crawl_created → crawl_started → invite_sent → crawl_joined →
//   crawl_completed → recap_shared
//
// THE GUEST + VIRALITY FUNNEL (added because the account funnel could not
// explain a 30-day window with 25 visitors and zero saved crawls). Every step
// before `sign_up` was invisible, so "activation is broken" was a guess:
//   guest_session → bars_loaded → stop_added → route_generated →
//   share_clicked → shared_link_opened → list_advanced → list_completed
//
// `shared_link_opened` is the one that matters most. It is the only measurement
// of whether a crawl reaches the other people in the group, which is the only
// growth loop the product has.
//
// Every event goes to TWO sinks. Vercel gives the dashboard view; the
// first-party Firestore log (services/eventLog.ts) is the one that can answer
// per-person questions — attendee → planner, organizer repeat rate — because
// it carries a uid and keeps more than a month of history. Read it with
// `npm run metrics`.
//
// Best-effort by design — analytics must never throw into the app.

import { track } from "@vercel/analytics";
import { logEvent } from "../services/eventLog";

const safeTrack = (
  name: string,
  props?: Record<string, string | number | boolean | null>
): void => {
  try {
    track(name, props);
  } catch {
    /* analytics must never break the app */
  }
  logEvent(name, props);
};

// Some events fire from effects that re-run (a remount, a dependency change, a
// StrictMode double-mount in development). Counting those as separate visitors
// would quietly inflate the top of the funnel — the exact number the whole
// exercise exists to read honestly. Keyed once per page load.
const fired = new Set<string>();
const once = (key: string, fn: () => void): void => {
  if (fired.has(key)) return;
  fired.add(key);
  fn();
};

export const analytics = {
  // ----- Account funnel -----
  // `wasGuest` is the number that decides whether guest mode beat the cold
  // signup wall; without the dimension the event can't answer it.
  signUp: (method: "email" | "google", wasGuest = false) =>
    safeTrack("sign_up", { method, wasGuest }),
  crawlCreated: (stops: number) => safeTrack("crawl_created", { stops }),
  crawlStarted: (stops: number) => safeTrack("crawl_started", { stops }),
  inviteSent: () => safeTrack("invite_sent"),
  /** `wasGuest` is the test of the organizer thesis: a group multiplier near
   *  1.0 means nothing until attendees can join without an account. */
  crawlJoined: (wasGuest: boolean) => safeTrack("crawl_joined", { wasGuest }),
  crawlCompleted: (stopsHit: number, stopsTotal: number) =>
    safeTrack("crawl_completed", { stopsHit, stopsTotal }),
  recapShared: (method: "share" | "download" | "link") =>
    safeTrack("recap_shared", { method }),
  recapViewed: () => once("recap_viewed", () => safeTrack("recap_viewed")),

  // ----- Guest funnel -----
  /** An anonymous user was minted — a real visitor started building something
   *  without an account. The denominator for everything below. */
  guestSession: () => once("guest_session", () => safeTrack("guest_session")),
  /** Bars rendered on /home. Separates "the map worked" from "they bounced". */
  barsLoaded: (count: number) =>
    once("bars_loaded", () => safeTrack("bars_loaded", { count })),
  /** A bar was added to the crawl. `total` is the size after the change, so
   *  the drop-off between the 1st and 2nd stop is readable. */
  stopAdded: (total: number) => safeTrack("stop_added", { total }),
  /** A route was actually computed on /route. */
  routeGenerated: (stops: number) =>
    once("route_generated", () => safeTrack("route_generated", { stops })),

  // ----- Virality loop -----
  /** Someone shared the crawl. `method` distinguishes the BarHop link (which
   *  feeds the loop) from Google Maps and the PDF (which historically did not). */
  shareClicked: (method: "link" | "native" | "maps" | "pdf") =>
    safeTrack("share_clicked", { method }),
  /** A shared BarHop link was OPENED — by definition, by someone who is not
   *  the planner. This is the loop's only real signal. */
  sharedLinkOpened: (stops: number, valid: boolean) =>
    once("shared_link_opened", () =>
      safeTrack("shared_link_opened", { stops, valid })
    ),

  /** An event venue map (/v) was opened. Counted separately from
   *  shared_link_opened: an attendee browsing 37 bars is not a group that was
   *  handed a route, and mixing them would muddy the loop's main signal. */
  venueMapOpened: (venues: number, valid: boolean) =>
    once("venue_map_opened", () =>
      safeTrack("venue_map_opened", { venues, valid })
    ),

  // ----- The no-account night-of list ("just tell me the next bar") -----
  /** Advanced to the next stop. `index` is 0-based. */
  listAdvanced: (index: number, total: number) =>
    safeTrack("list_advanced", { index, total }),
  /** Reached the last stop without an account — the completion event for a
   *  visitor who never signs up, and the closest thing to "a night happened". */
  listCompleted: (stops: number) =>
    once("list_completed", () => safeTrack("list_completed", { stops })),

  // ----- Attribution primitive (what a bar would eventually pay for) -----
  /** A geofenced or manual arrival at a specific stop in a live crawl. */
  checkIn: (index: number, total: number, method: string) =>
    safeTrack("check_in", { index, total, method }),

  // ----- "Plan it together" funnel -----
  planCreated: (candidates: number) =>
    safeTrack("plan_created", { candidates }),
  planRsvp: () => safeTrack("plan_rsvp"),
  planVote: () => safeTrack("plan_vote"),
  planLocked: (attendees: number, stops: number) =>
    safeTrack("plan_locked", { attendees, stops }),

  // ----- Repeat organizer + the next-planner path -----
  /** A saved crawl was cloned to run again — the repeat-organizer signal. */
  crawlDuplicated: (stops: number) =>
    safeTrack("crawl_duplicated", { stops }),
  /** An attendee tapped a "plan your own" entry point. `from` says which
   *  surface earned it, so the recap and the list can be compared directly. */
  plannerCta: (from: "recap" | "list" | "venue_map") =>
    safeTrack("planner_cta", { from }),

  // ----- Get-home-safe -----
  homeRide: (provider: "uber" | "lyft") =>
    safeTrack("home_ride", { provider }),
  markedHomeSafe: () => safeTrack("marked_home_safe"),

  // ----- Never-lose-the-squad -----
  squadPing: (text: string) => safeTrack("squad_ping", { text }),
};
