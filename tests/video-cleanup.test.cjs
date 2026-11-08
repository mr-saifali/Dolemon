const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(id, parent, ...rest) { if (id.startsWith('@/')) id = path.join(__dirname, '..', id.slice(2)); return resolve.call(this, id, parent, ...rest); };
require.extensions['.ts'] = (m,f) => m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'), { compilerOptions: { module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2020, esModuleInterop:true } }).outputText, f);
let calls = [], storageFails = false, batch = 1;
const row = { video_id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', conversation_id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' };
const db = {
  async rpc(name, params) {
    calls.push([name, params]);
    if (name === 'expired_temporary_videos') {
      if (calls.filter((c) => c[0] === name).length > 1) return { data: [], error: null };
      return { data: Array.from({ length: batch }, () => ({ ...row })), error: null };
    }
    if (name === 'delete_temporary_video_metadata') return { data: params.p_ids.length, error: null };
    return { data: null, error: null };
  },
  storage: { from(bucket) { return { remove: async (paths) => { calls.push(['remove',bucket,paths]); return { error: storageFails ? { message:'failure' } : null }; } }; } },
};
const old = Module._load;
Module._load = function(id, parent, main) { if (id === '@supabase/supabase-js') return { createClient: () => db }; if (id === 'next/server') return { NextResponse:{ json: (body, options={}) => ({ body, status:options.status ?? 200 }) } }; return old.call(this,id,parent,main); };
const { GET } = require('../app/api/video/cleanup/route.ts'); Module._load = old;
Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL:'https://db.example', NEXT_PUBLIC_SUPABASE_ANON_KEY:'anon' });
delete process.env.CRON_SECRET;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const req = (value) => ({ headers:new Headers(value ? {authorization:value} : {}) });

test('cleanup works with the anon key and removes storage before metadata', async () => {
  calls = []; storageFails = false; batch = 1;
  const result = await GET(req()); assert.equal(result.status, 200); assert.equal(result.body.deleted, 1);
  assert.equal(calls[0][0], 'expired_temporary_videos');
  assert.deepEqual(calls[1], ['remove','temporary-chat-videos',[`${row.conversation_id}/${row.video_id}`]]);
  assert.equal(calls[2][0], 'delete_temporary_video_metadata');
  assert.deepEqual(calls[2][1], { p_ids:[row.video_id] });
});

test('cleanup never drops registry entries when storage removal fails', async () => {
  calls = []; storageFails = true; batch = 1;
  assert.equal((await GET(req())).status, 503);
  assert.equal(calls.some((entry) => entry[0] === 'delete_temporary_video_metadata'), false);
});

test('an optional cron secret is enforced when configured', async () => {
  calls = []; storageFails = false; batch = 1;
  process.env.CRON_SECRET = 'a'.repeat(32);
  try {
    assert.equal((await GET(req('Bearer wrong'))).status, 401);
    assert.equal(calls.length, 0);
    assert.equal((await GET(req(`Bearer ${'a'.repeat(32)}`))).status, 200);
  } finally { delete process.env.CRON_SECRET; }
});
