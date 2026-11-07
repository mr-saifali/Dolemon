const {test}=require('node:test'); const assert=require('node:assert/strict'); const fs=require('node:fs'); const ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,f);
const {loadRoomHistory,saveRoomHistory,deleteRoomHistory}=require('../lib/doremon/room-history.ts');
test('only five recent room exchanges persist, scoped to account and conversation',()=>{
 const storage=new Map(); global.window={localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}};
 try { const rows=Array.from({length:7},(_,i)=>({id:String(i),q:`q${i}`,a:`a${i}`,at:i}));
 assert.equal(saveRoomHistory('alice','thread',rows),true); assert.deepEqual(loadRoomHistory('alice','thread').map(x=>x.id),['2','3','4','5','6']);
 assert.equal(loadRoomHistory('bob','thread'),null); assert.equal(loadRoomHistory('alice','other'),null); assert.equal(saveRoomHistory(null,'thread',rows),false);
 deleteRoomHistory('alice','thread'); assert.equal(loadRoomHistory('alice','thread'),null);
 } finally { delete global.window; }
});
