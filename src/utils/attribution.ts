// src/utils/attribution.ts
//
// First-touch attribution: which door did this device first walk in through?
//
// The organizer plan only works if every arrow in the loop is measurable —
// organizer → invite → attendee → recap → next planner. The arrows that matter
// most are "an attendee became a planner" and "which outreach link produced a
// real night", and neither can be read without knowing how a device arrived.
//
// Sources, in priority order:
//   ?ref=<tag>        — set by our own CTAs (recap, list, live) and outreach
//   ?s=<tag>          — the per-organizer tag batch-routes.mjs puts on /c links
//   /c with no tag    — someone opened a shared crawl list
//   /live?join=…      — someone opened a live-crawl invite
//   /plan?id=…        — someone opened a plan-it-together invite
//
// FIRST touch wins and is kept for 90 days, matching the attendee → planner
// window the strategy doc measures. A later CTA click does not overwrite it —
// an attendee who arrived by invite and then tapped "Plan your own" is exactly
// the conversion being counted, and overwriting would erase the evidence.
//
// localStorage throws in private-mode Safari; every access is wrapped and a
// failure just means the device is reported as "direct".

const REF_KEY = "bh_ref";
export const REF_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/** Tags end up in analytics; anything that isn't a short slug is dropped
 *  rather than recorded, so a hand-mangled link can't pollute the data. */
const VALID_REF = /^[a-z0-9][a-z0-9_-]{0,39}$/i;

export interface StoredRef {
  ref: string;
  at: number;
}

/** The attribution a single URL carries, or null if it carries none. Pure. */
export const refFromLocation = (
  pathname: string,
  search: string
): string | null => {
  const params = new URLSearchParams(search);
  const explicit = params.get("ref") ?? params.get("s");
  if (explicit !== null) {
    const tag = explicit.trim().toLowerCase();
    return VALID_REF.test(tag) ? tag : null;
  }
  if (pathname === "/c") return "list";
  if (pathname === "/live" && params.has("join")) return "invite";
  if (pathname === "/plan" && params.has("id")) return "plan_invite";
  return null;
};

/** Whether a candidate should replace what's stored. Pure. */
export const shouldStore = (
  stored: StoredRef | null,
  candidate: string | null,
  now: number
): boolean => {
  if (!candidate) return false;
  if (!stored) return true;
  return now - stored.at > REF_TTL_MS;
};

const readStored = (): StoredRef | null => {
  try {
    const raw = localStorage.getItem(REF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredRef>;
    if (typeof parsed.ref !== "string" || typeof parsed.at !== "number") {
      return null;
    }
    return { ref: parsed.ref, at: parsed.at };
  } catch {
    return null;
  }
};

/** Call on every navigation; it only ever writes the first touch. */
export const captureRef = (pathname: string, search: string): void => {
  const candidate = refFromLocation(pathname, search);
  const now = Date.now();
  if (!shouldStore(readStored(), candidate, now)) return;
  try {
    localStorage.setItem(REF_KEY, JSON.stringify({ ref: candidate, at: now }));
  } catch {
    /* storage unavailable — this device reads as "direct" */
  }
};

/** The device's first-touch source, or "direct". */
export const getRef = (): string => {
  const stored = readStored();
  if (!stored || Date.now() - stored.at > REF_TTL_MS) return "direct";
  return stored.ref;
};
