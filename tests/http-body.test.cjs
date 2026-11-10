const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,f);
const {readLimitedJson}=require('../lib/http-body.ts');
const req=(body,headers)=>new Request('https://app.test',{method:'POST',body,headers,duplex:'half'});
test('JSON reader handles UTF-8 and rejects missing, malformed and oversized bodies',async()=>{
 assert.deepEqual(await readLimitedJson(req('{"text":"hello 😊"}'),128),{text:'hello 😊'});
 await assert.rejects(readLimitedJson(req('nope'),128));
 await assert.rejects(readLimitedJson(req('x'.repeat(200)),64),e=>e.status===413);
 await assert.rejects(readLimitedJson(req('{}',{'content-length':'10000'}),64),e=>e.status===413);
 await assert.rejects(readLimitedJson(req(null),64),e=>e.status===400);
});
test('streamed body cannot bypass limit or keep a worker waiting indefinitely',async()=>{
 let cancelled=false;
 const huge=new ReadableStream({start(c){c.enqueue(new Uint8Array(129));},cancel(){cancelled=true;}});
 await assert.rejects(readLimitedJson(req(huge),128),e=>e.status===413);assert.equal(cancelled,true);
 const idle=new ReadableStream({cancel(){cancelled=true;}});cancelled=false;
 await assert.rejects(readLimitedJson(req(idle),128,10),e=>e.status===408);assert.equal(cancelled,true);
});
