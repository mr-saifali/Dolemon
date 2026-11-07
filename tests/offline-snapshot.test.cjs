const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,filename);
const {buildOfflineSnapshot, MAX_OFFLINE_ATTACHMENT_BYTES}=require('../lib/offline/snapshot.ts');
const conv=id=>({id,partnerId:'partner',partnerUsername:id,partnerAvatar:null,partnerAvatarUrl:null,partnerLastSeen:null,lastBody:null,lastKind:null,lastAt:null,lastSender:null,unread:0});
const msg=(conversationId,id,mediaUrl=null)=>({id,conversationId,senderId:'alice',kind:mediaUrl?'image':'text',body:'private',at:1,mediaUrl,reactions:[]});
function fixture() {
  const staged=[], calls=[], output={committed:null,aborted:0};
  const source={
    async *conversations(){yield [conv('not-opened'),conv('second')];yield [conv('third')]},
    async thread(id){calls.push(id);return {me:'alice',messages:Array.from({length:6},(_,i)=>msg(id,`${id}-${i}`,i===0?'https://example.test/picture':null))}},
    async attachment(m){if(m.conversationId==='second')throw Error('download failed');return new Blob(['image'],{type:'image/jpeg'})},
  };
  const transaction={
    async stageAttachment(id,blob){staged.push({id,blob});return `key-${id}`},
    async commitIfCurrent(snapshot){output.committed=snapshot;return true},
    async abort(){output.aborted++},
  };
  return {source,transaction,staged,calls,output};
}
const signal=()=>new AbortController().signal;

test('snapshot covers every page including unopened chats and marks unavailable attachments',async()=>{
  const f=fixture(); const result=await buildOfflineSnapshot('alice',f.source,f.transaction,signal(),()=>42);
  assert.deepEqual(f.calls,['not-opened','second','third']);
  assert.equal(result.savedAt,42);assert.equal(result.conversations.length,3);assert.equal(result.conversations[0].messages.length,6);
  assert.equal(result.conversations[0].messages[0].attachment.state,'saved');
  assert.equal(result.conversations[1].messages[0].attachment.state,'unavailable');
  assert.equal(f.staged.length,2);assert.equal(f.output.committed,result);assert.equal(f.output.aborted,0);
  assert.ok(result.conversations.every(c=>c.messages.every(m=>!('mediaUrl' in m))));
});

test('an account change, incomplete list, invalid window or duplicate aborts instead of replacing cache',async()=>{
  for(const variation of ['account','list','window','duplicate']){
    const f=fixture();
    if(variation==='account')f.source.thread=async(id)=>({me:'bob',messages:[msg(id,'a')]});
    if(variation==='window')f.source.thread=async(id)=>({me:'alice',messages:Array.from({length:7},(_,i)=>msg(id,`${id}-${i}`))});
    if(variation==='list')f.source.conversations=async function*(){yield [conv('a')];throw Error('page failed')};
    if(variation==='duplicate')f.source.conversations=async function*(){yield [conv('a'),conv('a')]};
    await assert.rejects(buildOfflineSnapshot('alice',f.source,f.transaction,signal()));
    assert.equal(f.output.committed,null,variation);assert.equal(f.output.aborted,1,variation);
  }
});

test('storage failure and invalidated native session never report a committed snapshot',async()=>{
  for(const variation of ['storage','invalidated']){
    const f=fixture();
    if(variation==='storage') f.transaction.stageAttachment=async()=>{throw Error('quota exceeded')};
    if(variation==='invalidated') f.transaction.commitIfCurrent=async()=>false;
    await assert.rejects(buildOfflineSnapshot('alice',f.source,f.transaction,signal()));
    assert.equal(f.output.committed,null);assert.equal(f.output.aborted,1);
  }
});

test('cancellation during an attachment read discards staged work and never commits',async()=>{
  const f=fixture();const controller=new AbortController();
  f.source.attachment=async()=>{controller.abort();throw Error('network error')};
  await assert.rejects(buildOfflineSnapshot('alice',f.source,f.transaction,controller.signal),{name:'AbortError'});
  assert.equal(f.output.aborted,1);assert.equal(f.output.committed,null);assert.equal(f.staged.length,0);
});

test('media larger than the bounded item size is marked unavailable without staging',async()=>{
  const f=fixture();f.source.attachment=async()=>({size:MAX_OFFLINE_ATTACHMENT_BYTES+1,type:'application/octet-stream'});
  const result=await buildOfflineSnapshot('alice',f.source,f.transaction,signal());
  assert.equal(f.staged.length,0);assert.equal(result.conversations[0].messages[0].attachment.state,'unavailable');
});

test('missing media and remote avatars are never presented as available offline',async()=>{
 const f=fixture();f.source.conversations=async function*(){yield [{...conv('a'),partnerAvatarUrl:'https://private.example/avatar'}]};
 f.source.thread=async()=>({me:'alice',messages:[{...msg('a','missing'),kind:'image',mediaUrl:null}]});
 const result=await buildOfflineSnapshot('alice',f.source,f.transaction,signal());
 assert.equal(result.conversations[0].conversation.partnerAvatarUrl,null);
 assert.deepEqual(result.conversations[0].messages[0].attachment,{state:'unavailable'});
});
