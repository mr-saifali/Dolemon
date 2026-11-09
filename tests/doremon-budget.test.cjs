const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'), { compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020} }).outputText,f);
const { acquireDoremonRequest } = require('../lib/doremon/request-budget.ts');

test('same-account concurrent requests are blocked and release makes the slot available', () => {
 const first=acquireDoremonRequest('parallel',1000);assert.equal(first.allowed,true);
 assert.equal(acquireDoremonRequest('parallel',1001).allowed,false);
 const other=acquireDoremonRequest('another',1001);assert.equal(other.allowed,true);other.release();
 first.release();const next=acquireDoremonRequest('parallel',1002);assert.equal(next.allowed,true);next.release();
});
test('per-minute request cap resets after the window and does not claim a global billing cap',()=>{
 for(let i=0;i<12;i++){const slot=acquireDoremonRequest('limit',1000+i);assert.equal(slot.allowed,true);slot.release();}
 const rejected=acquireDoremonRequest('limit',1020);assert.equal(rejected.allowed,false);assert.ok(rejected.retryAfterSeconds>0);
 const reset=acquireDoremonRequest('limit',61001);assert.equal(reset.allowed,true);reset.release();
});
