const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { act, create } = require('react-test-renderer');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, f);
const { useRoomMusic } = require('../lib/use-room-music.ts');
let config, plays, pauses, destroys, container;
global.window = { YT: { Player: class { constructor(_host, options) { config = options; } playVideo() { plays++; } pauseVideo() { pauses++; } destroy() { destroys++; } } } };
global.document = { createElement: () => ({}) };
function setup() { config = null; plays = 0; pauses = 0; destroys = 0; container = { isConnected: true, appendChild() {}, replaceChildren() {} }; }

test('music starts when the room is ready, loops the existing track and stops on user action', async () => {
  setup(); let music, view;
  function Component({ enabled }) { music = useRoomMusic(enabled); return React.createElement('div', { ref: music.containerRef }); }
  await act(async () => { view = create(React.createElement(Component, { enabled: false }), { createNodeMock: () => container }); });
  assert.equal(plays, 0);
  await act(async () => { view.update(React.createElement(Component, { enabled: true })); });
  assert.equal(config.videoId, '5ozrYtnqgDo'); assert.equal(config.playerVars.loop, 1); assert.equal(config.playerVars.autoplay, 1);
  await act(async () => { config.events.onReady(); config.events.onStateChange({ data: 1 }); });
  assert.equal(music.state, 'playing'); assert.equal(music.wantsPlayback, true); assert.ok(plays > 0);
  await act(async () => music.toggle());
  assert.equal(music.state, 'paused'); assert.equal(music.wantsPlayback, false); assert.ok(pauses > 0);
  await act(async () => view.unmount()); assert.equal(destroys, 1);
});

test('autoplay restrictions offer a retry, and stopping while loading prevents late playback', async () => {
  setup(); let music, view;
  function Component() { music = useRoomMusic(true); return React.createElement('div', { ref: music.containerRef }); }
  await act(async () => { view = create(React.createElement(Component), { createNodeMock: () => container }); });
  await act(async () => config.events.onAutoplayBlocked());
  assert.equal(music.state, 'needs-tap');
  await act(async () => music.stop());
  const count = plays;
  await act(async () => config.events.onReady());
  assert.equal(plays, count); assert.equal(music.state, 'paused');
  await act(async () => view.unmount());
});
