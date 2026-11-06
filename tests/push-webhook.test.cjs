const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, f);
const messageId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', roomId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const events = [], sent = []; let duplicate = false;
const db = { from(table) { return {
  select() { return this; }, eq(column, value) { events.push([table, 'eq', column, value]); return this; },
  async maybeSingle() { return { data: { id: messageId, conversation_id: roomId, sender_id: 'sender' }, error: null }; },
  async neq(column, value) { events.push([table, 'neq', column, value]); return { data: [{ user_id: 'recipient' }], error: null }; },
  async in(column, values) { events.push([table, 'in', column, values]); return { data: [{ id: 'one', endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: 'key', auth_key: 'auth' }, { id: 'bad', endpoint: 'https://127.0.0.1/secret', p256dh: 'key', auth_key: 'auth' }], error: null }; },
  async insert(value) { events.push([table, 'insert', value]); return { error: duplicate ? { code: '23505' } : null }; },
  delete() { return this; },
}; } };
const old = Module._load;
Module._load = function(id, parent, main) {
  if (id === '@/lib/push-endpoint') return require('../lib/push-endpoint.ts');
  if (id === '@supabase/supabase-js') return { createClient: () => db };
  if (id === 'web-push') return { setVapidDetails() {}, async sendNotification(sub, body) { sent.push([sub, body]); } };
  if (id === 'next/server') return { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200 }) } };
  return old.call(this, id, parent, main);
};
const { POST } = require('../app/api/push/message/route.ts');
const { allowedPushEndpoint } = require('../lib/push-endpoint.ts');
Module._load = old;
Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL:'https://db.example', SUPABASE_SERVICE_ROLE_KEY:'service', NEXT_PUBLIC_VAPID_PUBLIC_KEY:'public', VAPID_PRIVATE_KEY:'private', VAPID_SUBJECT:'mailto:hello@example.com', PUSH_WEBHOOK_SECRET:'a'.repeat(32) });
const req = (secret = 'a'.repeat(32), body = { type:'INSERT', schema:'public', table:'messages', record:{ id:messageId, sender_id:'forged' } }) => ({ headers:new Headers({ 'x-dolemon-webhook-secret':secret }), json:async () => body });

test('webhook authenticates, checks the real row, excludes sender and sends generic content only', async () => {
  events.length = 0; sent.length = 0; duplicate = false;
  assert.equal((await POST(req('wrong'))).status, 401); assert.equal(events.length, 0);
  assert.equal((await POST(req('a'.repeat(32), {type:'UPDATE', schema:'public', table:'messages', record:{id:messageId}}))).status, 400);
  const result = await POST(req()); assert.equal(result.status, 200); assert.equal(sent.length, 1);
  assert.deepEqual(events.find(e => e[1] === 'neq'), ['conversation_members','neq','user_id','sender']);
  assert.deepEqual(events.find(e => e[1] === 'in')[3], ['recipient']);
  assert.deepEqual(JSON.parse(sent[0][1]), { url:`/app/chat/${roomId}` });
  duplicate = true; await POST(req()); assert.equal(sent.length, 1);
});

test('push endpoints cannot target internal or lookalike hosts', () => {
  for (const url of ['http://fcm.googleapis.com/test','https://fcm.googleapis.com.evil.test/x','https://evil.test/x','https://127.0.0.1/x','https://foo.push.apple.com@evil.test/x','https://fcm.googleapis.com:8443/x']) assert.equal(allowedPushEndpoint(url), false, url);
  for (const url of ['https://fcm.googleapis.com/x','https://web.push.apple.com/x','https://updates.push.services.mozilla.com/x']) assert.equal(allowedPushEndpoint(url), true, url);
});
