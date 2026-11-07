const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const {act, create} = require('react-test-renderer');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(id,parent,...rest){if(id.startsWith('@/')) id=path.join(__dirname,'..',id.slice(2));return resolve.call(this,id,parent,...rest)};
for(const ext of ['.ts','.tsx']) require.extensions[ext]=(mod,filename)=>mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,filename);
const {androidUpdateTarget, ANDROID_APK_URL, ANDROID_APK_FILENAME} = require('../lib/android-app.ts');
const {AndroidUpdateNotice} = require('../components/pwa/android-update-notice.tsx');
const wv='Mozilla/5.0 (Linux; Android 10; Pixel; wv) AppleWebKit/537.36';

test('notice targets older marked versions and unmarked Android WebViews, not browsers or current apps',()=>{
  assert.equal(androidUpdateTarget(`${wv} DolemonAndroid/1.0.0`),'older-marked');
  assert.equal(androidUpdateTarget(`${wv} DolemonAndroid/1.1.0`),'older-marked');
  assert.equal(androidUpdateTarget(`${wv} DolemonAndroid/1.2.0`),null);
  assert.equal(androidUpdateTarget(`${wv} DolemonAndroid/1.10.0`),null);
  assert.equal(androidUpdateTarget(`${wv} DolemonAndroid/2.0.0`),null);
  assert.equal(androidUpdateTarget(wv),'unmarked-webview');
  assert.equal(androidUpdateTarget(`${wv} DolemonAndroid/unknown`),null);
  assert.equal(androidUpdateTarget('Mozilla/5.0 (Linux; Android 13; Pixel) Chrome/120.0 Mobile Safari/537.36'),null);
  assert.equal(androidUpdateTarget('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)'),null);
  assert.equal(androidUpdateTarget(`${wv} DolemonAndroid/1.1.0`,'1.2.0'),'older-marked');
  assert.equal(androidUpdateTarget(`${wv} DolemonAndroid/1.1.0`,'bad'),null);
});

test('legacy notice links to the published APK, warns of data loss and dismisses for the session',async()=>{
  const previousNavigator=Object.getOwnPropertyDescriptor(global,'navigator');
  const previousStorage=global.sessionStorage;
  const values=new Map();
  Object.defineProperty(global,'navigator',{configurable:true,value:{userAgent:wv}});
  global.sessionStorage={getItem:(k)=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
  let tree;
  try {
    await act(async()=>{tree=create(React.createElement(AndroidUpdateNotice));});
    const text=JSON.stringify(tree.toJSON());
    assert.match(text,/If you’re using the older Dolemon/);
    assert.match(text,/erases its local app data/);
    assert.match(text,/Versions 1.0 and 1.1 use different signing keys/);
    const link=tree.root.findByType('a');
    assert.equal(link.props.href,ANDROID_APK_URL); assert.equal(link.props.download,ANDROID_APK_FILENAME);
    await act(async()=>tree.root.findByType('button').props.onClick());
    assert.equal(tree.toJSON(),null);
    await act(async()=>tree.unmount());
    await act(async()=>{tree=create(React.createElement(AndroidUpdateNotice));});
    assert.equal(tree.toJSON(),null);
    await act(async()=>tree.unmount());
  } finally {global.sessionStorage=previousStorage;if(previousNavigator)Object.defineProperty(global,'navigator',previousNavigator);else delete global.navigator;}
});
