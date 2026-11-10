const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename);

const store = require('../lib/offline/store.ts');

test('a browser without IndexedDB reads as an empty cache, never as an error', async () => {
  delete global.indexedDB;
  store.setOfflineScope('account-1');
  assert.equal(store.offlineScope(), 'account-1');
  assert.equal(await store.readConversations(), null);
  assert.equal(await store.readThread('conversation-1'), null);
  await store.cacheConversations([{ id: 'c', partnerUsername: 'someone' }]);
  await store.cacheThread('conversation-1', [{ id: 'm' }], 'me');
  await store.forgetThread('conversation-1');
  await store.clearOfflineData();
  assert.equal(store.offlineScope(), null);
});

test('nothing is cached while no account is signed in', async () => {
  store.setOfflineScope(null);
  assert.equal(await store.readConversations(), null);
  assert.equal(await store.readThread('conversation-1'), null);
  await store.cacheThread('conversation-1', [{ id: 'm' }], 'me');
});

test('the cache keeps only the newest messages', () => {
  const messages = Array.from({ length: store.MAX_CACHED_MESSAGES + 25 }, (_, index) => ({ id: `m${index}` }));
  const trimmed = store.trimForCache(messages);
  assert.equal(trimmed.length, store.MAX_CACHED_MESSAGES);
  assert.equal(trimmed[0].id, 'm25');
  assert.equal(trimmed[trimmed.length - 1].id, `m${store.MAX_CACHED_MESSAGES + 24}`);
  assert.equal(store.trimForCache(messages.slice(0, 3)).length, 3);
});

test('signing out clears pages through the service worker when one controls the page', () => {
  const posted = [];
  const previous = Object.getOwnPropertyDescriptor(global, 'navigator');
  Object.defineProperty(global, 'navigator', {
    configurable: true,
    value: { serviceWorker: { controller: { postMessage: (message) => posted.push(message) } } },
  });
  try {
    store.purgePageCache();
    assert.deepEqual(posted, [{ type: 'dolemon:clear-cache' }]);
  } finally {
    if (previous) Object.defineProperty(global, 'navigator', previous);
    else delete global.navigator;
  }
});

test('clearing an already-open offline cache really deletes its private records', async () => {
  global.indexedDB = require('fake-indexeddb').indexedDB;
  store.setOfflineScope('alice');
  await store.cacheThread('chat', [{id:'private'}], 'alice');
  assert.equal((await store.readThread('chat')).messages[0].id,'private');
  await store.clearOfflineData();
  store.setOfflineScope('alice');
  assert.equal(await store.readThread('chat'), null);
  await store.clearOfflineData();
  delete global.indexedDB;
});
