const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const resolve=Module._resolveFilename;
Module._resolveFilename=function(id,parent,...rest){if(id.startsWith('@/'))id=path.join(__dirname,'..',id.slice(2));return resolve.call(this,id,parent,...rest)};
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,filename);
const base='https://project.supabase.co';
let pages=[], pageCalls=[], signedCalls=[], currentUser='alice', localVideo=null;
const sb={auth:{getUser:async()=>({data:{user:currentUser?{id:currentUser}:null},error:null})},storage:{from:bucket=>({createSignedUrl:async(path,seconds)=>{signedCalls.push({bucket,path,seconds});return {data:{signedUrl:`${base}/storage/v1/object/sign/${bucket}/${path}?token=secret`},error:null}}})}};
const originalLoad=Module._load;
Module._load=function(id,parent,isMain){
 if(id==='@/lib/db')return {listOfflineConversationPage:async(after)=>{pageCalls.push(after);return pages.shift()??[]},loadThread:async(id,opts)=>({me:'alice',messages:[],id,opts})};
 if(id==='@/lib/supabase')return {getSupabase:()=>sb};
 if(id==='@/lib/video-storage')return {loadVideoOnDevice:async()=>localVideo};
 return originalLoad.call(this,id,parent,isMain);
};
const {createSupabaseOfflineSource,isAllowedOfflineMediaUrl,downloadOfflineAttachment}=require('../lib/offline/supabase-source.ts');
Module._load=originalLoad;
const c=new AbortController();

test('media allowlist refuses other origins, buckets, chats and encoded paths',()=>{
 const good=`${base}/storage/v1/object/public/chat-media/room/image.jpg`;
 assert.equal(isAllowedOfflineMediaUrl(good,base,'chat-media','room'),true);
 for(const bad of [`https://evil.test/storage/v1/object/public/chat-media/room/image.jpg`,`${base}/storage/v1/object/public/chat-media/other/image.jpg`,`${base}/storage/v1/object/public/chat-media/room/%2fother`,`${base}/storage/v1/object/public/chat-media/room/file%2ename`,`${base}/storage/v1/object/public/private/room/file`,`${good}#fragment`]) assert.equal(isAllowedOfflineMediaUrl(bad,base,'chat-media','room'),false,bad);
 assert.equal(isAllowedOfflineMediaUrl(good,'http://project.supabase.co','chat-media','room'),false);
 assert.equal(isAllowedOfflineMediaUrl(`${base}/storage/v1/object/sign/temporary-chat-videos/room/file?token=secret`,base,'temporary-chat-videos','room','file'),true);
 assert.equal(isAllowedOfflineMediaUrl(`${base}/storage/v1/object/sign/temporary-chat-videos/room/other?token=secret`,base,'temporary-chat-videos','room','file'),false);
});

test('source continues after short pages and checks the account again at the end',async()=>{
 process.env.NEXT_PUBLIC_SUPABASE_URL=base;currentUser='alice';pageCalls=[];pages=[[{id:'a'}],[{id:'b'}],[]];
 const source=createSupabaseOfflineSource('alice');const seen=[];for await(const page of source.conversations(c.signal))seen.push(...page);
 assert.deepEqual(seen.map(x=>x.id),['a','b']);assert.deepEqual(pageCalls,[null,'a','b']);
 assert.equal((await source.thread('a',c.signal)).opts.strictOfflineSync,true);
 pages=[[{id:'a'}],[]]; const iterator=source.conversations(c.signal);await iterator.next();currentUser='bob';
 await assert.rejects(iterator.next(),/Account changed/);currentUser='alice';
 pages=[[{id:'b'}],[{id:'a'}]];
 await assert.rejects(async()=>{for await(const _ of source.conversations(c.signal)){}},/not ordered/);
});

test('fetch is bounded and sends no credentials or referrer',async()=>{
 const original=global.fetch;let options;
 try {
  global.fetch=async(_url,o)=>{options=o;return new Response(new Blob(['hello'],{type:'text/plain'}))};
  const blob=await downloadOfflineAttachment(`${base}/test`,c.signal);assert.equal(await blob.text(),'hello');
  assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');assert.equal(options.referrerPolicy,'no-referrer');
  global.fetch=async()=>new Response('x',{headers:{'content-length':'52428801'}});
  await assert.rejects(downloadOfflineAttachment(`${base}/test`,c.signal),/size limit/);
 } finally {global.fetch=original;}
});

test('temporary videos use account-local data or signed download without removing the server copy',async()=>{
 process.env.NEXT_PUBLIC_SUPABASE_URL=base;currentUser='alice';signedCalls=[];
 const id='12345678-1234-1234-1234-123456789abc';
 const message={conversationId:'room',mediaUrl:`dolemon-video:room:${id}`};
 const source=createSupabaseOfflineSource('alice');localVideo=new Blob(['v'],{type:'video/mp4'});
 assert.equal(await source.attachment(message,c.signal),localVideo);assert.equal(signedCalls.length,0);
 const original=global.fetch;localVideo=null;
 try {
  global.fetch=async()=>new Response(new Blob(['v'],{type:'video/mp4'}));
  assert.equal((await source.attachment(message,c.signal)).size,1);
  assert.deepEqual(signedCalls,[{bucket:'temporary-chat-videos',path:`room/${id}`,seconds:60}]);
  assert.equal(await source.attachment({...message,conversationId:'other'},c.signal),null);
 } finally {global.fetch=original;localVideo=null;}
});

test('attachment streaming cancels once its actual bytes exceed the limit',async()=>{
 const original=global.fetch;let canceled=false;
 const stream=new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(10*1024*1024))},cancel(){canceled=true}});
 try {
  global.fetch=async()=>new Response(stream);
  await assert.rejects(downloadOfflineAttachment(`${base}/test`,c.signal),/size limit/);
  assert.equal(canceled,true);
 } finally {global.fetch=original;}
});
