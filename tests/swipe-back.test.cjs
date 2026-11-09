const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (id, parent, ...rest) { if (id.startsWith('@/')) id = path.join(__dirname, '..', id.slice(2)); return resolve.call(this, id, parent, ...rest); };
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const wrapper = read('components/chat/swipe-back.tsx');

test('the chat screen is draggable sideways, elastically, and snaps back under the threshold', () => {
  assert.match(wrapper, /<motion\.div/);
  assert.match(wrapper, /drag="x"/);
  assert.match(wrapper, /dragConstraints=\{\{ left: 0, right: 0 \}\}/);
  assert.match(wrapper, /dragElastic=\{\{ left: 0, right: 1 \}\}/);
  // 100px of travel or a 500px/s flick dismisses; anything less springs home.
  const { shouldDismissChat, SWIPE_DISTANCE, SWIPE_FLICK_VELOCITY } = require('../lib/swipe-back.ts');
  assert.equal(SWIPE_DISTANCE, 100);
  assert.equal(SWIPE_FLICK_VELOCITY, 500);
  assert.equal(shouldDismissChat(101, 0), true);
  assert.equal(shouldDismissChat(15, 501), true);
  assert.equal(shouldDismissChat(100, 500), false);
  assert.equal(shouldDismissChat(40, 100), false);
  assert.equal(shouldDismissChat(-15, 700), false);
  assert.equal(shouldDismissChat(0, 700), false);
  assert.equal(shouldDismissChat(NaN, 700), false);
  assert.equal(shouldDismissChat(150, Infinity), false);
  assert.match(wrapper, /shouldDismissChat\(info\.offset\.x, info\.velocity\.x\)/);
  assert.match(wrapper, /animate\(x, 0, \{ type: "spring"/);
});

test('dragging maps distance onto scale, corner radius, shadow and a fading screen', () => {
  assert.match(wrapper, /useTransform\(x, \(latest\) =>/);
  assert.match(wrapper, /useTransform\(progress, \[0, 1\], \[1, 0\.9\]\)/);
  assert.match(wrapper, /useTransform\(progress, \[0, 0\.45\], \[0, 16\]/);
  assert.match(wrapper, /rgba\(0,0,0,0\.66\)/);
  assert.match(wrapper, /useTransform\(progress, \[0\.6, 1\], \[1, 0\.8\]\)/);
});

test('dismissing slides the screen fully off to the right before navigating exactly once', () => {
  assert.match(wrapper, /animate\(x, width \* 1\.02, \{[\s\S]*?onComplete: finish/);
  assert.doesNotMatch(wrapper, /setTimeout\(finish/);
  assert.match(wrapper, /if \(!mounted\.current \|\| navigated\.current\) return;/);
  assert.match(wrapper, /router\.back\(\)/);
  // a deep link has no inbox in history — replace instead of leaving the app
  assert.match(wrapper, /router\.replace\(fallbackHref\)/);
});

test('the gesture never steals taps, typing or in-bubble swipe-to-reply', () => {
  assert.match(wrapper, /\[role="button"\], \[role="link"\], \[role="dialog"\]/);
  assert.match(wrapper, /\[contenteditable="true"\], \[data-swipe-back="ignore"\]/);
  assert.match(wrapper, /if \(target\.closest\(OWNS_GESTURE\)\) return false;/);
  assert.match(wrapper, /overflowX === "auto" \|\| overflowX === "scroll"/);
});

test('the inbox scrim dims by 40% while a chat is open and clears as it is swiped away', () => {
  const { ChatTransitionLayer } = require('../components/chat/swipe-back.tsx');
  const { renderToStaticMarkup } = require('react-dom/server');
  const html = renderToStaticMarkup(
    React.createElement(ChatTransitionLayer, { chat: React.createElement('div', { id: 'chat-screen' }) }, React.createElement('div', { id: 'inbox' }))
  );
  assert.match(html, /id="inbox"/);
  assert.match(html, /id="chat-screen"/);
  assert.match(html, /bg-black\/40/);
  assert.match(html, /data-chat-scrim/);
  // the scrim sits under the chat screen and above the inbox
  assert.match(html, /pointer-events-none fixed inset-0 z-40/);
  assert.match(wrapper, /const scrim = useSpring\(useTransform\(progress, \[0, 1\], \[1, 0\]\)/);
  assert.match(wrapper, /const stop = progress\.on\("change", push\)/);
  assert.match(wrapper, /backdrop\.set\(1\)/);
});

test('the chat is intercepted into a slot so the inbox stays mounted behind it', () => {
  const layout = read('app/app/layout.tsx');
  assert.match(layout, /ChatTransitionLayer chat=\{chat\}/);
  assert.match(layout, /children: ReactNode;/);
  assert.match(layout, /chat: ReactNode;/);
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'app/app/@chat/default.tsx')));
  const intercepted = read('app/app/@chat/(.)chat/[id]/page.tsx');
  assert.match(intercepted, /export \{ default \} from "\.\.\/\.\.\/\.\.\/chat\/\[id\]\/page"/);
  const page = read('app/app/chat/[id]/page.tsx');
  assert.match(page, /<SwipeBackWrapper>\s*<AppGuard>/);
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'app/app/@chat/(.)chat/[id]/loading.tsx')));
});

test('the header back arrow plays the same exit animation instead of navigating instantly', () => {
  const page = read('app/app/chat/[id]/page.tsx');
  const header = read('components/chat/ChatHeader.tsx');
  assert.match(page, /const swipeBack = useSwipeBackDismiss\(\);/);
  assert.match(page, /onBack=\{swipeBack \?\? \(\(\) => router\.push\("\/app"\)\)\}/);
  assert.match(header, /onBack\?: \(\) => void;/);
  assert.match(header, /<button type="button" onClick=\{onBack\} aria-label="Back to chats"/);
  // the plain link still exists for anywhere the wrapper is not used
  assert.match(header, /<Link href="\/app" aria-label="Back to chats"/);
  // the old edge-swipe shortcut would now fire router.push while the wrapper animates
  assert.doesNotMatch(page, /edgePull/);
});
