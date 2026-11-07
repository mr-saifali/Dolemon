const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { act, create } = require('react-test-renderer');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(id, parent, ...rest) { if (id.startsWith('@/')) id = path.join(__dirname,'..',id.slice(2)); return resolve.call(this,id,parent,...rest); };
for (const ext of ['.ts','.tsx']) require.extensions[ext] = (mod,file) => mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);
let save = async () => {}, savedImage = null;
const oldLoad = Module._load;
Module._load = function(id,parent,isMain) {
  if (id === '@/lib/custom-wallpaper') return { useCustomWallpaper:() => savedImage, saveCustomWallpaper:(file) => save(file), removeCustomWallpaper: async () => {} };
  return oldLoad.call(this,id,parent,isMain);
};
const { ChatThemePicker } = require('../components/chat/ChatThemePicker.tsx');
Module._load = oldLoad;

const select = (tree, id) => tree.root.findAllByType('input').find((input) => input.props.value === id);
const imageInput = (tree) => tree.root.findAllByType('input').find((input) => input.props.type === 'file');
test('upload selects custom only after successful storage and allows selecting older presets', async () => {
  let selected = [], tree, clicked = 0, saved;
  save = async (file) => { saved = file; };
  await act(async () => { tree = create(React.createElement(ChatThemePicker,{value:'soft-glow',onChange:(id) => selected.push(id)}), { createNodeMock:(node) => node.type === 'input' && node.props.type === 'file' ? {click(){clicked++;}} : null }); });
  const upload = tree.root.findAllByType('button').find((node) => node.children.some((child) => child === 'Upload Custom'));
  await act(async () => upload.props.onClick()); assert.equal(clicked,1);
  await act(async () => imageInput(tree).props.onChange({currentTarget:{files:[{name:'pic.png'}],value:'pic.png'}}));
  assert.equal(saved.name,'pic.png'); assert.deepEqual(selected,['custom']);
  await act(async () => select(tree,'glow-peach').props.onChange()); assert.deepEqual(selected,['custom','glow-peach']);
  await act(async () => tree.unmount());
});

test('upload failures do not change selection and show a useful error', async () => {
  let selected = [], tree;
  save = async () => { throw new Error('Choose an image up to 10 MB.'); };
  await act(async () => { tree = create(React.createElement(ChatThemePicker,{value:'midnight',onChange:(id) => selected.push(id)})); });
  await act(async () => imageInput(tree).props.onChange({currentTarget:{files:[{}],value:'x'}}));
  assert.deepEqual(selected,[]); assert.equal(tree.root.findByProps({role:'alert'}).children.join(''),'Choose an image up to 10 MB.');
  await act(async () => tree.unmount());
});

test('a late upload never overrides a newer theme choice', async () => {
  let selected = [], tree, finish;
  save = () => new Promise((resolve) => { finish = resolve; });
  await act(async () => { tree = create(React.createElement(ChatThemePicker,{value:'soft-glow',onChange:(id) => selected.push(id)})); });
  await act(async () => imageInput(tree).props.onChange({currentTarget:{files:[{}],value:'x'}}));
  await act(async () => select(tree,'midnight').props.onChange());
  await act(async () => finish());
  assert.deepEqual(selected,['midnight']);
  await act(async () => tree.unmount());
});

test('removing the shared image resets custom defaults and overrides', async () => {
  const filename = require.resolve('../components/chat/ChatThemePicker.tsx'); delete require.cache[filename];
  const previous = Module._load; let removed = 0, reset = 0, cleared = 0, selected = [], tree;
  Module._load = function(id,parent,isMain) {
    if (id === '@/lib/custom-wallpaper') return { useCustomWallpaper:() => 'data:image/jpeg;base64,YQ==', saveCustomWallpaper:async()=>{}, removeCustomWallpaper:async()=>{removed++;} };
    if (id === '@/lib/prefs') return {getPrefs:() => ({chatTheme:'custom'}),setPref:(key,value)=>{assert.equal(key,'chatTheme');assert.equal(value,'soft-glow');reset++;}};
    if (id === '@/lib/conversation-meta') return {clearCustomChatThemes:()=>cleared++};
    return previous.call(this,id,parent,isMain);
  };
  let Picker; try { ({ChatThemePicker:Picker}=require(filename)); } finally { Module._load=previous; }
  await act(async () => { tree=create(React.createElement(Picker,{value:'custom',onChange:(id)=>selected.push(id)})); });
  const button = tree.root.findAllByType('button').find((node) => node.children.includes('Remove image'));
  await act(async () => button.props.onClick());
  assert.deepEqual([removed,reset,cleared],[1,1,1]); assert.deepEqual(selected,['soft-glow']);
  await act(async () => tree.unmount());
});
