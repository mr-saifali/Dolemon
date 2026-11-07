const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const {act,create} = require('react-test-renderer');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(id,parent,...rest) { if(id.startsWith('@/')) id=path.join(__dirname,'..',id.slice(2)); return resolve.call(this,id,parent,...rest); };
require.extensions['.ts'] = (m,f) => m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,f);

const channels=[]; const calls=[];
const sb = { rpc:async (name)=>{calls.push(name); return {data:name==='conversation_read_state'?[{partner_read_at:'2026-01-01T00:00:00Z'}]:null,error:null}},
  channel(topic) { let c=channels.find(c=>c.topic===`realtime:${topic}`); if(c) return c; c={topic:`realtime:${topic}`, events:{}, on(type,filter,fn){this.events[`${type}:${filter.event}`]=fn;return this}, subscribe(fn){this.status=fn;return this},send:async function(payload){this.lastSend=payload;return 'ok'}}; channels.push(c); return c; },
  getChannels:()=>channels, removeChannel(c){const i=channels.indexOf(c);if(i>=0)channels.splice(i,1);return Promise.resolve('ok')},
};
const originalLoad=Module._load;
Module._load=function(id,parent,main){if(id==='./supabase' && parent?.filename.endsWith('/lib/db.ts'))return {getSupabase:()=>sb}; return originalLoad.call(this,id,parent,main)};
const db=require('../lib/db.ts'); Module._load=originalLoad;

test('marking a conversation read never removes its active message subscription',async()=>{
  channels.length=0; calls.length=0; let seen;
  const stop=db.watchMessages('room',{onInsert(){},onRead(at){seen=at}},'me');
  const thread=channels[0];
  await db.markThreadRead('room',true);
  assert.equal(channels[0],thread); assert.equal(channels.length,1); assert.equal(thread.lastSend.event,'read');
  thread.events['broadcast:read']({payload:{user:'attacker',at:9999999999999}});
  await new Promise(r=>setImmediate(r)); assert.equal(seen,Date.parse('2026-01-01T00:00:00Z'));
  await db.markThreadRead('room',false); assert.equal(channels[0],thread);
  stop(); assert.equal(channels.length,0);
});

test('visible polling catches a missed incoming message without navigating, and read race survives send confirmation',async()=>{
  let handlers, timer, result, resolveSend;
  const originalSetInterval=global.setInterval, originalClearInterval=global.clearInterval;
  global.setInterval=(fn)=>{timer=fn;return 1}; global.clearInterval=()=>{};
  const win=new EventTarget(); global.window=win; global.document=new EventTarget(); document.visibilityState='visible';
  const original={id:'a',senderId:'bob',kind:'text',body:'old',at:1,reactions:[]};
  const incoming={id:'b',senderId:'bob',kind:'text',body:'new message',at:2,reactions:[]};
  let rows=[original], loads=0;
  const mock={INITIAL_THREAD_PAGE_SIZE:6,OLDER_THREAD_PAGE_SIZE:6,loadThread:async()=>{loads++;return {me:'alice',messages:rows}},listConversations:async()=>[],conversationReadState:async()=>null,latestMessageId:async()=>rows.at(-1)?.id??null,loadReactions:async()=>new Map(),markThreadRead:async()=>{},watchReactions:()=>()=>{},typingBus:()=>({stop(){},ping(){}}),watchMessages:(_id,h)=>{handlers=h;return()=>{}},postMessage:()=>new Promise(resolve=>{resolveSend=resolve})};
  Module._load=function(id,parent,main){if(id==='@/lib/db')return mock;if(id==='sonner')return {toast:{error(){}}};return originalLoad.call(this,id,parent,main)};
  const {useRemoteThread}=require('../lib/use-remote-thread.ts');Module._load=originalLoad;
  function View(){result=useRemoteThread('room');return null;}
  let view;
  try {
    await act(async()=>{view=create(React.createElement(View))});
    assert.equal(result.messages.length,1);
    rows=[original,incoming];
    await act(async()=>{timer();await new Promise(r=>setImmediate(r))});
    assert.equal(result.messages.at(-1).text,'new message');
    document.visibilityState='hidden'; rows=[...rows,{...incoming,id:'c',body:'later',at:3}]; const before=loads;
    await act(async()=>{timer();await Promise.resolve()}); assert.equal(loads,before);
    document.visibilityState='visible';
    await act(async()=>{result.send('outgoing'); handlers.onRead(Date.now()+1000)});
    await act(async()=>{resolveSend({id:'sent',senderId:'alice',kind:'text',body:'outgoing',at:Date.now(),reactions:[]});await Promise.resolve()});
    assert.equal(result.messages.find(m=>m.id==='sent').status,'read');
    await act(async()=>view.unmount());
  } finally {global.setInterval=originalSetInterval;global.clearInterval=originalClearInterval;Module._load=originalLoad;}
});
