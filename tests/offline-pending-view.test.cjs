const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const resolve=Module._resolveFilename;Module._resolveFilename=function(id,p,...rest){if(id.startsWith('@/'))id=path.join(__dirname,'..',id.slice(2));return resolve.call(this,id,p,...rest)};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,f);
const {projectPendingChanges}=require('../lib/offline/pending-view.ts');
const session={accountId:'alice',generation:'g1'};
const snap=()=>({version:1,accountId:'alice',savedAt:1,conversations:[{conversation:{id:'chat'},messages:[{id:'m1',conversationId:'chat',body:'server',reactions:[{by:'me',type:'haha'},{by:'them',type:'dil'}]},{id:'m2',conversationId:'chat',body:'keep',reactions:[]}]}]});
const entry=(id,mid,kind,extra={},status='pending')=>({mutation:{id,accountId:'alice',conversationId:'chat',messageId:mid,createdAt:1,expectedRevision:'r1',kind,...extra},status});
test('pending edits and reactions overlay a copy, deletion remains explicitly marked',()=>{
 const s=snap(),before=structuredClone(s),entries=[entry('a','m1','edit',{text:'draft'},'inflight'),entry('b','m1','reaction',{reaction:'wow'}),entry('c','m2','delete')];
 const result=projectPendingChanges(s,session,entries);assert.deepEqual(s,before);const [one,two]=result.conversations[0].messages;
 assert.equal(one.body,'draft');assert.deepEqual(one.reactions,[{by:'them',type:'dil'},{by:'me',type:'wow'}]);assert.deepEqual(one.pending.map(x=>x.status),['inflight','pending']);
 assert.equal(two.body,'keep');assert.equal(two.deletionPending,true);assert.deepEqual(result.detached,[]);
});
test('conflicts and out-of-window pending changes stay visible, account mistakes fail closed',()=>{
 const result=projectPendingChanges(snap(),session,[entry('a','old','delete',{},'conflict')]);assert.deepEqual(result.detached,[{id:'a',kind:'delete',status:'conflict'}]);
 assert.throws(()=>projectPendingChanges(snap(),{accountId:'bob',generation:'g1'},[]),/account mismatch/);
 assert.throws(()=>projectPendingChanges(snap(),session,[{...entry('a','m1','delete'),mutation:{...entry('a','m1','delete').mutation,accountId:'bob'}}]),/Invalid offline queue/);
 assert.throws(()=>projectPendingChanges(snap(),session,[entry('same','m1','delete'),entry('same','m2','delete')]),/Invalid offline queue/);
});
