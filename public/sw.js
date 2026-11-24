/*
 * SiteLog service worker.
 *
 * The pitch of this app is that it works in a basement with no signal, so the
 * shell has to be there before the network is. Strategy:
 *   - install: precache the shell + every hashed build asset (injected by
 *     scripts/precache.mjs at build time, so a first visit is also the last
 *     visit needed for offline use)
 *   - navigation: network first, cached shell otherwise
 *   - same-origin assets: stale-while-revalidate
 *   - Firebase SDK from gstatic: cache-first (it is versioned, so immutable)
 */
const VERSION = "sitelog-dev";
const BUILD_ASSETS = self.__SITELOG_PRECACHE__ || [];
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icon.svg"];
const PRECACHE = [...new Set([...SHELL, ...BUILD_ASSETS])];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => undefined)
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(VERSION).then((cache) => cache.put("/index.html", copy));
          return response;
        })
        .catch(() => caches.match("/index.html").then((hit) => hit ?? caches.match("/")))
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((hit) => {
        const network = fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone();
              void caches.open(VERSION).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => hit);
        return hit ?? network;
      })
    );
    return;
  }

  if (url.hostname === "www.gstatic.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              void caches.open(VERSION).then((cache) => cache.put(request, copy));
            }
            return response;
          })
      )
    );
  }
});
