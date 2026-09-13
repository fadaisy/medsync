/*
 * MedSync service worker — the offline shell and nothing more (ADR 0088).
 *
 * Precaches one static page, /offline, and serves it ONLY when a navigation
 * request fails. Every other request — pages, data, the API — goes straight
 * to the network untouched: nothing clinical or personal is ever written to
 * the cache, and nothing stale can ever be shown as current.
 */
const CACHE = "medsync-shell-v1";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  // Navigations only. Not responding to anything else leaves it to the
  // browser exactly as if no worker were installed.
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(OFFLINE_URL).then((cached) => cached ?? Response.error()),
    ),
  );
});
