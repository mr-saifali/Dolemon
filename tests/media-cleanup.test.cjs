const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(id, parent, ...rest) { if (id.startsWith('@/')) id = path.join(__dirname, '..', id.slice(2)); return resolve.call(this, id, parent, ...rest); };
require.extensions['.ts'] = (m,f) => m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'), { compilerOptions: { module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2020, esModuleInterop:true } }).outputText, f);
let calls = [], storageFails = false, orphans = [];
const db = {
  async rpc(name, params) {
    calls.push([name, params]);
    if (name === 'orphan_chat_media') return { data: orphans.splice(0, 200).map((object_name) => ({ object_name })), error: null };
    return { data: null, error: null };
  },
  storage: { from(bucket) { return { remove: async (paths) => { calls.push(['remove',bucket,paths]); return { error: storageFails ? { message:'failure' } : null }; } }; } },
};
const old = Module._load;
Module._load = function(id, parent, main) { if (id === '@supabase/supabase-js') return { createClient: () => db }; if (id === 'next/server') return { NextResponse:{ json: (body, options={}) => ({ body, status:options.status ?? 200 }) } }; return old.call(this,id,parent,main); };
const { GET } = require('../app/api/media/cleanup/route.ts'); Module._load = old;
Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL:'https://db.example', NEXT_PUBLIC_SUPABASE_ANON_KEY:'anon' });
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

test('orphaned chat media is deleted with the anon key, never through raw SQL', async () => {
  calls = []; storageFails = false; orphans = [
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/one.jpg',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/two.webm',
  ];
  const result = await GET(); assert.equal(result.status, 200); assert.equal(result.body.deleted, 2);
  assert.equal(calls[0][0], 'orphan_chat_media');
  assert.deepEqual(calls[1], ['remove','chat-media',[
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/one.jpg',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/two.webm',
  ]]);
  assert.equal(calls.some((entry) => entry[0] === 'delete'), false);
});

test('storage failure surfaces instead of reporting success', async () => {
  calls = []; storageFails = true; orphans = ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/one.jpg'];
  assert.equal((await GET()).status, 503);
});

test('nothing to clean is a cheap no-op', async () => {
  calls = []; storageFails = false; orphans = [];
  const result = await GET(); assert.equal(result.status, 200); assert.equal(result.body.deleted, 0);
  assert.equal(calls.length, 1);
});
