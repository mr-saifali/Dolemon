const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(id, parent, ...rest) { if (id.startsWith('@/')) id = path.join(__dirname, '..', id.slice(2)); return resolve.call(this, id, parent, ...rest); };
require.extensions['.ts'] = (m,f) => m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'), { compilerOptions: { module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2020, esModuleInterop:true } }).outputText, f);
let calls = [], storageFails = false;
const row = { id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', conversation_id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' };
const db = { from() { let deleting = false; return {
  select() { return this; }, delete() { deleting = true; return this; }, in(key, value) { calls.push(['ids', key, value]); return this; },
  lt(key, value) { calls.push([deleting ? 'delete-before' : 'select-before',key,value]); if (deleting) return Promise.resolve({ error:null }); return this; },
  order() { return this; }, async limit() { return { data:[row], error:null }; },
}; }, storage: { from(bucket) { return { remove: async (paths) => { calls.push(['remove',bucket,paths]); return { error:storageFails ? { message:'failure' } : null }; } }; } } };
const old = Module._load;
Module._load = function(id, parent, main) { if (id === '@supabase/supabase-js') return { createClient: () => db }; if (id === 'next/server') return { NextResponse:{ json: (body, options={}) => ({ body, status:options.status ?? 200 }) } }; return old.call(this,id,parent,main); };
const { GET } = require('../app/api/video/cleanup/route.ts'); Module._load = old;
Object.assign(process.env, { CRON_SECRET:'a'.repeat(32), NEXT_PUBLIC_SUPABASE_URL:'https://db.example', SUPABASE_SERVICE_ROLE_KEY:'service' });
const req = (value) => ({ headers:new Headers({authorization:value}) });

test('cleanup is authenticated and deletes expired storage before metadata', async () => {
  calls = []; storageFails = false;
  assert.equal((await GET(req('Bearer wrong'))).status, 401); assert.equal(calls.length, 0);
  const result = await GET(req(`Bearer ${'a'.repeat(32)}`)); assert.equal(result.status, 200); assert.equal(result.body.deleted, 1);
  assert.equal(calls[0][0], 'select-before'); assert.deepEqual(calls[1], ['remove','temporary-chat-videos',[`${row.conversation_id}/${row.id}`]]);
  assert.equal(calls[2][0], 'ids'); assert.equal(calls[3][0], 'delete-before');
});

test('cleanup never drops registry entries when storage removal fails', async () => {
  calls = []; storageFails = true;
  assert.equal((await GET(req(`Bearer ${'a'.repeat(32)}`))).status, 503);
  assert.equal(calls.some((entry) => entry[0] === 'ids'), false);
});
