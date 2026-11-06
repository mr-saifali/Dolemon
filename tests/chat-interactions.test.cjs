const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(id, parent, ...rest) { if (id.startsWith('@/')) id = path.join(__dirname, '..', id.slice(2)); return resolve.call(this, id, parent, ...rest); };
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
const { MessageBubble } = require('../components/chat/MessageBubble.tsx');

test('holding a text or sticker bubble opens its options without activating the tap reaction', async () => {
  const { act, create } = require('react-test-renderer');
  for (const kind of ['text', 'sticker']) {
    let presses = 0, taps = 0, captured;
    const message = { id: kind, author: 'them', kind, text: kind === 'text' ? 'Hello' : '', sticker: kind === 'sticker' ? 'dil' : undefined, at: 0 };
    let tree;
    await act(async () => {
      tree = create(React.createElement(MessageBubble, { message, grouped:false, tail:true, partnerName:'Sam', animateIn:false, onLongPress: (_, anchor) => { presses++; captured = anchor; }, onDoubleTap: () => taps++, onRemoveMyReaction() {}, onRetry() {} }), { createNodeMock: () => ({ getBoundingClientRect: () => ({ top: 100, bottom: 140, left: 30, width: 120 }) }) });
    });
    const bubble = tree.root.findByProps({ role: 'button' });
    await act(async () => { bubble.props.onPointerDown(); await new Promise(resolve => setTimeout(resolve, 330)); bubble.props.onPointerUp(); });
    assert.equal(presses, 1); assert.equal(taps, 0); assert.deepEqual(captured, { top:100, bottom:140, left:30, width:120 });
    await act(async () => tree.unmount());
  }
});
