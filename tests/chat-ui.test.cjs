const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(id, parent, ...rest) { if (id.startsWith('@/')) id = path.join(__dirname, '..', id.slice(2)); return resolve.call(this, id, parent, ...rest); };
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
const { CHAT_THEMES, resolveChatTheme } = require('../lib/chat-themes.ts');
const { messageMenuPosition } = require('../lib/message-menu.ts');
const { ReactionPicker } = require('../components/chat/ReactionPicker.tsx');
const { MessageBubble } = require('../components/chat/MessageBubble.tsx');

function luminance(hex) {
  const rgb = hex.match(/[\da-f]{2}/gi).map((c) => parseInt(c, 16) / 255).map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
test('each wallpaper supplies a distinct readable outgoing bubble and a translucent outline', () => {
  assert.equal(new Set(CHAT_THEMES.map(t => t.bubble)).size, CHAT_THEMES.length);
  for (const theme of CHAT_THEMES) {
    assert.match(theme.bubble, /^#[\da-f]{6}$/i);
    assert.ok(1.05 / (luminance(theme.bubble) + .05) >= 4.5, `${theme.name} needs contrast`);
    assert.match(theme.outline, /^rgba\(/);
  }
  assert.equal(resolveChatTheme('wild-coast', 'open-sky').bubble, CHAT_THEMES.find(t => t.id === 'wild-coast').bubble);
});
test('message menu remains inside narrow and short viewports at either edge', () => {
  for (const viewport of [{ width: 320, height: 568 }, { width: 240, height: 180 }, { width: 1440, height: 900 }]) {
    for (const mine of [true, false]) for (const anchor of [{ top: 16, bottom: 48, left: 2, width: 100 }, { top: viewport.height - 60, bottom: viewport.height - 10, left: viewport.width - 80, width: 78 }, { top: 50, bottom: viewport.height - 50, left: 100, width: 60 }]) {
      const pos = messageMenuPosition(anchor, viewport, mine, 4);
      assert.ok(pos.left >= 0 && pos.left + pos.width <= viewport.width);
      assert.ok(pos.top >= 0 && pos.top + Math.min(56 + 8 + 8 + 4 * 44, pos.maxHeight) <= viewport.height);
    }
  }
});
test('message menu shows appropriate actions and no unavailable forward action', () => {
  const props = { anchor: { top: 100, bottom: 130, left: 20, width: 100 }, editable: true, myReaction: null, onPick() {}, onAction() {}, onClose() {} };
  const own = renderToStaticMarkup(React.createElement(ReactionPicker, { ...props, mine: true }));
  const theirs = renderToStaticMarkup(React.createElement(ReactionPicker, { ...props, mine: false }));
  assert.match(own, /aria-label="Message options"/); assert.match(own, />Reply</); assert.match(own, />Edit</); assert.match(own, />Delete</);
  assert.doesNotMatch(own, />Forward</); assert.doesNotMatch(theirs, />Edit</); assert.doesNotMatch(theirs, />Delete</);
  assert.equal((own.match(/aria-pressed="false"/g) || []).length, 5);
});
test('text and stickers both expose message options and incoming bubbles use the transparent outline', () => {
  const props = { grouped: false, tail: true, partnerName: 'Sam', onLongPress() {}, onDoubleTap() {}, onRemoveMyReaction() {}, onRetry() {}, animateIn: false };
  for (const message of [{id:'1', author:'them', kind:'text', text:'A message', at:0}, {id:'2', author:'them', kind:'sticker', text:'', sticker:'dil', at:0}]) {
    const html = renderToStaticMarkup(React.createElement(MessageBubble, { ...props, message }));
    assert.match(html, /Open message options/);
    if (message.kind === 'text') { assert.match(html, /bg-black\/20/); assert.match(html, /--message-outline/); }
    else { assert.doesNotMatch(html, /bg-black\/20/); assert.match(html, /❤️/); }
  }
});

