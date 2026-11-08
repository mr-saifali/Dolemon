const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename);

const conversationRow = { conversation_id: 'conv-1', partner_id: 'p1', partner_username: 'aarohi', last_body: 'hello', last_kind: 'text', last_at: '2026-01-01T00:00:03Z' };
const messageRow = { id: 'm1', conversation_id: 'conv-1', sender_id: 'p1', kind: 'text', body: 'hello', created_at: '2026-01-01T00:00:03Z' };

let online = true;
const sb = {
  auth: { getSession: async () => ({ data: { session: { user: { id: 'me' } } } }) },
  rpc: async () => (online ? { data: [conversationRow], error: null } : { data: null, error: { message: 'Failed to fetch' } }),
  from: () => {
    const chain = {
      select() { return chain; }, eq() { return chain; }, in() { return chain; }, order() { return chain; },
      limit() { return Promise.resolve(online ? { data: [messageRow], error: null } : { data: null, error: { message: 'Failed to fetch' } }); },
      maybeSingle() { return Promise.resolve({ data: null, error: null }); },
      then(resolve) { return Promise.resolve({ data: [], error: null }).then(resolve); },
    };
    return chain;
  },
};

// The cache the DB layer writes through to.
const cache = { conversations: null, threads: new Map(), writes: 0, forgets: [] };
const fakeStore = {
  cacheConversations: (rows) => { cache.conversations = rows; cache.writes++; return Promise.resolve(); },
  readConversations: () => Promise.resolve(cache.conversations),
  cacheThread: (id, messages, me) => { cache.threads.set(id, { messages, me }); cache.writes++; return Promise.resolve(); },
  readThread: (id) => Promise.resolve(cache.threads.get(id) ?? null),
  forgetThread: (id) => { cache.forgets.push(id); return Promise.resolve(); },
};

const original = Module._load;
Module._load = function (id, parent, isMain) {
  if (id === './supabase' && parent.filename.endsWith('/lib/db.ts')) return { getSupabase: () => sb };
  if (id === './offline/store' && parent.filename.endsWith('/lib/db.ts')) return fakeStore;
  return original.call(this, id, parent, isMain);
};
const db = require('../lib/db.ts');
Module._load = original;

test('a successful inbox read refreshes the on-device copy', async () => {
  online = true;
  const rows = await db.listConversations();
  assert.equal(rows.length, 1);
  assert.equal(cache.writes, 1);
  assert.equal(cache.conversations[0].id, 'conv-1');
});

test('an offline inbox read falls back to what is already on the device', async () => {
  online = false;
  const rows = await db.listConversations();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].partnerUsername, 'aarohi');
});

test('with nothing cached the inbox error still surfaces', async () => {
  cache.conversations = null;
  await assert.rejects(db.listConversations(), /Failed to fetch/);
});

test('an offline thread read shows saved messages, and offline sync never uses the cache', async () => {
  online = true;
  const fresh = await db.loadThread('conv-1');
  assert.equal(fresh.messages.length, 1);
  assert.ok(cache.threads.has('conv-1'));

  online = false;
  const cached = await db.loadThread('conv-1');
  assert.equal(cached.messages.length, 1);
  assert.equal(cached.me, 'me');

  await assert.rejects(db.loadThread('conv-1', { strictOfflineSync: true }), /Failed to fetch/);
});

test('deleting a conversation forgets its cached thread', async () => {
  online = true;
  await db.deleteConversation('conv-1');
  assert.deepEqual(cache.forgets, ['conv-1']);
});
