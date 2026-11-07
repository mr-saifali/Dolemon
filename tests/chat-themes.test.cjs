const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (id, parent, ...rest) {
  if (id.startsWith('@/')) id = path.join(__dirname, '..', id.slice(2));
  return resolve.call(this, id, parent, ...rest);
};
for (const ext of ['.ts', '.tsx']) {
  require.extensions[ext] = (module, filename) => {
    module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
  };
}
const { CHAT_THEMES, DEFAULT_CHAT_THEME, getChatTheme, resolveChatTheme, isLightChatTheme } = require('../lib/chat-themes.ts');
const { ChatThemePicker } = require('../components/chat/ChatThemePicker.tsx');

test('twelve image themes and a safe classic fallback are available', () => {
  assert.equal(CHAT_THEMES.length, 29);
  assert.equal(getChatTheme(undefined).id, DEFAULT_CHAT_THEME);
  assert.equal(getChatTheme('unknown-theme').id, DEFAULT_CHAT_THEME);
  assert.equal(resolveChatTheme('unknown-theme', 'open-sky').id, 'open-sky');
  for (const theme of CHAT_THEMES.filter(theme => theme.image)) {
    assert.equal(getChatTheme(theme.id).id, theme.id);
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'public', theme.image)));
  }
});

test('theme picker exposes a labeled single-choice control with current value', () => {
  const html = renderToStaticMarkup(React.createElement(ChatThemePicker, { value: 'wild-coast', onChange() {} }));
  assert.match(html, /Choose a chat background/);
  assert.equal((html.match(/type="radio"/g) || []).length, 28);
  for (const name of ['Default', 'Midnight', 'Rosewater', 'Pattern', 'Solid']) assert.ok(html.includes(name));
  assert.match(html, /Upload Custom/); assert.match(html, /overflow-x-auto/); assert.match(html, /rounded-full/);
  assert.match(html, /checked="" value="wild-coast"/);
  assert.match(html, /Open sky/);
  assert.match(html, /Golden road/);
  assert.match(html, /Sky garden/);
  assert.match(html, /Aurora dream/);
  assert.match(html, /Endless horizon/);
  for (const name of ['Peach glow', 'Aqua glow', 'Lilac glow']) assert.ok(html.includes(name));
});

test('default and per-chat selections persist independently and reset safely', () => {
  const values = new Map();
  global.window = { localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } };
  const { setPref } = require('../lib/prefs.ts');
  const { patchMeta } = require('../lib/conversation-meta.ts');
  setPref('chatTheme', 'open-sky');
  patchMeta('chat-a', { muted: true, chatTheme: 'wild-coast' });
  patchMeta('chat-b', { chatTheme: 'golden-road' });
  assert.equal(JSON.parse(values.get('dolemon:prefs')).chatTheme, 'open-sky');
  let meta = JSON.parse(values.get('dolemon:chat-meta'));
  assert.equal(meta['chat-a'].chatTheme, 'wild-coast');
  assert.equal(meta['chat-b'].chatTheme, 'golden-road');
  patchMeta('chat-a', { chatTheme: undefined });
  meta = JSON.parse(values.get('dolemon:chat-meta'));
  assert.equal(meta['chat-a'].chatTheme, undefined);
  assert.equal(meta['chat-a'].muted, true);
  assert.equal(meta['chat-b'].chatTheme, 'golden-road');
  patchMeta('chat-a', { chatTheme: 'custom' });
  const { clearCustomChatThemes } = require('../lib/conversation-meta.ts');
  clearCustomChatThemes();
  meta = JSON.parse(values.get('dolemon:chat-meta'));
  assert.equal(meta['chat-a'].chatTheme, undefined);
  assert.equal(meta['chat-a'].muted, true);
  assert.equal(meta['chat-b'].chatTheme, 'golden-road');
  delete global.window;
});

test('luminous themes retain their artwork and use readable label surfaces', () => {
  const { ChatWallpaper, chatThemeStyle } = require('../components/chat/ChatWallpaper.tsx');
  for (const id of ['glow-peach', 'glow-aqua', 'glow-lilac']) {
    const theme = getChatTheme(id);
    assert.equal(isLightChatTheme(theme), true);
    const html = renderToStaticMarkup(React.createElement(ChatWallpaper, { theme }));
    assert.ok(html.includes(theme.image));
    assert.match(html, /bg-black\/60/);
    assert.equal(chatThemeStyle(theme)['--message-incoming'], 'rgba(0,0,0,.2)');
    assert.equal(chatThemeStyle(theme)['--chat-label-text'], '#f4f4f5');
  }
  const dark = getChatTheme('open-sky');
  assert.equal(isLightChatTheme(dark), false);
  assert.match(renderToStaticMarkup(React.createElement(ChatWallpaper, { theme: dark })), /bg-black\/60/);
});

test('missing custom wallpaper remains selectable and explains the fallback', () => {
  const html = renderToStaticMarkup(React.createElement(ChatThemePicker, { value:'custom', onChange(){} }));
  assert.match(html, /checked="" value="custom"/);
  assert.match(html, /custom image is loading or unavailable/);
});
