const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { act, create } = require('react-test-renderer');

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (id, parent, ...rest) {
  if (id.startsWith('@/')) id = path.join(__dirname, '..', id.slice(2));
  return originalResolve.call(this, id, parent, ...rest);
};
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (mod, filename) => mod._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, filename
);

// Exercise the actual wrapper with controlled animation completion/navigation.
// No real layout or Android performance is claimed by these component tests.
let animations = [];
let navigation = [];
let reduceMotion = false;
const router = { back: () => navigation.push('back'), replace: (url) => navigation.push(url) };
function useValue(initial) {
  const ref = React.useRef(null);
  if (!ref.current) {
    let value = initial;
    const listeners = new Set();
    ref.current = {
      get: () => value,
      set: (next) => { value = next; for (const listener of listeners) listener(value); },
      on: (_event, listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    };
  }
  return ref.current;
}
const MotionDiv = React.forwardRef((props, ref) => React.createElement('div', { ...props, ref }));
const originalLoad = Module._load;
Module._load = function (id, parent, ...rest) {
  if (id === 'next/navigation') return { useRouter: () => router };
  if (id === '@/lib/prefs') return { usePrefs: () => ({ reduceMotion }) };
  if (id === 'framer-motion') return {
    motion: { div: MotionDiv },
    useMotionValue: useValue,
    useTransform: () => useValue(0),
    useSpring: (value) => value,
    useDragControls: () => ({ start() {} }),
    animate: (value, target, options) => {
      const animation = { value, target, options, stopped: false, stop() { this.stopped = true; } };
      animations.push(animation);
      return animation;
    },
  };
  return originalLoad.call(this, id, parent, ...rest);
};
const { SwipeBackWrapper, ChatTransitionLayer, useSwipeBackDismiss, useChatBackdrop } = require('../components/chat/swipe-back.tsx');
Module._load = originalLoad;

let tree;
const previousWindow = global.window;
beforeEach(() => {
  animations = [];
  navigation = [];
  reduceMotion = false;
  global.window = { innerWidth: 390 };
});
afterEach(() => {
  if (tree) act(() => tree.unmount());
  tree = null;
  if (previousWindow === undefined) delete global.window; else global.window = previousWindow;
});
function BackButton() {
  return React.createElement('button', { onClick: useSwipeBackDismiss() }, 'Back');
}
function mount({ intercepted = true } = {}) {
  const chat = React.createElement(SwipeBackWrapper, null, React.createElement(BackButton));
  const element = React.createElement(ChatTransitionLayer, {
    chat: intercepted ? chat : null,
  }, intercepted ? React.createElement('div', null, 'Inbox') : chat);
  act(() => { tree = create(element, { createNodeMock: () => ({ offsetWidth: 390 }) }); });
  return tree.root.findByType('button').props.onClick;
}

test('header back waits for animation completion and repeated taps navigate once', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const back = mount();
  act(() => { back(); back(); });
  assert.equal(animations.length, 1);
  assert.equal(animations[0].target, 390 * 1.02);
  assert.deepEqual(navigation, []);
  t.mock.timers.tick(500);
  assert.deepEqual(navigation, [], 'elapsed wall time does not cut off the animation');
  act(() => { animations[0].options.onComplete(); animations[0].options.onComplete(); });
  assert.deepEqual(navigation, ['back']);
});

test('a short fast right flick dismisses but a slow short swipe springs home', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  mount();
  const screen = () => tree.root.findAllByType('div').find((node) => node.props['data-swipe-back-screen'] === '');
  act(() => screen().props.onDragEnd({}, { offset: { x: 50 }, velocity: { x: 100 } }));
  assert.equal(animations[0].target, 0);
  assert.equal(animations[0].options.type, 'spring');
  act(() => screen().props.onDragEnd({}, { offset: { x: 20 }, velocity: { x: 600 } }));
  assert.equal(animations[1].target, 390 * 1.02);
  assert.deepEqual(navigation, []);
  act(() => animations[1].options.onComplete());
  assert.deepEqual(navigation, ['back']);
});

test('direct-entry chat replaces the inbox route instead of navigating to external history', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const back = mount({ intercepted: false });
  act(() => back());
  act(() => animations[0].options.onComplete());
  assert.deepEqual(navigation, ['/app']);
});

test('only the intercepted slot receives the inbox backdrop context', () => {
  const values = {};
  function Probe({ name }) { values[name] = useChatBackdrop(); return null; }
  act(() => {
    tree = create(React.createElement(ChatTransitionLayer, { chat: React.createElement(Probe, { name: 'slot' }) }, React.createElement(Probe, { name: 'page' })));
  });
  assert.equal(values.page, null);
  assert.ok(values.slot);
});

test('unmount stops animation and late completion never navigates', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const back = mount();
  act(() => back());
  const animation = animations[0];
  act(() => tree.unmount());
  tree = null;
  assert.equal(animation.stopped, true);
  act(() => animation.options.onComplete());
  t.mock.timers.tick(2000);
  assert.deepEqual(navigation, []);
});

test('a blocked navigation restores the chat and allows a fresh dismiss', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const back = mount();
  act(() => back());
  act(() => animations[0].options.onComplete());
  act(() => t.mock.timers.tick(1400));
  assert.equal(animations[1].target, 0);
  act(() => back());
  assert.equal(animations[1].stopped, true);
  act(() => animations[2].options.onComplete());
  assert.deepEqual(navigation, ['back', 'back']);
});

test('reduced-motion preference skips the slide without skipping safe navigation', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  reduceMotion = true;
  const back = mount({ intercepted: false });
  act(() => back());
  assert.equal(animations.length, 0);
  assert.deepEqual(navigation, ['/app']);
  act(() => t.mock.timers.tick(1400));
  assert.equal(animations.length, 0, 'blocked-route recovery respects reduced motion too');
});


test('releasing an active gesture cannot snap home during the header exit animation', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const back = mount();
  act(() => back());
  const screen = tree.root.findAllByType('div').find((node) => node.props['data-swipe-back-screen'] === '');
  act(() => screen.props.onDragEnd({}, { offset: { x: 20 }, velocity: { x: 0 } }));
  assert.equal(animations.length, 1, 'no competing snap-home animation');
  act(() => animations[0].options.onComplete());
  assert.deepEqual(navigation, ['back']);
});


test('unmount cancels blocked-navigation recovery after a completed exit', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const back = mount();
  act(() => back());
  act(() => animations[0].options.onComplete());
  act(() => tree.unmount());
  tree = null;
  act(() => t.mock.timers.tick(2000));
  assert.equal(animations.length, 1, 'no animation created after unmount');
  assert.deepEqual(navigation, ['back']);
});
