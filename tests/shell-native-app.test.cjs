const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) =>
  mod._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText,
    filename
  );

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const {
  REFRESH_EVENT,
  PULL_TRIGGER_PX,
  PULL_LIMIT_PX,
  pullOffset,
  pullProgress,
  shouldRefresh,
  isAtTop,
} = require('../lib/pull-to-refresh.ts');
const { reuseUnchanged } = require('../lib/thread-identity.ts');

test('pull-to-refresh moves with the finger, damps, and triggers only on a real pull', () => {
  assert.equal(pullOffset(-40), 0, 'upward drags never arm the gesture');
  assert.equal(pullOffset(0), 0);
  assert.equal(pullOffset(10), 10, 'short pulls track the finger 1:1');
  assert.ok(pullOffset(30) < 30, 'long pulls are damped');
  assert.equal(pullOffset(10_000), PULL_LIMIT_PX, 'a long drag stops at the limit');
  assert.equal(shouldRefresh(pullOffset(10)), false);
  assert.equal(shouldRefresh(pullOffset(80)), true);
  assert.equal(shouldRefresh(PULL_TRIGGER_PX), true);
  assert.equal(pullProgress(0), 0);
  assert.equal(pullProgress(PULL_TRIGGER_PX * 2), 1);
  assert.equal(REFRESH_EVENT, 'dolemon:refresh');
});

test('the gesture arms only when the scrolled container is already at its top', () => {
  assert.equal(isAtTop(null), true);
  assert.equal(isAtTop({ scrollTop: 0, scrollHeight: 900, clientHeight: 700 }), true);
  assert.equal(isAtTop({ scrollTop: 12, scrollHeight: 900, clientHeight: 700 }), false);
  assert.equal(isAtTop({ scrollTop: 0, scrollHeight: 700, clientHeight: 700 }), true);
});

test('swipe-down refresh is mounted for the app screens and both screens reload their own data', () => {
  assert.match(read('app/app/layout.tsx'), /<PullToRefresh \/>/);
  const inbox = read('app/app/page.tsx');
  assert.match(inbox, /window\.addEventListener\(REFRESH_EVENT, onPull\)/);
  assert.match(inbox, /refreshInbox/);
  assert.match(inbox, /listConversations\(\)/);
  const chat = read('app/app/chat/[id]/page.tsx');
  assert.match(chat, /const onPull = \(\) => reloadThread\.current\(\)/);
  assert.match(chat, /useShellNotifications\(messages\)/);
  const gesture = read('components/pwa/pull-to-refresh.tsx');
  assert.match(gesture, /isDolemonAndroidShell/);
  assert.match(gesture, /passive: false/);
  assert.match(gesture, /window\.dispatchEvent\(new CustomEvent\(REFRESH_EVENT\)\)/);
});

test('the thread opens with 50 messages and each "load older" adds 50 more', () => {
  const db = read('lib/db.ts');
  assert.match(db, /export const INITIAL_THREAD_PAGE_SIZE = 50;/);
  assert.match(db, /export const OLDER_THREAD_PAGE_SIZE = 50;/);
});

test('unchanged messages keep their identity so typing and incoming messages do not re-render the list', () => {
  const first = [
    { id: 'a', author: 'me', kind: 'text', text: 'hello', at: 1 },
    { id: 'b', author: 'them', kind: 'text', text: 'hi', at: 2 },
  ];
  const rebuilt = [
    { id: 'a', author: 'me', kind: 'text', text: 'hello', at: 1 },
    { id: 'b', author: 'them', kind: 'text', text: 'hi there', at: 2, editedAt: 5 },
  ];
  const merged = reuseUnchanged(first, rebuilt);
  assert.equal(merged[0], first[0], 'an untouched bubble keeps its object');
  assert.notEqual(merged[1], first[1], 'an edited bubble is rebuilt');
  assert.equal(merged[1].text, 'hi there');
  assert.equal(reuseUnchanged([], rebuilt), rebuilt);
  const same = reuseUnchanged(first, [
    { id: 'a', author: 'me', kind: 'text', text: 'hello', at: 1 },
    { id: 'b', author: 'them', kind: 'text', text: 'hi', at: 2 },
  ]);
  assert.equal(same[0], first[0]);
  assert.equal(same[1], first[1]);
  // typing pings are throttled instead of one realtime broadcast per key
  assert.match(read('components/chat/ChatInput.tsx'), /now - lastTypingPing\.current < 1500/);
});

test('the "…" menu panels ship with the chat bundle instead of failing to load in the shell', () => {
  const chat = read('app/app/chat/[id]/page.tsx');
  assert.doesNotMatch(chat, /next\/dynamic/);
  for (const panel of ['ConsistencySheet', 'MessageSearchSheet', 'ChatThemeSheet']) {
    assert.match(chat, new RegExp(`import \\{ ${panel} \\} from "@/components/chat/`), panel);
  }
});

test('the app shows a still launch screen, not a web spinner', () => {
  const guard = read('components/app-guard.tsx');
  assert.doesNotMatch(guard, /Loader2|animate-spin/);
  assert.match(guard, /icons\/icon-192\.png/);
  for (const file of [
    'app/app/loading.tsx',
    'app/app/chat/[id]/loading.tsx',
    'app/app/doremon/[id]/loading.tsx',
    'app/app/room/[id]/loading.tsx',
    'app/app/@chat/(.)chat/[id]/loading.tsx',
  ]) {
    const source = read(file);
    assert.doesNotMatch(source, /animate-|Loader2|rounded-2xl bg-white\/5/, file);
  }
});

test('every user-facing notification string is English', () => {
  const files = [
    'components/chat/MessageList.tsx',
    'components/chat/ChatInput.tsx',
    'components/chat/doremon.tsx',
    'components/pwa/android-update-notice.tsx',
    'components/pwa/push-settings.tsx',
    'public/sw.js',
  ];
  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, /Sirf tum|Theek se|soch raha|tum dono/, file);
  }
  assert.match(read('components/chat/MessageList.tsx'), /Just the two of you/);
  assert.match(read('components/chat/doremon.tsx'), /Doremon is thinking/);
  assert.match(read('public/sw.js'), /You have a new message\./);
});

test('the shell asks for camera, microphone and notifications once, on the first inbox visit', () => {
  const activity = read('android/app/src/main/java/app/dolemon/mobile/MainActivity.java');
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  assert.match(manifest, /android\.permission\.POST_NOTIFICATIONS/);
  assert.match(activity, /PERMISSION_PRIMER/);
  assert.match(activity, /KEY_PRIMER_DONE = "permissions-asked-v1"/);
  assert.match(activity, /if \(prefs\.getBoolean\(KEY_PRIMER_DONE, false\)\) return;/);
  assert.match(activity, /prefs\.edit\(\)\.putBoolean\(KEY_PRIMER_DONE, true\)\.apply\(\)/);
  assert.match(activity, /@JavascriptInterface public void inboxReady\(\)/);
  assert.match(activity, /trusted\(current\)/);
  assert.doesNotMatch(activity, /onPageFinished/);
  assert.match(read('app/app/page.tsx'), /useEffect\(\(\) => \{ askShellPermissionsOnce\(\); \}, \[\]\)/);
  assert.match(activity, /Manifest\.permission\.POST_NOTIFICATIONS/);
  assert.match(activity, /NotificationChannel\(CHANNEL_ID, "Messages"/);
  assert.match(activity, /manager\.areNotificationsEnabled\(\)/);
});

test('the shell drops browser habits: no zoom, no glow, no scrollbars, dark launch screen', () => {
  const activity = read('android/app/src/main/java/app/dolemon/mobile/MainActivity.java');
  assert.match(activity, /settings\.setSupportZoom\(false\)/);
  assert.match(activity, /settings\.setBuiltInZoomControls\(false\)/);
  assert.match(activity, /settings\.setLoadWithOverviewMode\(false\)/);
  assert.match(activity, /settings\.setTextZoom\(100\)/);
  assert.match(activity, /setOverScrollMode\(View\.OVER_SCROLL_NEVER\)/);
  assert.match(activity, /setBackgroundColor\(Color\.rgb\(9, 9, 11\)\)/);
  const theme = read('android/app/src/main/res/values/styles.xml');
  assert.match(theme, /@drawable\/splash_background/);
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'android/app/src/main/res/drawable/splash_background.xml')));
  const css = read('app/globals.css');
  assert.match(css, /html\[data-shell="1"\] \{/);
  assert.match(css, /-webkit-tap-highlight-color: transparent/);
  assert.match(css, /-webkit-user-select: none/);
  assert.match(css, /html\[data-shell="1"\] textarea,/);
  const chrome = read('components/pwa/shell-chrome.tsx');
  assert.match(chrome, /root\.dataset\.shell = "1"/);
  assert.match(chrome, /window\.location\.reload\(\)/);
  assert.match(chrome, /\/api\/app-version/);
  const route = read('app/api/app-version/route.ts');
  assert.match(route, /NEXT_PUBLIC_APP_BUILD/);
  assert.match(route, /no-store/);
  const config = read('next.config.mjs');
  assert.match(config, /NEXT_PUBLIC_APP_BUILD: process\.env\.VERCEL_GIT_COMMIT_SHA \|\| String\(Date\.now\(\)\)/);
});


test('identity reuse never hides same-count reactions, quote edits or media metadata', () => {
  const old = { id: 'a', author: 'them', kind: 'file', text: 'file', at: 1,
    reactions: [{ type: 'dil', by: 'me' }],
    replyTo: { id: 'q', author: 'me', text: 'old quote' },
    media: { url: 'same-url', name: 'old-name' } };
  for (const update of [
    { reactions: [{ type: 'aww', by: 'me' }] },
    { replyTo: { ...old.replyTo, text: 'edited quote' } },
    { media: { ...old.media, name: 'new-name' } },
    { at: 2 },
  ]) {
    const changed = { ...old, ...update };
    assert.equal(reuseUnchanged([old], [changed])[0], changed);
  }
  assert.equal(reuseUnchanged([old], [{ ...old, reactions: old.reactions.map(r => ({ ...r })) }])[0], old);
});
