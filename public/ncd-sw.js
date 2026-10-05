/*
 * NCDSync service worker (§9, B5), scoped to /ncd. It extends the rule of ADR 0088: the cache holds
 * the static offline shell and immutable build assets only — never a page that carries patient data.
 * Patient data for offline work lives in IndexedDB, encrypted with a non-extractable device key.
 *
 * - Navigation under /ncd: the network; if it fails, the static /ncd-offline shell.
 * - /_next/static/*: cache first (content-hashed, immutable, nothing personal).
 */
const CACHE = "ncdsync-shell-v1";
const SHELL = "/ncd-offline";

async function precache() {
  const cache = await caches.open(CACHE);
  const res = await fetch(new Request(SHELL, { cache: "reload" }));
  await cache.put(SHELL, res.clone());
  // The shell's own scripts and styles, so it can start with no connection.
  const html = await res.text();
  const assets = [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)].map((m) => m[1]);
  await Promise.all([...new Set(assets)].map((a) => cache.add(a).catch(() => undefined)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("ncdsync-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match(SHELL).then((r) => r ?? Response.error())));
    return;
  }
  if (event.request.method === "GET" && url.origin === self.location.origin && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(event.request).then(
        (hit) =>
          hit ??
          fetch(event.request).then((res) => {
            if (res.ok) caches.open(CACHE).then((c) => c.put(event.request, res.clone()));
            return res;
          }),
      ),
    );
  }
});
