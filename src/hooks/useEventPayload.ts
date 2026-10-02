// src/hooks/useEventPayload.ts
//
// Short links for shared crawls and venue maps: /c/<slug> and /v/<slug> load
// the same base64 payload a long link carries in its fragment, from a static
// /events/<slug>.json that scripts/batch-routes.mjs publishes. A short link
// fits in an Instagram DM (1,000 characters max — a 9-stop route link alone is
// ~1,200) and can be updated in place when an organizer's lineup changes.
//
// The payload is then decoded by the same readCrawlFromHash validation as a
// long link, so a short link is no more trusted than a pasted one.

import { useEffect, useState } from "react";

/** Event slugs are batch-routes `source` tags; anything else never hits the network. */
const VALID_SLUG = /^[a-z0-9][a-z0-9_-]{0,39}$/i;

/**
 * `undefined` while loading, `null` when there is no payload (bad slug, missing
 * file, offline with nothing cached), otherwise the payload string. With no
 * slug it returns `null` immediately — the caller reads the URL fragment.
 */
export const useEventPayload = (slug: string | undefined): string | null | undefined => {
  const [payload, setPayload] = useState<string | null | undefined>(slug ? undefined : null);

  useEffect(() => {
    if (!slug) {
      setPayload(null);
      return;
    }
    if (!VALID_SLUG.test(slug)) {
      setPayload(null);
      return;
    }
    setPayload(undefined);
    let cancelled = false;
    // An unknown slug falls through Vercel's SPA rewrite and returns HTML,
    // which fails JSON parsing and lands in the broken-link state.
    fetch(`/events/${slug}.json`, { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { payload?: unknown } | null) => {
        if (!cancelled) setPayload(typeof d?.payload === "string" ? d.payload : null);
      })
      .catch(() => {
        if (!cancelled) setPayload(null);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return payload;
};
