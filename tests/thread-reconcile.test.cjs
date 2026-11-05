const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { act, create } = require('react-test-renderer');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(id, parent, ...rest) { if (id.startsWith('@/')) id = path.join(__dirname, '..', id.slice(2)); return resolve.call(this, id, parent, ...rest); };
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename);

test('post-subscription catch-up preserves concurrent deletes, inserts and updates', async () => {
  const old = { id: 'one', senderId: 'bob', kind: 'text', body: 'old', at: 1, reactions: [] };
  const second = { id: 'two', senderId: 'bob', kind: 'text', body: 'snapshot', at: 2, reactions: [] };
  const third = { id: 'three', senderId: 'bob', kind: 'text', body: 'new', at: 3, reactions: [] };
  let calls = 0, resolveSnapshot, handlers;
  const db = {
    loadThread: () => ++calls === 1 ? Promise.resolve({ me: 'alice', messages: [old] }) : new Promise((resolve) => { resolveSnapshot = resolve; }),
    listConversations: async () => [], conversationReadState: async () => null, loadReactions: async () => new Map(),
    markThreadRead: async () => {}, watchReactions: () => () => {}, typingBus: () => ({ stop() {}, ping() {} }),
    watchMessages: (_id, h) => { handlers = h; return () => {}; },
  };
  const oldLoad = Module._load;
  Module._load = function(id, parent, isMain) { if (id === '@/lib/db') return db; if (id === 'sonner') return { toast: { error() {} } }; return oldLoad.call(this, id, parent, isMain); };
  const { useRemoteThread } = require('../lib/use-remote-thread.ts');
  Module._load = oldLoad;
  let thread; function Component() { thread = useRemoteThread('room'); return null; }
  let view; await act(async () => { view = create(React.createElement(Component)); });
  assert.equal(thread.messages.length, 1);
  await act(async () => {
    handlers.onSubscribed();
    handlers.onDelete('one');
    handlers.onInsert(third);
    handlers.onUpdate({ ...second, body: 'edited after snapshot' });
    resolveSnapshot({ me: 'alice', messages: [old, second] });
    await Promise.resolve();
  });
  assert.deepEqual(thread.messages.map((m) => [m.id, m.text]), [['two', 'edited after snapshot'], ['three', 'new']]);
  await act(async () => view.unmount());
});
