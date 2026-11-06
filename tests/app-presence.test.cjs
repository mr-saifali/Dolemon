const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(id, parent, ...rest) { if (id.startsWith('@/')) id = path.join(__dirname, '..', id.slice(2)); return resolve.call(this, id, parent, ...rest); };
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f);
const { openAppPresenceChannel } = require('../lib/app-presence-channel.ts');
const { ChatRow } = require('../components/home/chat-row.tsx');
const { ChatHeader } = require('../components/chat/ChatHeader.tsx');
const tick = () => new Promise(resolve => setImmediate(resolve));
function fake() {
  const c = { state:{}, tracks:0, untracks:0, on(_type,_filter,fn){this.sync=fn; return this}, subscribe(fn){this.status=fn; return this}, track(){this.tracks++; return Promise.resolve('ok')}, untrack(){this.untracks++; return Promise.resolve('ok')}, presenceState(){return this.state} };
  const client = { channel(name, options){this.name=name; this.options=options; return c}, removeChannel(){this.removed=true; return Promise.resolve('ok')} };
  return {c, client};
}

test('private presence tracks while visible and sharing, handles multiple devices and connection errors', async () => {
  global.document = {visibilityState:'visible'};
  const {c,client} = fake(); let sharing=true; const values=[];
  const bus = openAppPresenceChannel(client, 'room', 'me', 'partner', () => sharing, x => values.push(x));
  assert.equal(client.name, 'app-presence:room'); assert.equal(client.options.config.private, true);
  c.status('SUBSCRIBED'); await tick(); assert.equal(c.tracks,1); assert.equal(values.at(-1),'unavailable');
  c.state = {me:[{}], unrelated:[{}]}; c.sync(); assert.equal(values.at(-1),'not-visible');
  c.state.partner = [{},{}]; c.sync(); assert.equal(values.at(-1),'online');
  c.state.partner = [{}]; c.sync(); assert.equal(values.at(-1),'online');
  c.state.partner = []; c.sync(); assert.equal(values.at(-1),'not-visible');
  document.visibilityState='hidden'; bus.updateSharing(); await tick(); assert.equal(c.untracks,1);
  document.visibilityState='visible'; sharing=false; bus.updateSharing(); await tick(); assert.equal(c.untracks,2);
  sharing=true; bus.updateSharing(); await tick(); assert.equal(c.tracks,2);
  c.status('CHANNEL_ERROR'); assert.equal(values.at(-1),'unavailable'); c.sync(); assert.equal(values.at(-1),'unavailable');
  c.status('SUBSCRIBED'); await tick(); c.state.partner=[{}]; c.sync(); assert.equal(values.at(-1),'online');
  bus.disconnected(); assert.equal(values.at(-1),'unavailable');
  bus.stop(); c.sync(); assert.equal(values.at(-1),'unavailable'); assert.equal(client.removed,true);
});

test('late sharing changes settle to the latest state and stop prevents queued tracks', async () => {
  global.document = {visibilityState:'visible'};
  const {c,client} = fake(); let sharing=true;
  const bus = openAppPresenceChannel(client,'room','me','partner',()=>sharing,()=>{});
  c.status('SUBSCRIBED'); sharing=false; bus.updateSharing(); await tick();
  assert.equal(c.tracks,0); assert.equal(c.untracks,2);
  sharing=true; bus.updateSharing(); bus.stop(); await tick(); assert.equal(c.tracks,0);
});

test('green inbox dot depends on online presence, never merely typing; chat header shows status', () => {
  const chat = {id:'x',name:'Sam',handle:'sam',avatarId:null,preview:'hello',at:null,unread:0};
  let html = renderToStaticMarkup(React.createElement(ChatRow,{chat:{...chat,typing:true,online:false}}));
  assert.doesNotMatch(html,/aria-label="Online"/);
  html = renderToStaticMarkup(React.createElement(ChatRow,{chat:{...chat,online:true}}));
  assert.match(html,/aria-label="Online"/);
  const header = renderToStaticMarkup(React.createElement(ChatHeader,{name:'Sam',avatarId:null,online:false,status:'offline or not sharing',typing:false,onMenu(){}}));
  assert.match(header,/offline or not sharing/); assert.doesNotMatch(header,/aria-label="Online"/);
});

test('provider tracks conversations throughout app navigation, honors preferences and cleans up on sign out', async () => {
  const {create, act} = require('react-test-renderer');
  let pathName='/app', account={id:'me',profileComplete:true,hasAppLock:false}, show=true;
  let rows=[{id:'one',partnerId:'p1'}, {id:'two',partnerId:'p2'}], view, value;
  const opened=[], removed=[], updates=[];
  const events={}; global.document={visibilityState:'visible', addEventListener:(name,fn)=>{events[name]=fn}, removeEventListener:(name)=>{delete events[name]}};
  global.window={addEventListener:(name,fn)=>{events[name]=fn},removeEventListener:(name)=>{delete events[name]}};
  const old = Module._load;
  Module._load = function(id,parent,main) {
    if (parent?.filename.endsWith('/lib/app-presence.tsx')) {
      if (id==='next/navigation') return {usePathname:()=>pathName};
      if (id==='./auth') return {authMode:'supabase'};
      if (id==='./session') return {useSession:()=>({account})};
      if (id==='./prefs') return {usePrefs:()=>({showPresence:show})};
      if (id==='./db') return {listConversations:async()=>rows};
      if (id==='./supabase') return {getSupabase:()=>({})};
      if (id==='./app-presence-channel') return {openAppPresenceChannel(_client,id,_me,partner,share,onChange){opened.push({id,partner,share,onChange}); return {updateSharing(){updates.push([id,share()])},disconnected(){},stop(){removed.push(id)}}}};
    }
    return old.call(this,id,parent,main);
  };
  const {AppPresenceProvider,useAppPresence} = require('../lib/app-presence.tsx'); Module._load=old;
  function Consumer(){value=useAppPresence();return null;}
  const render = () => React.createElement(AppPresenceProvider,null,React.createElement(Consumer));
  await act(async()=>{view=create(render()); await tick();});
  assert.deepEqual(opened.map(x=>x.id),['one','two']);
  await act(async()=>opened[0].onChange('online')); assert.equal(value.one,'online');
  pathName='/app/chat/one'; await act(async()=>{view.update(render());await tick()}); assert.equal(opened.length,2);
  show=false; await act(async()=>view.update(render())); assert.deepEqual(updates.slice(-2),[['one',false],['two',false]]);
  rows=[{id:'two',partnerId:'p2'}, {id:'three',partnerId:'p3'}];
  await act(async()=>{events.visibilitychange();await tick()}); assert.ok(removed.includes('one')); assert.equal(value.one,undefined); assert.equal(opened.at(-1).id,'three');
  account=null; await act(async()=>view.update(render())); assert.ok(removed.includes('two')); assert.ok(removed.includes('three')); assert.deepEqual(value,{});
  await act(async()=>view.unmount());
});
