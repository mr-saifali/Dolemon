const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename);
let user = 'alice', inserted, missingSchema = false;
const initial = [
  { id: 'one', conversation_id: 'c', sender_id: 'bob', kind: 'sticker', body: 'dil', created_at: '2026-01-01T00:00:00Z' },
  { id: 'two', conversation_id: 'c', sender_id: 'alice', kind: 'text', body: 'Nice!', reply_to_id: 'one', created_at: '2026-01-01T00:00:01Z' },
];
const sb = {
  auth: { getSession: async () => ({ data: { session: { user: { id: user } } } }) },
  rpc: async () => ({ data: [], error: null }),
  from: () => {
    let payload;
    return {
      insert(value) { payload = value; inserted = value; return this; },
      select() { return this; }, eq() { return this; }, order() { return this; },
      limit() { return Promise.resolve({ data: [...initial].reverse(), error: null }); },
      single() { return Promise.resolve(missingSchema ? { data: null, error: { message: 'column reply_to_id not found' } } : { data: { ...payload, id: 'new', created_at: '2026-01-01T00:00:02Z' }, error: null }); },
    };
  },
};
const original = Module._load;
Module._load = function (id, parent, isMain) {
  if (id === './supabase' && parent.filename.endsWith('/lib/db.ts')) return { getSupabase: () => sb };
  return original.call(this, id, parent, isMain);
};
const { postMessage, loadThread } = require('../lib/db.ts');
Module._load = original;

test('database write stores the reply ID and plain sends work without it', async () => {
  user = 'alice';
  const row = await postMessage('c', 'Nice!', 'text', undefined, 'one');
  assert.equal(inserted.reply_to_id, 'one');
  assert.equal(row.replyToId, 'one');
  await postMessage('c', 'Plain');
  assert.equal(Object.hasOwn(inserted, 'reply_to_id'), false);
  missingSchema = true;
  await assert.rejects(postMessage('c', 'Reply', 'text', undefined, 'one'), /migration 009/);
  missingSchema = false;
});

test('reload resolves quoted authors relative to each participant and labels stickers', async () => {
  user = 'alice';
  let thread = await loadThread('c');
  assert.deepEqual(thread.messages.map((m) => m.id), ['one', 'two']);
  assert.deepEqual(thread.messages[1].replyTo, { id: 'one', author: 'them', text: 'Reaction' });
  user = 'bob';
  thread = await loadThread('c');
  assert.deepEqual(thread.messages[1].replyTo, { id: 'one', author: 'me', text: 'Reaction' });
});
