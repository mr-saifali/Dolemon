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
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, file);
const { isEmojiOnly } = require('../lib/emoji.ts');
const { REACTION_EMOJI, REACTION_TYPES } = require('../lib/reactions.ts');
const { ReactionIcon } = require('../components/reactions/index.tsx');
const { MessageBubble } = require('../components/chat/MessageBubble.tsx');
const { ChatAvatar, ChatRow } = require('../components/home/chat-row.tsx');

const props = { grouped: false, tail: true, partnerName: 'Sam', onLongPress() {}, onDoubleTap() {}, onRemoveMyReaction() {}, onRetry() {}, animateIn: false };

test('emoji detection handles sequences without treating mixed text or numbers as emoji', () => {
  for (const value of ['😂', ' ❤️ 🥹 ', '👩🏽‍💻', '🇮🇳', '1️⃣', '👨‍👩‍👧‍👦', '🔥\n✨']) assert.equal(isEmojiOnly(value), true, value);
  for (const value of ['', '  ', 'hello ❤️', '123', 'x😂', '©2026']) assert.equal(isEmojiOnly(value), false, value);
});

test('emoji-only messages and old sticker IDs have no message bubble, but remain interactive', () => {
  for (const message of [{ id:'1', author:'them', kind:'text', text:'👩🏽‍💻 ❤️', at:0 }, { id:'2', author:'me', kind:'sticker', text:'', sticker:'dil', at:0 }]) {
    const html = renderToStaticMarkup(React.createElement(MessageBubble, { ...props, message }));
    assert.match(html, /Open message options/);
    assert.doesNotMatch(html, /bg-black\/20|--message-outgoing/);
  }
  const mixed = renderToStaticMarkup(React.createElement(MessageBubble, { ...props, message: { id:'3', author:'them', kind:'text', text:'Hello 👋', at:0 } }));
  assert.match(mixed, /bg-black\/20/);
});

test('legacy reaction IDs map to native emoji, not custom SVG', () => {
  for (const type of REACTION_TYPES) {
    const html = renderToStaticMarkup(React.createElement(ReactionIcon, { type }));
    assert.ok(html.includes(REACTION_EMOJI[type]));
    assert.match(html, /Apple Color Emoji/);
    assert.doesNotMatch(html, /<svg/);
  }
});

test('inbox avatars are circular with a truthful online marker and rows omit checkmarks', () => {
  const avatar = renderToStaticMarkup(React.createElement(ChatAvatar, { avatarId:'rose', name:'Sam', online:true }));
  assert.match(avatar, /width:48px;height:48px/);
  assert.match(avatar, /rounded-full/);
  assert.match(avatar, /aria-label="Online"/);
  const html = renderToStaticMarkup(React.createElement(ChatRow, { chat:{ id:'x', name:'Sam', handle:'sam', avatarId:null, preview:'hello', at:Date.now(), unread:2 } }));
  assert.match(html, /2 unread messages/);
  assert.match(html, /font-bold/);
  assert.match(html, /text-\[#FF5C7A\]/);
  assert.doesNotMatch(html, /Delivered|Seen|CheckCheck/);
});
