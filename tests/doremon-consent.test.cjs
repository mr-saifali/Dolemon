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

test('automatic analysis only runs after opt-in and is cancelled when switched off', async () => {
  let analyses = 0, saves = 0, pending;
  const memory = { summary: 'a', partnerUsername: 'bob', updatedAt: 0 };
  const mock = {
    './local-brain': { localAnalyze() { analyses++; return { memory }; }, localAsk() { return ''; } },
    './memory': { loadDoremonMemory: async () => null, loadDoremonMessages: () => [], saveDoremonMessages() {}, saveDoremonMemory: async () => { saves++; }, loadDoremonStats: async () => null },
    './insights': { localFinalize: () => ({}), viewStats: () => ({}) },
  };
  const oldLoad = Module._load, oldSet = global.setTimeout, oldClear = global.clearTimeout;
  global.setTimeout = (fn, ms) => { if (ms === 2600) { pending = fn; return 9; } return oldSet(fn, ms); };
  global.clearTimeout = (id) => { if (id === 9) pending = null; else oldClear(id); };
  Module._load = function(id, parent, main) { if (parent?.filename.endsWith('use-doremon.ts') && mock[id]) return mock[id]; return oldLoad.call(this, id, parent, main); };
  const { useDoremon } = require('../lib/doremon/use-doremon.ts');
  Module._load = oldLoad;
  const messages = [{ id: '1', author: 'them', kind: 'text', text: 'Hello', at: 1 }];
  function Component({ enabled }) { useDoremon('room', messages, { remote: false, me: 'alice', partner: 'bob', analysisEnabled: enabled }); return null; }
  let view;
  try {
    await act(async () => { view = create(React.createElement(Component, { enabled: false })); });
    assert.equal(pending, undefined); assert.equal(analyses, 0); assert.equal(saves, 0);
    await act(async () => { view.update(React.createElement(Component, { enabled: true })); });
    assert.equal(typeof pending, 'function');
    await act(async () => { view.update(React.createElement(Component, { enabled: false })); });
    assert.equal(pending, null); assert.equal(analyses, 0);
    await act(async () => { view.update(React.createElement(Component, { enabled: true })); });
    await act(async () => { const run = pending; pending = null; run(); });
    assert.equal(analyses, 1); assert.equal(saves, 1);
    await act(async () => view.unmount());
  } finally { global.setTimeout = oldSet; global.clearTimeout = oldClear; Module._load = oldLoad; }
});
