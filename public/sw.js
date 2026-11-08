/* Dolemon service worker — the app works offline.
 *
 * Three kinds of responses are cached, and nothing else:
 *   · visited app pages (the HTML document)          → PAGE_CACHE
 *   · their Next.js route payloads (`_rsc`)          → RSC_CACHE
 *   · build assets under /_next/static/              → STATIC_CACHE
 *
 * Messages, profiles and anything else under /api/ always go to the network:
 * reading them from a cache would be a lie, and sending needs a connection.
 * The page and RSC caches hold one account's rendered screen, so signing out
 * posts { type: "dolemon:clear-cache" } and they are deleted.
 */
const VERSION = "v5";
const SHELL_CACHE = `dolemon-shell-${VERSION}`;
const STATIC_CACHE = `dolemon-static-${VERSION}`;
const PAGE_CACHE = `dolemon-pages-${VERSION}`;
const RSC_CACHE = `dolemon-rsc-${VERSION}`;
const OFFLINE_PAGE = "/offline.html";
const PUBLIC_ASSETS = [
  OFFLINE_PAGE,
  "/icons/icon-192.png?v=2",
  "/icons/icon-512.png?v=2",
  "/icons/icon-maskable.png?v=2",
];
const MAX_STATIC_ENTRIES = 400;
const MAX_PAGES = 60;
const MAX_RSC = 120;
const NAV_TIMEOUT_MS = 4500;
const RSC_TIMEOUT_MS = 4500;

/** App screens we are willing to keep on the device. Everything else is network-only. */
const APP_SECTION = /^\/(app|settings|signin|signup|unlock|download)(\/|$)/;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // One missing icon must not prevent the offline page from being cached.
    await Promise.all(PUBLIC_ASSETS.map((url) => cache.add(url).catch(() => undefined)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE, STATIC_CACHE, PAGE_CACHE, RSC_CACHE]);
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("dolemon-") && !keep.has(key)).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "dolemon:clear-cache") return;
  event.waitUntil(Promise.all([caches.delete(PAGE_CACHE), caches.delete(RSC_CACHE)]));
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  await Promise.all(keys.slice(0, keys.length - max).map((key) => cache.delete(key)));
}

/** Fetch with a deadline so a dead network falls back to the cache quickly. */
async function fetchWithTimeout(request, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function offlineResponse() {
  const cached = await (await caches.open(SHELL_CACHE)).match(OFFLINE_PAGE);
  return cached || new Response("Dolemon can't connect right now. Please check your connection and try again.", {
    status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** Cache key for an RSC request: the `_rsc` build hash must not split the entry. */
function rscKey(url) {
  const clean = new URL(url.href);
  clean.searchParams.delete("_rsc");
  return clean.href;
}

/** Fire-and-forget cache writes; a quota error must never break the response. */
function store(cacheName, max, key, response) {
  caches.open(cacheName)
    .then((cache) => cache.put(key, response))
    .then(() => trim(cacheName, max))
    .catch(() => undefined);
}

async function networkFirst(request, cacheName, key, max, timeoutMs) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetchWithTimeout(request, timeoutMs);
    if (response && response.ok && response.type === "basic") store(cacheName, max, key, response.clone());
    return response;
  } catch {
    return (await cache.match(key)) || null;
  }
}

async function cacheFirstAsset(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  // The response body is streamed to the page; only the clone is stored.
  if (response.ok && response.type === "basic") store(STATIC_CACHE, MAX_STATIC_ENTRIES, request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Live data: messages, accounts, push, cleanup. Never cached.
  if (url.pathname.startsWith("/api/")) return;
  // Multi-megabyte downloads are not app shell.
  if (url.pathname.startsWith("/downloads/")) return;

  const rsc = url.searchParams.has("_rsc") || request.headers.get("rsc") === "1";
  const inApp = APP_SECTION.test(url.pathname);

  if (rsc) {
    // Route payloads drive client-side navigation; without them every tap needs the network.
    if (!inApp) return;
    const key = rscKey(url);
    event.respondWith((async () => {
      const fresh = await networkFirst(request, RSC_CACHE, key, MAX_RSC, RSC_TIMEOUT_MS);
      if (fresh) return fresh;
      return (await (await caches.open(RSC_CACHE)).match(key)) || offlineResponse();
    })());
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      if (!inApp) {
        // A page outside the app we have not stored: network or a clear fallback.
        try { return await fetchWithTimeout(request, NAV_TIMEOUT_MS); } catch { return offlineResponse(); }
      }
      const fresh = await networkFirst(request, PAGE_CACHE, request.url, MAX_PAGES, NAV_TIMEOUT_MS);
      if (fresh) return fresh;
      const pages = await caches.open(PAGE_CACHE);
      const page = (await pages.match(request.url)) || (await pages.match(url.pathname));
      return page || offlineResponse();
    })());
    return;
  }

  // Build output is content-addressed, so a cached copy can never be stale.
  if (!url.pathname.startsWith("/_next/static/") || url.search) return;
  event.respondWith(cacheFirstAsset(request).catch(() => offlineResponse()));
});

// Notifications intentionally contain no sender name or private message text.
self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { /* generic notification */ }
  const path = typeof payload.url === "string" && /^\/app\/chat\/[0-9a-f-]{36}$/i.test(payload.url) ? payload.url : "/app";
  event.waitUntil(self.registration.showNotification("Dolemon", {
    body: "You have a new message.",
    icon: "/icons/icon-192.png?v=2",
    badge: "/icons/icon-192.png?v=2",
    data: { path },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.data?.path;
  const safePath = typeof path === "string" && /^\/app\/chat\/[0-9a-f-]{36}$/i.test(path) ? path : "/app";
  const target = new URL(safePath, self.location.origin).href;
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = clients.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      try { const next = await existing.navigate(target); if (next) return await next.focus(); } catch { /* open a fresh window */ }
    }
    return self.clients.openWindow(target);
  })());
});
