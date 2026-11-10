const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, f);
const messageId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', roomId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const events = [], sent = []; let duplicate = false, unauthorized = false, forget = [];
const db = { rpc(name, params) {
  events.push([name, params]);
  if (name === 'push_delivery_targets') {
    if (unauthorized) return { data: null, error: { code: '28000', message: 'UNAUTHORIZED' } };
    if (duplicate) return { data: [], error: null };
    return { data: [
      { subscription_id: 'one', endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: 'key', auth_key: 'auth', conversation_id: roomId },
      { subscription_id: 'bad', endpoint: 'https://127.0.0.1/secret', p256dh: 'key', auth_key: 'auth', conversation_id: roomId },
      { subscription_id: 'gone', endpoint: 'https://updates.push.services.mozilla.com/x', p256dh: 'key', auth_key: 'auth', conversation_id: roomId },
    ], error: null };
  }
  if (name === 'push_forget_subscription') { forget.push(params.p_subscription_id); return { data: null, error: null }; }
  return { data: null, error: null };
} };
const old = Module._load;
Module._load = function(id, parent, main) {
  if (id === '@/lib/http-body') return require('../lib/http-body.ts');
  if (id === '@/lib/push-endpoint') return require('../lib/push-endpoint.ts');
  if (id === '@supabase/supabase-js') return { createClient: () => db };
  if (id === 'web-push') return { setVapidDetails() {}, async sendNotification(sub, body) {
    if (sub.endpoint.includes('mozilla')) { const e = new Error('gone'); e.statusCode = 410; throw e; }
    sent.push([sub, body]);
  } };
  if (id === 'next/server') return { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200 }) } };
  return old.call(this, id, parent, main);
};
const { POST } = require('../app/api/push/message/route.ts');
const { GET: status } = require('../app/api/push/status/route.ts');
const { allowedPushEndpoint } = require('../lib/push-endpoint.ts');
Module._load = old;
Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL:'https://db.example', NEXT_PUBLIC_SUPABASE_ANON_KEY:'anon', NEXT_PUBLIC_VAPID_PUBLIC_KEY:'public', VAPID_PRIVATE_KEY:'private', VAPID_SUBJECT:'mailto:hello@example.com' });
const req = (secret = 'a'.repeat(45), body = { type:'INSERT', schema:'public', table:'messages', record:{ id:messageId, sender_id:'forged' } }) => new Request('https://app.test/api/push/message', { method:'POST', headers:{'x-dolemon-webhook-secret':secret}, body:JSON.stringify(body) });

test('the database, not the route, decides whether the webhook secret is valid', async () => {
  events.length = 0; sent.length = 0; duplicate = false; unauthorized = false; forget = [];
  assert.equal((await POST(req('short'))).status, 401); assert.equal(events.length, 0);
  assert.equal((await POST(req('a'.repeat(45), {type:'UPDATE', schema:'public', table:'messages', record:{id:messageId}}))).status, 400);
  assert.equal(events.length, 0);

  unauthorized = true;
  assert.equal((await POST(req())).status, 401);
  assert.deepEqual(events[0], ['push_delivery_targets', { p_secret: 'a'.repeat(45), p_message_id: messageId }]);
  unauthorized = false;
});

test('delivery sends generic content only and forgets endpoints the provider rejects', async () => {
  events.length = 0; sent.length = 0; duplicate = false; unauthorized = false; forget = [];
  const result = await POST(req()); assert.equal(result.status, 200);
  assert.equal(sent.length, 1);
  assert.deepEqual(JSON.parse(sent[0][1]), { url:`/app/chat/${roomId}` });
  assert.deepEqual(forget, ['gone']);

  duplicate = true;
  assert.equal((await POST(req())).status, 200);
  assert.equal(sent.length, 1);
});

test('status reports configured without exposing values and without a service key', () => {
  assert.equal(status().body.configured, true);
  const saved = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.equal(status().body.configured, true);
  if (saved !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = saved;
});

test('push endpoints cannot target internal or lookalike hosts', () => {
  for (const url of ['http://fcm.googleapis.com/test','https://fcm.googleapis.com.evil.test/x','https://evil.test/x','https://127.0.0.1/x','https://foo.push.apple.com@evil.test/x','https://fcm.googleapis.com:8443/x']) assert.equal(allowedPushEndpoint(url), false, url);
  for (const url of ['https://fcm.googleapis.com/x','https://web.push.apple.com/x','https://updates.push.services.mozilla.com/x']) assert.equal(allowedPushEndpoint(url), true, url);
});
