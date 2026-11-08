const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const sw = fs.readFileSync('public/sw.js', 'utf8');
const has = (needle, message) => assert.ok(sw.includes(needle), message ?? `missing: ${needle}`);

test('the shell caches visited app pages and their route payloads', () => {
  has('dolemon-pages-${VERSION}');
  has('dolemon-rsc-${VERSION}');
  has('const APP_SECTION = /^\\/(app|settings|signin|signup|unlock|download)(\\/|$)/');
  // RSC payloads are keyed without the per-build `_rsc` hash so a reload still hits.
  has('searchParams.delete("_rsc")');
  has('request.mode === "navigate"');
});

test('live data is never served from a cache', () => {
  has('url.pathname.startsWith("/api/")) return;');
  has('url.pathname.startsWith("/downloads/")) return;');
});

test('a sign-out deletes the cached screens', () => {
  has('data.type !== "dolemon:clear-cache"');
  has('caches.delete(PAGE_CACHE), caches.delete(RSC_CACHE)');
});

test('old caches are dropped when the worker activates', () => {
  has('key.startsWith("dolemon-") && !keep.has(key)');
  has('self.skipWaiting()');
  has('self.clients.claim()');
});

test('push delivery stays generic and opens the chat it names', () => {
  has('self.addEventListener("push"');
  has('You have a new message.');
  has('self.addEventListener("notificationclick"');
  has('/^\\/app\\/chat\\/[0-9a-f-]{36}$/i');
  assert.equal(sw.includes('event.data.text()'), false);
});

test('the offline page is the last resort, after any cached screen', () => {
  has('(await pages.match(request.url)) || (await pages.match(url.pathname))');
  has('return page || offlineResponse();');
});
