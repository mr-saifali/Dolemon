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
    if (!online || (failIcon && url.endsWith('icon-192.png'))) throw new Error('offline');
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
  const self = { location: { origin: 'https://dolemon.test' }, clients: { claim: async () => {} }, skipWaiting: async () => {}, addEventListener: (name, fn) => { handlers[name] = fn; } };
  vm.runInNewContext(fs.readFileSync('public/sw.js', 'utf8'), { self, caches, fetch: (...args) => fetcher(...args), URL, Response, AbortController, setTimeout: hangNavigation ? (fn) => { queueMicrotask(fn); return 1; } : setTimeout, clearTimeout });
  async function lifecycle(name) { let pending; handlers[name]({ waitUntil(p) { pending = p; } }); await pending; }
  async function request(path, { method = 'GET', mode = 'cors', headers = {} } = {}) {
    let result; const pending = [];
    handlers.fetch({ request: { method, mode, url: new URL(path, self.location.origin).href, headers: new Headers(headers) }, respondWith(p) { result = p; }, waitUntil(p) { pending.push(p); } });
    if (!result) return undefined;
    const response = await result; await Promise.all(pending); return response;
  }
  return { stores, fetched, caches, lifecycle, request, setOnline(value) { online = value; }, failIcon() { failIcon = true; } };
}

test('install handles individual missing assets and only deletes Dolemon caches', async () => {
  const w = worker();
  await w.caches.open('dolemon-v0.4.0'); await w.caches.open('other-app');
  w.failIcon(); await w.lifecycle('install'); await w.lifecycle('activate');
  assert.ok(await (await w.caches.open('dolemon-shell-v2')).match('/offline.html'));
  assert.equal(w.stores.has('dolemon-v0.4.0'), false);
  assert.equal(w.stores.has('other-app'), true);
});

test('navigation stays network-first and uses a standalone offline page, never private HTML', async () => {
  const w = worker(); await w.lifecycle('install');
  const live = await w.request('/app/chat/private-room', { mode: 'navigate' });
  assert.match(await live.text(), /network:/);
  w.setOnline(false);
  const offline = await w.request('/app/chat/private-room', { mode: 'navigate' });
  assert.equal(await offline.text(), 'offline page');
  assert.equal((await (await w.caches.open('dolemon-shell-v2')).match('/app/chat/private-room')), undefined);
});

test('only same-origin Next static assets are cached and cache hits avoid network', async () => {
  const w = worker(); await w.lifecycle('install');
  assert.equal(await w.request('/api/secrets'), undefined);
  assert.equal(await w.request('/app/chat/secret?_rsc=abc'), undefined);
  assert.equal(await w.request('/_next/static/a.js', { headers: { RSC: '1' } }), undefined);
  assert.equal(await w.request('/private/image.png'), undefined);
  assert.equal(await w.request('https://example.org/_next/static/a.js'), undefined);
  assert.equal(await w.request('/_next/static/a.js', { method: 'POST' }), undefined);
  const first = await w.request('/_next/static/a.js'); assert.equal(first.status, 200);
  const count = w.fetched.length;
  await w.request('/_next/static/a.js'); assert.equal(w.fetched.length, count);
});


test('a stalled navigation is aborted and falls back offline', async () => {
  const w = worker({ hangNavigation: true }); await w.lifecycle('install');
  const response = await w.request('/settings', { mode: 'navigate' });
  assert.equal(await response.text(), 'offline page');
});
