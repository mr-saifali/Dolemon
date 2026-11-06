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

let rows = [], fail = false, calls = 0, subscribed;
const db = {
  INITIAL_THREAD_PAGE_SIZE: 80,
  loadThread: async () => { calls++; if (fail) throw new Error('offline'); return { me: 'alice', messages: rows }; },
  listConversations: async () => [], conversationReadState: async () => null, loadReactions: async () => new Map(),
  markThreadRead: async () => {}, watchReactions: () => () => {}, typingBus: () => ({ stop() {}, ping() {} }),
  watchMessages: (_id, handlers) => { subscribed = handlers.onSubscribed; return () => {}; },
};
const oldLoad = Module._load;
Module._load = function(id, parent, isMain) { if (id === '@/lib/db') return db; if (id === 'sonner') return { toast: { error() {} } }; return oldLoad.call(this, id, parent, isMain); };
const { useRemoteThread } = require('../lib/use-remote-thread.ts');
Module._load = oldLoad;
const mockWindow = new EventTarget();
global.window = mockWindow;
function messages(n) { return Array.from({ length: n }, (_, i) => ({ id: String(i), senderId: 'bob', kind: 'text', body: 'hello', at: i, reactions: [] })); }

test('older-page control appears when the initial 80-message window is full', async () => {
  let thread, view;
  function Component() { thread = useRemoteThread('room'); return null; }
  rows = messages(79);
  await act(async () => { view = create(React.createElement(Component)); });
  assert.equal(thread.messages.length, 79);
  assert.equal(thread.hasOlder, false);
  await act(async () => view.unmount());
  rows = messages(80);
  await act(async () => { view = create(React.createElement(Component)); });
  assert.equal(thread.messages.length, 80);
  assert.equal(thread.hasOlder, true);
  await act(async () => view.unmount());
});

test('a failed initial load retries on reconnect without auto-sending messages', async () => {
  let thread, view;
  function Component() { thread = useRemoteThread('room'); return null; }
  fail = true; rows = messages(1); calls = 0;
  await act(async () => { view = create(React.createElement(Component)); });
  assert.equal(thread.loadError, true); assert.equal(calls, 1);
  fail = false;
  await act(async () => { mockWindow.dispatchEvent(new Event('online')); });
  assert.equal(thread.loadError, false); assert.equal(thread.messages.length, 1); assert.equal(calls, 2);
  await act(async () => view.unmount());
});


test('a disjoint reconnect window leaves older history reachable instead of hiding a gap', async () => {
  let thread, view;
  function Component() { thread = useRemoteThread('room'); return null; }
  rows = messages(10);
  await act(async () => { view = create(React.createElement(Component)); });
  rows = messages(80).map((m, i) => ({ ...m, id: `new-${i}`, at: i + 100 }));
  await act(async () => { subscribed(); await Promise.resolve(); });
  assert.equal(thread.messages.length, 80);
  assert.equal(thread.messages[0].id, 'new-0');
  assert.equal(thread.hasOlder, true);
  await act(async () => view.unmount());
});
