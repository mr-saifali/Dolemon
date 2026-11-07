const {test}=require('node:test'); const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),React=require('react');
const {act,create}=require('react-test-renderer'); const resolve=Module._resolveFilename;
Module._resolveFilename=function(id,parent,...rest){if(id.startsWith('@/'))id=path.join(__dirname,'..',id.slice(2));return resolve.call(this,id,parent,...rest)};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,f);
const errors=[]; const notify=()=>{}; notify.error=(msg)=>errors.push(msg);
let posts=0, edits=0, deletes=0, reactions=0, reactionResolve, reactionReject;
const row={id:'msg1',conversationId:'room',senderId:'alice',kind:'text',body:'hello',at:1,reactions:[]};
const db={INITIAL_THREAD_PAGE_SIZE:6,OLDER_THREAD_PAGE_SIZE:6,loadThread:async()=>({me:'alice',messages:[row]}),listConversations:async()=>[],latestMessageId:async()=> 'msg1',conversationReadState:async()=>null,loadReactions:async()=>new Map(),markThreadRead:async()=>{},watchReactions:()=>()=>{},watchMessages:()=>()=>{},typingBus:()=>({stop(){},ping(){}}),postMessage:async()=>{posts++;return row},editMessage:async()=>{edits++;return 2},deleteMessage:async()=>{deletes++},setMyReaction:async()=>{reactions++;return new Promise((res,rej)=>{reactionResolve=res;reactionReject=rej})},removeMyReaction:async()=>{reactions++}};
const oldLoad=Module._load; Module._load=function(id,parent,main){if(id==='@/lib/db')return db;if(id==='sonner')return {toast:notify};return oldLoad.call(this,id,parent,main)};
const {useRemoteThread}=require('../lib/use-remote-thread.ts'); Module._load=oldLoad;
const descriptor=Object.getOwnPropertyDescriptor(global,'navigator'); const win=new EventTarget(); global.window=win;
function setOnline(value){Object.defineProperty(global,'navigator',{configurable:true,value:{onLine:value}})}
test('known-offline sends are rejected, never queued, and offline edits/deletes/reactions report failure',async()=>{
 let hook,view;function Component(){hook=useRemoteThread('room');return null} setOnline(true);await act(async()=>{view=create(React.createElement(Component))});
 setOnline(false);await act(async()=>{assert.equal(hook.send('unsent'),false);hook.react('msg1','dil');await assert.rejects(hook.edit('msg1','changed'),/not yet supported or queued/);await assert.rejects(hook.remove('msg1'),/not yet supported or queued/)});
 assert.equal(posts,0);assert.equal(edits,0);assert.equal(deletes,0);assert.equal(reactions,0);assert.deepEqual(hook.messages.map(m=>m.text),['hello']);assert.ok(errors.some(e=>/not been sent or queued/.test(e)));
 setOnline(true);await act(async()=>{win.dispatchEvent(new Event('online'));await Promise.resolve()});assert.equal(posts,0);
 await act(async()=>view.unmount());
});
test('a reaction only appears after confirmation; a failed or concurrent request is not reported as saved',async()=>{
 let hook,view;function Component(){hook=useRemoteThread('room');return null} setOnline(true); await act(async()=>{view=create(React.createElement(Component))});
 await act(async()=>{hook.react('msg1','dil');hook.react('msg1','wow')});assert.equal(reactions,1);assert.equal(hook.messages[0].reactions.length,0);
 await act(async()=>{reactionReject(Error('lost'));await Promise.resolve()});assert.equal(hook.messages[0].reactions.length,0);assert.ok(errors.some(e=>/could not be confirmed/.test(e)));
 await act(async()=>{hook.react('msg1','dil')});assert.equal(hook.messages[0].reactions.length,0);
 await act(async()=>{reactionResolve();await Promise.resolve()});assert.equal(hook.messages[0].reactions[0].type,'dil');
 await act(async()=>view.unmount());
});
process.on('exit',()=>{if(descriptor)Object.defineProperty(global,'navigator',descriptor);else delete global.navigator;delete global.window});
