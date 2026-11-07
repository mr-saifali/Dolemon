const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,filename);
let reactionsError=false, quoteError=false, reactionIds=null, pageTrace=[];
const rows=[{id:'one',conversation_id:'room',sender_id:'bob',kind:'text',body:'hello',created_at:'2026-01-01T00:00:00Z',reply_to_id:'old'}];
const sb={
 auth:{getSession:async()=>({data:{session:{user:{id:'alice'}}}})},
 rpc(name){if(name!=='my_conversations')return Promise.resolve({data:[],error:null});
  const chain={order(column,options){pageTrace.push(['order',column,options]);return this},limit(count){pageTrace.push(['limit',count]);return this},abortSignal(sig){pageTrace.push(['signal',sig]);return this},gt(column,value){pageTrace.push(['gt',column,value]);return this},then(resolve,reject){return Promise.resolve({data:[{conversation_id:'b',partner_id:'x'}],error:null}).then(resolve,reject)}};return chain;},
 from(table){
  const chain={select(){return this},eq(){return this},order(){return this},limit(){return Promise.resolve({data:rows,error:null})},in(column,ids){
   if(table==='message_reactions'){reactionIds=ids;return Promise.resolve({data:[{message_id:'one',user_id:'alice',reaction_type:'dil'}],error:reactionsError?{message:'failed'}:null})}
   if(table==='messages')return {limit:async()=>({data:[],error:quoteError?{message:'failed'}:null})};
  }};return chain;
 }
};
const original=Module._load;
Module._load=function(id,parent,main){if(id==='./supabase' && parent?.filename.endsWith('/lib/db.ts'))return {getSupabase:()=>sb};return original.call(this,id,parent,main)};
const {loadThread,listOfflineConversationPage}=require('../lib/db.ts');Module._load=original;

test('offline conversation paging uses a bounded ordered keyset and forwards cancellation',async()=>{
 const signal=new AbortController().signal;pageTrace=[];const page=await listOfflineConversationPage('a',signal);
 assert.equal(page[0].id,'b');assert.deepEqual(pageTrace,[['order','conversation_id',{ascending:true}],['limit',100],['signal',signal],['gt','conversation_id','a']]);
});

test('offline window fetches reactions only for its messages and refuses incomplete reactions or quotes',async()=>{
 const thread=await loadThread('room',{strictOfflineSync:true});
 assert.deepEqual(reactionIds,['one']);assert.deepEqual(thread.messages[0].reactions,[{type:'dil',by:'me'}]);
 reactionsError=true;try{await assert.rejects(loadThread('room',{strictOfflineSync:true}),/reactions/)}finally{reactionsError=false}
 quoteError=true;try{await assert.rejects(loadThread('room',{strictOfflineSync:true}),/quotes/)}finally{quoteError=false}
});
