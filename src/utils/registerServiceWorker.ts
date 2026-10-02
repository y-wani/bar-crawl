// src/utils/registerServiceWorker.ts
//
// Registers public/sw.js, which keeps a shared crawl list (/c) working with no
// signal inside a bar. Production only: in `vite dev` a worker would cache
// dev-server modules and make hot reload lie.
//
// Registration waits for `load` so it never competes with the first paint,
// and every failure is ignored — the app works identically without it.

/** Everything this page has already downloaded. On a first visit the worker
 *  isn't in control yet, so it never saw these requests; handing it the list
 *  lets a link opened once still work later with no signal. The worker
 *  ignores anything it wouldn't cache itself. */
const loadedResourceUrls = (): string[] =>
  performance
    .getEntriesByType("resource")
    .map((entry) => entry.name)
    .filter((name) => /\/assets\/|fonts\.(googleapis|gstatic)\.com/.test(name));

export const registerServiceWorker = (): void => {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => {
        registration.active?.postMessage({
          type: "CACHE_URLS",
          urls: loadedResourceUrls(),
        });
      })
      .catch(() => {
        /* unsupported or blocked — the app is unaffected */
      });
  });
};
