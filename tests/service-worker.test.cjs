const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function worker({ hangNavigation = false } = {}) {
  const handlers = {}, stores = new Map(), fetched = [];
  let online = true, failIcon = false;
  const key = (request) => typeof request === 'string' ? new URL(request, 'https://dolemon.test').href : request.url;
  const fetcher = async (request, options) => {
    const url = key(request); fetched.push(url);
    if (hangNavigation && options?.signal) {
      return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted'))));
    }
    if (!online || (failIcon && new URL(url).pathname.endsWith('icon-192.png'))) throw new Error('offline');
    const response = new Response(url.endsWith('/offline.html') ? 'offline page' : `network: ${url}`, { status: 200 });
    Object.defineProperty(response, 'type', { value: 'basic' });
    return response;
  };
  const caches = {
    async open(name) {
      if (!stores.has(name)) {
        const data = new Map();
        stores.set(name, {
          data,
          async add(req) { const response = await fetcher(req); data.set(key(req), response); },
          async match(req) { return data.get(key(req)); },
          async put(req, response) { data.set(key(req), response); },
          async keys() { return [...data.keys()].map((url) => ({ url })); },
          async delete(req) { return data.delete(key(req)); },
        });
      }
      return stores.get(name);
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
  };
  let shown, opened;
  const self = { location: { origin: 'https://dolemon.test' }, registration: { showNotification: async (title, options) => { shown = { title, options }; } }, clients: { claim: async () => {}, matchAll: async () => [], openWindow: async (url) => { opened = url; } }, skipWaiting: async () => {}, addEventListener: (name, fn) => { handlers[name] = fn; } };
  vm.runInNewContext(fs.readFileSync('public/sw.js', 'utf8'), { self, caches, fetch: (...args) => fetcher(...args), URL, Response, AbortController, setTimeout: hangNavigation ? (fn) => { queueMicrotask(fn); return 1; } : setTimeout, clearTimeout, Promise });
  async function lifecycle(name) { let pending; handlers[name]({ waitUntil(p) { pending = p; } }); await pending; }
  async function request(path, { method = 'GET', mode = 'cors', headers = {} } = {}) {
    let result; const pending = [];
    handlers.fetch({ request: { method, mode, url: new URL(path, self.location.origin).href, headers: new Headers(headers) }, respondWith(p) { result = p; }, waitUntil(p) { pending.push(p); } });
    if (!result) return undefined;
    const response = await result;
    // cache writes are intentionally fire-and-forget; let them settle
    await Promise.all(pending); await new Promise((resolve) => setTimeout(resolve, 0));
    return response;
  }
  async function push(payload) { let pending; handlers.push({ data: { json: () => payload }, waitUntil(p) { pending = p; } }); await pending; return shown; }
  async function click(path) { let pending; handlers.notificationclick({ notification: { data: { path }, close() {} }, waitUntil(p) { pending = p; } }); await pending; return opened; }
  async function clearCache() { let pending; handlers.message({ data: { type: 'dolemon:clear-cache' }, waitUntil(p) { pending = p; } }); await pending; }
  return { stores, fetched, caches, lifecycle, request, push, click, clearCache, setOnline(value) { online = value; }, failIcon() { failIcon = true; } };
}

test('install handles individual missing assets and only deletes Dolemon caches', async () => {
  const w = worker();
  await w.caches.open('dolemon-v0.4.0'); await w.caches.open('other-app');
  w.failIcon(); await w.lifecycle('install'); await w.lifecycle('activate');
  assert.ok(await (await w.caches.open('dolemon-shell-v5')).match('/offline.html'));
  assert.equal(w.stores.has('dolemon-v0.4.0'), false);
  assert.equal(w.stores.has('other-app'), true);
});

test('a visited screen opens again offline; a screen never visited shows the offline page', async () => {
  const w = worker(); await w.lifecycle('install');
  const live = await w.request('/app/chat/saved-room', { mode: 'navigate' });
  assert.match(await live.text(), /network:/);
  assert.ok(await (await w.caches.open('dolemon-pages-v5')).match('/app/chat/saved-room'));
  w.setOnline(false);
  const offline = await w.request('/app/chat/saved-room', { mode: 'navigate' });
  assert.match(await offline.text(), /network:/);
  const missing = await w.request('/app/chat/never-opened', { mode: 'navigate' });
  assert.equal(await missing.text(), 'offline page');
});

test('route payloads for app screens are cached; API, downloads and foreign origins are not', async () => {
  const w = worker(); await w.lifecycle('install');
  assert.equal(await w.request('/api/secrets'), undefined);
  assert.equal(await w.request('/api/push/status'), undefined);
  assert.equal(await w.request('/downloads/dolemon-test-1.3.0.apk'), undefined);
  assert.equal(await w.request('/private/image.png'), undefined);
  assert.equal(await w.request('https://example.org/_next/static/a.js'), undefined);
  assert.equal(await w.request('/_next/static/a.js', { method: 'POST' }), undefined);

  const payload = await w.request('/app/chat/room?_rsc=build1');
  assert.match(await payload.text(), /network:/);
  // Stored under the URL without the per-build hash, so the next tap finds it.
  assert.ok(await (await w.caches.open('dolemon-rsc-v5')).match('/app/chat/room'));
  w.setOnline(false);
  const offline = await w.request('/app/chat/room?_rsc=build1');
  assert.match(await offline.text(), /network:/);
});

test('only same-origin Next static assets are cached and cache hits avoid network', async () => {
  const w = worker(); await w.lifecycle('install');
  const first = await w.request('/_next/static/a.js'); assert.equal(first.status, 200);
  const count = w.fetched.length;
  await w.request('/_next/static/a.js'); assert.equal(w.fetched.length, count);
});

test('a stalled navigation is aborted and falls back offline', async () => {
  const w = worker({ hangNavigation: true }); await w.lifecycle('install');
  const response = await w.request('/settings', { mode: 'navigate' });
  assert.equal(await response.text(), 'offline page');
});

test('signing out deletes cached screens but keeps the shell and build assets', async () => {
  const w = worker(); await w.lifecycle('install');
  await w.request('/app/chat/saved-room', { mode: 'navigate' });
  await w.request('/app/chat/saved-room?_rsc=build1');
  await w.request('/_next/static/chunk.js');
  assert.ok(await (await w.caches.open('dolemon-pages-v5')).match('/app/chat/saved-room'));
  await w.clearCache();
  assert.equal(w.stores.has('dolemon-pages-v5'), false);
  assert.equal(w.stores.has('dolemon-rsc-v5'), false);
  assert.equal(w.stores.has('dolemon-shell-v5'), true);
  assert.equal(w.stores.has('dolemon-static-v5'), true);
});

test('push is private and notification clicks are restricted to app chat routes', async () => {
  const w = worker(); const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const note = await w.push({ url: `/app/chat/${id}`, body: 'secret', title: 'secret' });
  assert.equal(note.title, 'Dolemon'); assert.equal(note.options.body, 'You have a new message.');
  assert.equal(await w.click(note.options.data.path), `https://dolemon.test/app/chat/${id}`);
  const unsafe = await w.push({ url: 'https://evil.test/', body: 'secret' });
  assert.equal(unsafe.options.data.path, '/app');
  assert.equal(await w.click('https://evil.test/'), 'https://dolemon.test/app');
});
