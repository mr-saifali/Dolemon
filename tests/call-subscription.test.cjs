const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (m,f) => m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,f);
const {waitForCallSubscription} = require('../lib/call-subscription.ts');

test('a call channel is ready only after actual subscription, and errors fail promptly', async () => {
  for (const [status, expected] of [['SUBSCRIBED',true],['CHANNEL_ERROR',false],['TIMED_OUT',false],['CLOSED',false]]) {
    const result = await waitForCallSubscription({ subscribe: (cb) => cb(status) }, 25);
    assert.equal(result,expected,status);
  }
  assert.equal(await waitForCallSubscription({subscribe() {}}, 5),false);
});

test('abandoned media and failed call channel joins are cleaned up', () => {
  const source = fs.readFileSync('lib/live-call.tsx','utf8');
  assert.match(source, /!subscribed \|\| callRef\.current !== joiningCall/);
  assert.match(source, /removeChannel\(channel\)/);
  assert.match(source, /stream\.getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);
  assert.match(source, /Couldn't connect to call signaling/);
});
