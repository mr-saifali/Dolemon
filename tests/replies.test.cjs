const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { act, create } = require('react-test-renderer');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (id, parent, ...rest) {
  if (id.startsWith('@/')) id = path.join(__dirname, '..', id.slice(2));
  return resolve.call(this, id, parent, ...rest);
};
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename);
const { toRemoteSendOptions } = require('../lib/remote-send-options.ts');

test('composer adapter preserves the reply and media for live sends', () => {
  const replyTo = { id: 'original', author: 'them', text: 'Hello' };
  assert.deepEqual(toRemoteSendOptions({ replyTo }), { kind: 'text', sticker: undefined, replyTo, media: undefined });
  const photo = toRemoteSendOptions({ kind: 'image', replyTo, media: { url: 'data:image/jpeg;base64,AA', ext: 'jpg' } });
  assert.equal(photo.replyTo.id, 'original');
  assert.equal(photo.media.dataUrl, 'data:image/jpeg;base64,AA');
  assert.equal(toRemoteSendOptions({ kind: 'sticker', sticker: 'dil', replyTo }).replyTo.id, 'original');
});

test('reply IDs survive echo, recipient realtime, reload and failed-send retry', async () => {
  let currentUser = 'alice';
  let server = [{ id: 'original', senderId: 'bob', kind: 'text', body: 'Hello', at: 1, reactions: [] }];
  const listeners = new Map();
  let failed = false;
  let inserts = [];
  const viewRow = (row, me) => {
    const original = server.find((m) => m.id === row.replyToId);
    return { ...row, replyTo: original ? { id: original.id, author: original.senderId === me ? 'me' : 'them', text: original.body } : undefined };
  };
  const db = {
    loadThread: async () => ({ me: currentUser, messages: server.map((row) => viewRow(row, currentUser)) }),
    listConversations: async () => [], conversationReadState: async () => null,
    markThreadRead: async () => {}, loadReactions: async () => new Map(),
    watchReactions: () => () => {}, typingBus: () => ({ stop() {}, ping() {} }),
    watchMessages: (_id, handlers, me) => { listeners.set(me, handlers); return () => listeners.delete(me); },
    fetchMessageQuote: async (id, me) => { const row = server.find((m) => m.id === id); return row ? { id, author: row.senderId === me ? 'me' : 'them', text: row.body } : null; },
    postMessage: async (_id, body, kind, media, replyToId) => {
      inserts.push({ body, kind, replyToId });
      if (failed) throw new Error('temporary failure');
      const row = { id: `server-${inserts.length}`, senderId: 'alice', kind, body, at: Date.now(), replyToId, reactions: [] };
      server.push(row);
      for (const handler of listeners.values()) handler.onInsert(row); // echo before POST resolves
      return row;
    },
  };
  const originalLoad = Module._load;
  Module._load = function (id, parent, isMain) {
    if (id === '@/lib/db') return db;
    if (id === 'sonner') return { toast: { error() {} } };
    return originalLoad.call(this, id, parent, isMain);
  };
  const { useRemoteThread } = require('../lib/use-remote-thread.ts');
  Module._load = originalLoad;
  let alice, bob;
  function Alice() { alice = useRemoteThread('room'); return null; }
  function Bob() { bob = useRemoteThread('room'); return null; }
  let a, b;
  await act(async () => { a = create(React.createElement(Alice)); });
  currentUser = 'bob';
  await act(async () => { b = create(React.createElement(Bob)); });
  assert.equal(alice.messages[0].author, 'them');
  assert.equal(bob.messages[0].author, 'me');
  const quote = { id: 'original', author: 'them', text: 'Hello' };
  await act(async () => { alice.send('Reply', toRemoteSendOptions({ replyTo: quote })); });
  assert.equal(inserts[0].replyToId, 'original');
  assert.equal(alice.messages.filter((m) => m.text === 'Reply').length, 1);
  assert.deepEqual(alice.messages.find((m) => m.text === 'Reply').replyTo, quote);
  assert.deepEqual(bob.messages.find((m) => m.text === 'Reply').replyTo, { ...quote, author: 'me' });
  failed = true;
  await act(async () => { alice.send('Retry me', { replyTo: quote }); });
  const fail = alice.messages.find((m) => m.text === 'Retry me');
  assert.equal(fail.status, 'failed');
  failed = false;
  await act(async () => { alice.retry(fail.id); });
  assert.equal(inserts.at(-1).replyToId, 'original');
  assert.equal(alice.messages.find((m) => m.text === 'Retry me').replyTo.id, 'original');
  await act(async () => { a.unmount(); b.unmount(); });
  currentUser = 'bob';
  await act(async () => { b = create(React.createElement(Bob)); });
  assert.deepEqual(bob.messages.find((m) => m.text === 'Reply').replyTo, { ...quote, author: 'me' });
  await act(async () => b.unmount());
});
