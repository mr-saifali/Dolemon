const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(id, parent, ...rest) { if (id.startsWith('@/')) id = path.join(__dirname, '..', id.slice(2)); return resolve.call(this, id, parent, ...rest); };
for (const ext of ['.ts','.tsx']) require.extensions[ext] = (m,f) => m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2020, jsx:ts.JsxEmit.ReactJSX, esModuleInterop:true}}).outputText,f);
const { compareStatements } = require('../lib/statement-comparison.ts');
const { ConsistencySheet } = require('../components/chat/consistency-sheet.tsx');

test('simple comparison surfaces cues, never a lie verdict', () => {
  assert.deepEqual(compareStatements('I will meet at 5', 'I will not meet at 7'), {shared:['will','meet'], firstNumbers:['5'],secondNumbers:['7'],negationDiffers:true});
  assert.ok(compareStatements('कल खाना', 'खाना खाया').shared.includes('खाना'));
});

test('sheet only compares two loaded text messages of the same author and removes deleted rows', async () => {
  global.HTMLElement = class {};
  global.document = {activeElement:null};
  global.window = {addEventListener(){}, removeEventListener(){}};
  global.requestAnimationFrame = () => 1; global.cancelAnimationFrame = () => {};
  const rows = [
    {id:'1', author:'them', kind:'text', text:'I will meet at 5', at:1},
    {id:'2', author:'them', kind:'text', text:'I will not meet at 7', at:2},
    {id:'3', author:'me', kind:'text', text:'Mine', at:3},
    {id:'4', author:'them', kind:'image', text:'Not text', at:4},
  ];
  let tree; const close = () => {};
  await act(async () => { tree = create(React.createElement(ConsistencySheet, {messages:rows,onClose:close})); });
  assert.equal(tree.root.findAllByType('option').length, 8); // placeholder plus three per selector
  let selects = tree.root.findAllByType('select');
  await act(async () => { selects[0].props.onChange({target:{value:'1'}}); selects[1].props.onChange({target:{value:'3'}}); });
  let compare = tree.root.findAllByType('button').find(x => x.children.includes('Compare'));
  assert.equal(compare.props.disabled, true);
  await act(async () => { selects[1].props.onChange({target:{value:'2'}}); });
  compare = tree.root.findAllByType('button').find(x => x.children.includes('Compare'));
  assert.equal(compare.props.disabled, false);
  await act(async () => compare.props.onClick());
  assert.equal(tree.root.findAllByType('blockquote').length, 2);
  assert.match(JSON.stringify(tree.toJSON()), /not proof of inconsistency or dishonesty/);
  await act(async () => tree.update(React.createElement(ConsistencySheet, {messages:rows.filter(x => x.id !== '2'),onClose:close})));
  assert.equal(tree.root.findAllByType('blockquote').length, 0);
  await act(async () => tree.unmount());
});
