// public/sw.js — BarHop service worker.
//
// One job: a shared crawl list (/c) must still open inside a bar with no
// signal. The whole crawl travels in the URL fragment, so once the app shell
// and its scripts are cached, /c needs no network at all.
//
// Deliberately small and conservative, because a bad service worker can pin
// users to a broken deploy:
//   - Page navigations are NETWORK-FIRST. Online users always get the latest
//     index.html; the cached shell is only a fallback when the network fails.
//   - /assets/* are content-hashed and immutable, so they're cache-first.
//   - Google Fonts are cache-first so the offline page still looks right.
//   - Event venue lists (/events/*.json) are network-first, cached as a
//     fallback, because they're updated when a lineup is finalized.
//   - Everything else (/api, Firestore, Mapbox, Places, analytics) is never
//     touched — it goes straight to the network as if this file didn't exist.
//
// Kill switch: bump VERSION to drop every old cache on the next visit. To
// remove the worker entirely, replace this file with one that calls
// self.registration.unregister() in `activate`.

const VERSION = "v1";
const SHELL_CACHE = `barhop-shell-${VERSION}`;
const ASSET_CACHE = `barhop-assets-${VERSION}`;
const SHELL_URL = "/index.html";
/** Hashed bundles accumulate across deploys; keep the newest N. */
const MAX_ASSETS = 120;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.add(SHELL_URL))
      .catch(() => {
        /* offline at install — the shell is cached on the next navigation */
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("barhop-") && k !== SHELL_CACHE && k !== ASSET_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

const trimAssets = async () => {
  const cache = await caches.open(ASSET_CACHE);
  const keys = await cache.keys();
  // Cache.keys() is in insertion order, so the oldest come first.
  await Promise.all(
    keys.slice(0, Math.max(0, keys.length - MAX_ASSETS)).map((k) => cache.delete(k))
  );
};

const networkFirstPage = async (request) => {
  try {
    const response = await fetch(request);
    // Every route is rewritten to index.html (vercel.json), so any OK HTML
    // navigation response IS the shell — keep the freshest copy. The type
    // check matters: opening /robots.txt or an image directly in a tab is
    // also a navigation, and must never be stored as the shell.
    const isHtml = (response.headers.get("content-type") || "").includes("text/html");
    if (response.ok && isHtml) {
      const copy = response.clone();
      caches.open(SHELL_CACHE).then((cache) => cache.put(SHELL_URL, copy));
    }
    return response;
  } catch (error) {
    const cached = await caches.match(SHELL_URL);
    if (cached) return cached;
    throw error;
  }
};

const cacheFirst = async (request, cacheName) => {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  // Opaque (no-cors) font responses report status 0 but are still usable.
  if (response.ok || response.type === "opaque") {
    const copy = response.clone();
    caches.open(cacheName).then((cache) => {
      cache.put(request, copy);
      if (cacheName === ASSET_CACHE) trimAssets();
    });
  }
  return response;
};

/** Only URLs this worker would cache on its own are accepted from a page. */
const isCacheable = (url) =>
  (url.origin === self.location.origin && url.pathname.startsWith("/assets/")) ||
  url.hostname === "fonts.googleapis.com" ||
  url.hostname === "fonts.gstatic.com";

// The FIRST visit loads its scripts before this worker controls the page, so
// none of them pass through `fetch` below. Without this, a crawl link opened
// once and then reopened in a dead zone would fail — the exact case the worker
// exists for. The page sends what it already loaded (registerServiceWorker.ts).
self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_URLS" || !Array.isArray(event.data.urls)) return;
  event.waitUntil(
    caches.open(ASSET_CACHE).then((cache) =>
      Promise.all(
        event.data.urls.slice(0, MAX_ASSETS).map(async (raw) => {
          try {
            const url = new URL(raw);
            if (!isCacheable(url) || (await cache.match(url.href))) return;
            const response = await fetch(url.href, {
              mode: url.origin === self.location.origin ? "same-origin" : "no-cors",
            });
            if (response.ok || response.type === "opaque") await cache.put(url.href, response);
          } catch {
            /* best effort — it will be cached on its next fetch instead */
          }
        })
      ).then(trimAssets)
    )
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith("/api/")) return;
    if (request.mode === "navigate") {
      event.respondWith(networkFirstPage(request));
      return;
    }
    if (url.pathname.startsWith("/assets/")) {
      event.respondWith(cacheFirst(request, ASSET_CACHE));
      return;
    }
    // Event venue lists (/events/<slug>.json) change when a lineup is
    // finalized, so the network wins; the cached copy only covers no signal.
    if (url.pathname.startsWith("/events/")) {
      event.respondWith(
        fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => caches.match(request).then((hit) => hit || Response.error()))
      );
    }
    return;
  }

  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
  }
});
