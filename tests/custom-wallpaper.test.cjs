const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { indexedDB } = require('fake-indexeddb');
const { renderToStaticMarkup } = require('react-dom/server');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(id, parent, ...rest) { if (id.startsWith('@/')) id = path.join(__dirname, '..', id.slice(2)); return resolve.call(this,id,parent,...rest); };
for (const ext of ['.ts','.tsx']) require.extensions[ext] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true} }).outputText,file);
let prepared = 'data:image/jpeg;base64,Zmlyc3Q=';
const oldLoad = Module._load;
Module._load = function(id, parent, isMain) {
  if (id === './media' && parent?.filename.endsWith('custom-wallpaper.ts')) return { compressImage: async (_file, max, quality) => { assert.equal(max,1600); assert.equal(quality,0.8); return {dataUrl:prepared}; } };
  return oldLoad.call(this,id,parent,isMain);
};
const custom = require('../lib/custom-wallpaper.ts');
Module._load = oldLoad;
global.indexedDB = indexedDB;
global.createImageBitmap = () => {};
const mockWindow = new EventTarget(); const values = new Map();
mockWindow.localStorage = {setItem:(key,value) => values.set(key,value), getItem:(key) => values.get(key) ?? null};
global.window = mockWindow;

const file = { type:'image/png', size:100 };
test('custom images validate, resize, persist, replace and delete locally without storing content in localStorage', async () => {
  await custom.removeCustomWallpaper();
  assert.equal(await custom.loadCustomWallpaper(), null);
  await assert.rejects(custom.saveCustomWallpaper({ type:'image/svg+xml', size:10 }), /JPG, PNG or WebP/);
  await assert.rejects(custom.saveCustomWallpaper({ type:'image/jpeg', size:custom.MAX_WALLPAPER_BYTES+1 }), /10 MB/);
  assert.equal(await custom.loadCustomWallpaper(), null);
  let notified = 0; mockWindow.addEventListener('dolemon:wallpaper-changed',() => notified++);
  await custom.saveCustomWallpaper(file);
  assert.equal(await custom.loadCustomWallpaper(), prepared); assert.equal(notified,1);
  assert.ok([...values.values()].every(value => !value.includes('data:image')));
  prepared = 'data:image/jpeg;base64,c2Vjb25k';
  await custom.saveCustomWallpaper(file);
  assert.equal(await custom.loadCustomWallpaper(), prepared);
  await custom.removeCustomWallpaper(); assert.equal(await custom.loadCustomWallpaper(), null);
});

test('failed image preparation never replaces a previously saved wallpaper', async () => {
  prepared = 'data:image/jpeg;base64,b2xk'; await custom.saveCustomWallpaper(file);
  prepared = 'data:image/png;base64,bm90LWpwZWc=';
  await assert.rejects(custom.saveCustomWallpaper(file), /prepare/);
  assert.equal(await custom.loadCustomWallpaper(), 'data:image/jpeg;base64,b2xk');
  await custom.removeCustomWallpaper();
});

test('default and built-in backgrounds render fixed, dark, noninteractive layers', () => {
  delete global.window;
  const { getChatTheme } = require('../lib/chat-themes.ts');
  const { ChatWallpaper, chatThemeStyle } = require('../components/chat/ChatWallpaper.tsx');
  for (const id of ['soft-glow','midnight','rosewater','pattern','solid','open-sky','custom']) {
    const html = renderToStaticMarkup(React.createElement(ChatWallpaper,{theme:getChatTheme(id)}));
    assert.match(html,/fixed inset-0/); assert.match(html,/pointer-events-none/);
    assert.match(html,/aria-hidden="true"/);
    if (id === 'soft-glow') { assert.match(html,/bg-\[#FF5C7A\]\/10/); assert.match(html,/bg-\[#6B4CFF\]\/10/); assert.match(html,/blur-\[100px\]/); }
    if (id === 'midnight') assert.match(html,/noise\.svg/);
    if (id === 'rosewater') assert.match(html,/bg-black\/40/);
    if (id === 'open-sky') assert.match(html,/bg-black\/60/);
    if (id === 'pattern') assert.match(html,/bg-\[#121212\]/);
    if (id === 'solid') assert.match(html,/bg-black/);
    assert.equal(chatThemeStyle(getChatTheme(id))['--chat-label-text'],'#f4f4f5');
  }
  const source = fs.readFileSync('components/chat/ChatWallpaper.tsx','utf8');
  assert.match(source,/object-cover blur-md/); assert.match(source,/theme\.id === "custom" && custom/);
  assert.match(source,/reduceMotion \|\| systemReduceMotion \? 0 : 0\.3/);
});

test('custom image gets a blurred image layer and a 60 percent dark scrim', () => {
  const filename = require.resolve('../components/chat/ChatWallpaper.tsx');
  delete require.cache[filename];
  const previous = Module._load;
  Module._load = function(id,parent,isMain) {
    if (id === '@/lib/custom-wallpaper') return { useCustomWallpaper: () => 'data:image/jpeg;base64,c2FmZQ==' };
    return previous.call(this,id,parent,isMain);
  };
  let ChatWallpaper;
  try { ({ChatWallpaper} = require(filename)); } finally { Module._load = previous; }
  const {getChatTheme} = require('../lib/chat-themes.ts');
  const html = renderToStaticMarkup(React.createElement(ChatWallpaper,{theme:getChatTheme('custom')}));
  assert.match(html,/src="data:image\/jpeg;base64,c2FmZQ=="/);
  assert.match(html,/object-cover blur-md/); assert.match(html,/bg-black\/60/);
});

test('older WebViews fall back to image element decoding and revoke the temporary URL', async () => {
  global.window = mockWindow;
  const oldBitmap = global.createImageBitmap, oldImage = global.Image, oldDoc = global.document;
  const oldCreate = URL.createObjectURL, oldRevoke = URL.revokeObjectURL;
  delete global.createImageBitmap;
  let revoked = '', dimensions;
  global.Image = class { naturalWidth=2000; naturalHeight=1000; set src(value) { assert.equal(value,'blob:temp'); queueMicrotask(() => this.onload()); } };
  global.document = { createElement: () => ({ width:0, height:0, getContext() { return {drawImage:(_img,_x,_y,w,h) => {dimensions=[w,h];}}; }, toDataURL: () => 'data:image/jpeg;base64,ZmFsbGJhY2s=' }) };
  URL.createObjectURL = () => 'blob:temp'; URL.revokeObjectURL = (value) => { revoked = value; };
  try {
    await custom.saveCustomWallpaper(file);
    assert.deepEqual(dimensions,[1600,800]); assert.equal(revoked,'blob:temp');
    assert.equal(await custom.loadCustomWallpaper(),'data:image/jpeg;base64,ZmFsbGJhY2s=');
    await custom.removeCustomWallpaper();
  } finally {
    global.createImageBitmap = oldBitmap; global.Image = oldImage; global.document = oldDoc;
    URL.createObjectURL = oldCreate; URL.revokeObjectURL = oldRevoke; delete global.window;
  }
});

test('device storage failures never appear as a successful save', async () => {
  const old = global.indexedDB; global.indexedDB = undefined;
  prepared = 'data:image/jpeg;base64,YQ==';
  try { await assert.rejects(custom.saveCustomWallpaper(file), /storage is unavailable/); }
  finally { global.indexedDB = old; }
});

test('brightest rosewater and custom wallpaper remain readable under translucent incoming bubbles', () => {
  const luminance = (rgb) => rgb.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126,.7152,.0722][i], 0);
  // Composite black scrim, then the requested 5%-white incoming bubble.
  for (const [rgb, opacity] of [[[206,169,170], .4], [[255,255,255], .6]]) {
    const surface = rgb.map(v => v * (1 - opacity) * .95 + 255 * .05);
    assert.ok(1.05 / (luminance(surface) + .05) >= 4.5);
  }
});
