const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),path = require('node:path'),Module = require('node:module'),ts = require('typescript');
const resolve=Module._resolveFilename;
Module._resolveFilename=function(id,parent,...rest){if(id.startsWith('@/'))id=path.join(__dirname,'..',id.slice(2));return resolve.call(this,id,parent,...rest)};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,f);
const {enqueueOfflineMutation,syncOfflineMutations}=require('../lib/offline/mutation-queue.ts');
const session={accountId:'alice',generation:'gen-1'};
const edit=(id='op1',messageId='msg1')=>({id,accountId:'alice',conversationId:'chat1',messageId,createdAt:1,expectedRevision:'server-r1',kind:'edit',text:'changed'});
const signal=()=>new AbortController().signal;
const receipt=op=>({messageId:op.messageId,conversationId:op.conversationId,revision:'server-r2',kind:'edit',text:'changed',editedAt:'2026-01-01T00:00:00Z'});
function fixture(){
 let state={revision:0,entries:[]},valid=true,applied=[];
 const check=s=>{if(!valid || s.accountId!==session.accountId || s.generation!==session.generation)throw Error('stale session')};
 return {
  applied,
  invalidate(){valid=false},
  state(){return structuredClone(state)},
  async read(s){check(s);return structuredClone(state)},
  async compareAndSwap(s,rev,entries){check(s);if(rev!==state.revision)return false;state={revision:rev+1,entries:structuredClone(entries)};return true},
  async acknowledge(s,rev,op,result){check(s);if(rev!==state.revision||state.entries[0]?.mutation.id!==op.id)return false;applied.push({op,result});state={revision:rev+1,entries:state.entries.slice(1)};return true},
 };
}
test('only edits, deletes, and reactions can be queued, and operations are account scoped',async()=>{
 const s=fixture();
 for(const bad of [{...edit(),kind:'send'}, {...edit(),accountId:'bob'}, {...edit(),text:'  '}, {...edit(),kind:'reaction',reaction:'bogus'}, {...edit(),id:'../bad'}]) await assert.rejects(enqueueOfflineMutation(s,session,bad));
 await enqueueOfflineMutation(s,session,edit());
 const {text:ignored1,...base2}=edit('op2','msg2'),{text:ignored2,...base3}=edit('op3','msg3');
 await enqueueOfflineMutation(s,session,{...base2,kind:'delete'});
 await enqueueOfflineMutation(s,session,{...base3,kind:'reaction',reaction:'dil'});
 assert.deepEqual(s.state().entries.map(e=>e.status),['pending','pending','pending']);
});
test('duplicate ids are idempotent only for identical payloads; unsent edits can be safely coalesced',async()=>{
 const s=fixture();await enqueueOfflineMutation(s,session,edit());await enqueueOfflineMutation(s,session,edit());
 await assert.rejects(enqueueOfflineMutation(s,session,{...edit(),text:'different'}),/reused/);
 await enqueueOfflineMutation(s,session,{...edit('op2'),text:'latest'});
 assert.equal(s.state().entries.length,1);assert.equal(s.state().entries[0].mutation.text,'latest');assert.equal(s.state().entries[0].mutation.id,'op2');
 await assert.rejects(enqueueOfflineMutation(s,session,{...edit('op3'),expectedRevision:'different'}),/revision changed/);
});
test('lost responses keep the exact operation and retry id; only durable acknowledgement removes it',async()=>{
 const s=fixture();await enqueueOfflineMutation(s,session,edit());const seen=[];
 const server={async apply(_,op){seen.push(structuredClone(op));if(seen.length===1)throw Error('connection lost after remote commit');return {status:'confirmed',authoritative:receipt(op)}}};
 assert.deepEqual(await syncOfflineMutations(s,server,session,signal()),{confirmed:0,pending:1,blocked:'network'});
 assert.equal(s.state().entries[0].status,'inflight');assert.equal(s.applied.length,0);
 assert.deepEqual(await syncOfflineMutations(s,server,session,signal()),{confirmed:1,pending:0,blocked:null});
 assert.deepEqual(seen[0],seen[1]);assert.equal(s.applied.length,1);assert.equal(s.state().entries.length,0);
});
test('conflicts are persisted and prevent later operations being treated as confirmed',async()=>{
 const s=fixture();await enqueueOfflineMutation(s,session,edit());await enqueueOfflineMutation(s,session,edit('op2','msg2'));let calls=0;
 const server={async apply(){calls++;return {status:'conflict'}}};
 assert.deepEqual(await syncOfflineMutations(s,server,session,signal()),{confirmed:0,pending:2,blocked:'conflict'});
 assert.equal(s.state().entries[0].status,'conflict');assert.equal(s.state().entries[1].status,'pending');
 await syncOfflineMutations(s,server,session,signal());assert.equal(calls,1);assert.equal(s.applied.length,0);
});
test('invalidating the native session while a request is in flight prevents local acknowledgement',async()=>{
 const s=fixture();await enqueueOfflineMutation(s,session,edit());
 const server={async apply(_,op){s.invalidate();return {status:'confirmed',authoritative:receipt(op)}}};
 await assert.rejects(syncOfflineMutations(s,server,session,signal()),/stale session/);
 assert.equal(s.applied.length,0);assert.equal(s.state().entries[0].status,'inflight');
});
test('aborting during replay leaves the operation pending even if the network response arrives',async()=>{
 const s=fixture();await enqueueOfflineMutation(s,session,edit());const controller=new AbortController();
 const server={async apply(_,op){controller.abort();return {status:'confirmed',authoritative:receipt(op)}}};
 await assert.rejects(syncOfflineMutations(s,server,session,controller.signal),{name:'AbortError'});
 assert.equal(s.applied.length,0);assert.equal(s.state().entries[0].status,'inflight');
});
test('a failed atomic acknowledgement does not discard the pending operation',async()=>{
 const s=fixture();await enqueueOfflineMutation(s,session,edit());s.acknowledge=async()=>false;
 await assert.rejects(syncOfflineMutations(s,{async apply(_,op){return {status:'confirmed',authoritative:receipt(op)}}},session,signal()),/safely save/);
 assert.equal(s.state().entries[0].status,'inflight');assert.equal(s.applied.length,0);
});
test('concurrent queue inserts use compare-and-swap without losing either change',async()=>{
 const s=fixture();await Promise.all([enqueueOfflineMutation(s,session,edit('op1','msg1')),enqueueOfflineMutation(s,session,edit('op2','msg2'))]);
 assert.deepEqual(s.state().entries.map(e=>e.mutation.id).sort(),['op1','op2']);
});

test('corrupted queue state fails closed rather than replaying an unknown status',async()=>{
 const s=fixture();s.read=async()=>({revision:1,entries:[{mutation:edit(),status:'unknown'}]});let invoked=0;
 await assert.rejects(syncOfflineMutations(s,{async apply(){invoked++;return {status:'confirmed',authoritative:{}}}},session,signal()),/queue is invalid/);
 assert.equal(invoked,0);
});


test('a pending reaction and edit to the same message remain distinct; an inflight edit is never replaced',async()=>{
 const s=fixture();await enqueueOfflineMutation(s,session,edit());
 const {text:ignored,...base}=edit('react1');await enqueueOfflineMutation(s,session,{...base,kind:'reaction',reaction:'dil'});
 assert.equal(s.state().entries.length,2);
 const server={async apply(){throw Error('lost')}};await syncOfflineMutations(s,server,session,signal());
 await assert.rejects(enqueueOfflineMutation(s,session,edit('edit2')),/already syncing/);
 assert.equal(s.state().entries[0].mutation.id,'op1');
});


test('replacing an unsent edit with a delete preserves preceding reaction ordering',async()=>{
 const s=fixture();await enqueueOfflineMutation(s,session,edit());
 const {text:ignored,...reaction}=edit('reaction');await enqueueOfflineMutation(s,session,{...reaction,kind:'reaction',reaction:'dil'});
 const {text:ignored2,...deletion}=edit('delete');await enqueueOfflineMutation(s,session,{...deletion,kind:'delete'});
 assert.deepEqual(s.state().entries.map(entry=>entry.mutation.kind),['reaction','delete']);
 await assert.rejects(enqueueOfflineMutation(s,session,{...reaction,id:'reaction2',kind:'reaction',reaction:'hype'}),/deleted message/);
});


test('an incomplete or mismatched server receipt never removes a pending change',async()=>{
 const s=fixture();await enqueueOfflineMutation(s,session,edit());
 for(const result of [{}, {messageId:'other',conversationId:'chat1',revision:'r2',kind:'delete'}]){
  await assert.rejects(syncOfflineMutations(s,{async apply(){return {status:'confirmed',authoritative:result}}},session,signal()),/Invalid offline server receipt/);
  assert.equal(s.state().entries[0].status,'inflight');assert.equal(s.applied.length,0);
 }
});
