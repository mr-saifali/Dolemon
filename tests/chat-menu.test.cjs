const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { act, create } = require('react-test-renderer');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(id, parent, ...rest) { if(id.startsWith('@/'))id=path.join(__dirname,'..',id.slice(2));return resolve.call(this,id,parent,...rest); };
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f);
const load=Module._load;
Module._load=function(id,parent,...rest){
 if(id==='@/components/ui/dialog-portal')return {DialogPortal:({children})=>children};
 return load.call(this,id,parent,...rest);
};
const { ChatMenuSheet }=require('../components/chat/ChatHeader.tsx');
Module._load=load;
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

test('every menu action closes the old menu first then dispatches exactly once',async()=>{
 const keys=['doremon','search','compare','voice','video','room','theme','mute','delete'];
 const events=[];
 const actions=keys.map(key=>({key,label:key,icon:null,onSelect:()=>events.push(key)}));
 let tree;
 await act(async()=>{tree=create(React.createElement(ChatMenuSheet,{open:true,name:'A',actions,onClose:()=>events.push('close')}));});
 for(const key of keys){
  const button=tree.root.findAllByType('button').find(node=>node.findAllByType('span').some(span=>span.children.includes(key)));
  assert.ok(button,key);
  await act(async()=>button.props.onClick());
  assert.deepEqual(events.splice(0),['close',key]);
 }
 await act(async()=>tree.unmount());
});

test('explicit inbox and catch-all slot matches clear retained chats on soft navigation',()=>{
 for(const file of ['app/app/@chat/page.tsx','app/app/@chat/[...rest]/page.tsx'])assert.match(read(file),/return null/);
 assert.match(read('app/app/@chat/(.)chat/[id]/page.tsx'),/export \{ default \}/,'chat interception is retained');
});

test('menu and all subordinate panels escape transformed swipe containers',()=>{
 for(const file of ['components/chat/ChatHeader.tsx','components/chat/MessageSearchSheet.tsx','components/chat/consistency-sheet.tsx','components/chat/ChatThemePicker.tsx','components/ui/confirm-dialog.tsx'])assert.match(read(file),/<DialogPortal>/,file);
 assert.match(read('components/ui/dialog-portal.tsx'),/createPortal\(children, document.body\)/);
 assert.match(read('components/chat/ChatHeader.tsx'),/max-h-\[85dvh\].*overflow-y-auto/);
});

test('sharing acknowledgement fails closed without a mounted host, and resolves only from its answer',async()=>{
 const { confirmAction }=require('../lib/confirm-action.ts');
 const previous=global.window;
 try{
  delete global.window;
  assert.equal(await confirmAction('text'),false);
  global.window={dispatchEvent(){}};
  assert.equal(await confirmAction('text'),false);
  let pending;
  global.window={dispatchEvent(event){pending=event.detail;pending.handled=true;}};
  const result=confirmAction('Text goes to the external service');
  assert.equal(pending.message,'Text goes to the external service');
  pending.resolve(false);assert.equal(await result,false);
  const accepted=confirmAction('allow?');pending.resolve(true);assert.equal(await accepted,true);
 }finally{if(previous===undefined)delete global.window;else global.window=previous;}
});
