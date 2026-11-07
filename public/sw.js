/* Only public, versioned assets and the standalone offline page are cached.
 * Conversation data, navigations and RSC requests always go to the network. */
const SHELL_CACHE = "dolemon-shell-v3";
const STATIC_CACHE = "dolemon-static-v1";
const MAX_STATIC_ENTRIES = 500;
const OFFLINE_PAGE = "/offline.html";
const PUBLIC_ASSETS = [OFFLINE_PAGE, "/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon-maskable.png"];

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
    const keys = await caches.keys();
    // Remove our old cache (including older versions that stored page HTML),
    // not caches owned by other apps on this origin.
    await Promise.all(keys.filter((key) => key.startsWith("dolemon-") && key !== SHELL_CACHE && key !== STATIC_CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function offlineResponse() {
  const cached = await (await caches.open(SHELL_CACHE)).match(OFFLINE_PAGE);
  return cached || new Response("Dolemon can't connect right now. Please check your connection and try again.", {
    status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  // Never persist Next.js route payloads, even if their URL looks like an asset.
  if (url.searchParams.has("_rsc") || request.headers.has("rsc") || request.headers.has("next-router-prefetch")) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        return await fetch(request, { signal: controller.signal });
      } catch {
        return await offlineResponse();
      } finally {
        clearTimeout(timer);
      }
    })());
    return;
  }

  // Next's build assets are content-addressed/versioned. Avoid caching arbitrary
  // images or application paths: they might contain private user content.
  if (!url.pathname.startsWith("/_next/static/") || url.search) return;
  event.respondWith((async () => {
    const cache = await caches.open(STATIC_CACHE);
    const hit = await cache.match(request);
    if (hit) return hit;
    const response = await fetch(request);
    if (response.ok && response.type === "basic") {
      event.waitUntil((async () => {
        try {
          await cache.put(request, response.clone());
          const keys = await cache.keys();
          await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_STATIC_ENTRIES)).map((key) => cache.delete(key)));
        } catch { /* quota or cache unavailable: the network response still works */ }
      })());
    }
    return response;
  })());
});

// Notifications intentionally contain no sender name or private message text.
self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { /* generic notification */ }
  const path = typeof payload.url === "string" && /^\/app\/chat\/[0-9a-f-]{36}$/i.test(payload.url) ? payload.url : "/app";
  event.waitUntil(self.registration.showNotification("Dolemon", {
    body: "You have a new message.", icon: "/icons/icon-192.png", badge: "/icons/icon-192.png",
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
