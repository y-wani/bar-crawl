// src/utils/analytics.ts
//
// Lightweight funnel analytics on top of Vercel Web Analytics (the <Analytics />
// component is already mounted in main.tsx, so page views are tracked). This
// centralizes the custom-event taxonomy for the acquisition + virality funnel:
//   sign_up → crawl_created → crawl_started → invite_sent → crawl_joined →
//   crawl_completed → recap_shared
// Best-effort by design — analytics must never throw into the app.

import { track } from "@vercel/analytics";

const safeTrack = (
  name: string,
  props?: Record<string, string | number | boolean | null>
): void => {
  try {
    track(name, props);
  } catch {
    /* analytics must never break the app */
  }
};

export const analytics = {
  signUp: (method: "email" | "google") => safeTrack("sign_up", { method }),
  crawlCreated: (stops: number) => safeTrack("crawl_created", { stops }),
  crawlStarted: (stops: number) => safeTrack("crawl_started", { stops }),
  inviteSent: () => safeTrack("invite_sent"),
  crawlJoined: () => safeTrack("crawl_joined"),
  crawlCompleted: (stopsHit: number, stopsTotal: number) =>
    safeTrack("crawl_completed", { stopsHit, stopsTotal }),
  recapShared: (method: "share" | "download") =>
    safeTrack("recap_shared", { method }),
  // "Plan it together" funnel
  planCreated: (candidates: number) =>
    safeTrack("plan_created", { candidates }),
  planRsvp: () => safeTrack("plan_rsvp"),
  planVote: () => safeTrack("plan_vote"),
  planLocked: (attendees: number, stops: number) =>
    safeTrack("plan_locked", { attendees, stops }),
  // Get-home-safe
  homeRide: (provider: "uber" | "lyft") =>
    safeTrack("home_ride", { provider }),
  markedHomeSafe: () => safeTrack("marked_home_safe"),
};
