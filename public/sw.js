/* Dolemon service worker — app shell cache so the app opens instantly and survives a dead network. */

const VERSION = "dolemon-v0.2.0";
const SHELL = ["/", "/app", "/signin", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL).catch(() => undefined))
      .then(() => self.skipWaiting())
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

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // never cache the backend: messages, auth and storage must always be live
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // pages: STALE-WHILE-REVALIDATE — a cached shell opens instantly, the
  // fresh copy lands in the background. The app is client-driven, so the
  // cached HTML is safe and the real data always comes live over the network.
  if (request.mode === "navigate") {
    event.respondWith(
      caches.open(VERSION).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response && response.status === 200) {
              cache.put(request, response.clone()).catch(() => undefined);
            }
            return response;
          })
          .catch(() => cached || (await cache.match("/")) || Response.error());
        return cached || network;
      })
    );
    return;
  }

  // static assets: cache first, refresh in the background
  const isStatic =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    /\.(?:png|jpg|jpeg|svg|webp|ico|woff2?|css|js)$/.test(url.pathname);

  if (!isStatic) return;

  event.respondWith(
    caches.match(request).then((hit) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy)).catch(() => undefined);
          }
          return response;
        })
        .catch(() => hit);
      return hit || network;
    })
  );
});
