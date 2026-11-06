const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(id, parent, ...rest) { if (id.startsWith('@/')) id = path.join(__dirname, '..', id.slice(2)); return resolve.call(this, id, parent, ...rest); };
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename);
const { POST } = require('../app/api/doremon/route.ts');
const originalFetch = global.fetch;
const saved = Object.fromEntries(['GEMINI_API_KEY', 'GEMINI_MODEL', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'].map(k => [k, process.env[k]]));
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
let sequence = 0;
after(() => { global.fetch = originalFetch; for (const [k,v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
const request = (extra = {}, token = 'valid-session') => ({ headers: new Headers(token ? { authorization: `Bearer ${token}` } : {}), json: async () => ({ action: 'roomAsk', me: 'A', partner: 'B', recent: [], memory: null, question: 'Hello', ...extra }) });
async function withResponse(response, extra = {}) {
  const calls = [];
  global.fetch = async (url, options) => { if (String(url).includes('/auth/v1/user')) return Response.json({ id: 'user-1' }); calls.push({ url: String(url), options }); return response(); };
  process.env.GEMINI_API_KEY = `test-key-${++sequence}`;
  const result = await POST(request(extra));
  return { result, body: await result.json(), calls };
}
test('a real question uses the fixed verified model and recent room context', async () => {
  process.env.GEMINI_MODEL = 'obsolete-override';
  const { result, body, calls } = await withResponse(() => Response.json({ candidates: [{ content: { parts: [{ text: 'Hi there!' }] } }] }), { memory: { chat: Array.from({ length: 6 }, (_, i) => ({ q: `question ${i}`, a: `answer ${i}` })) } });
  assert.equal(result.status, 200); assert.equal(body.answer, 'Hi there!'); assert.equal(calls.length, 1);
  assert.match(calls[0].url, /gemini-3\.1-flash-lite:generateContent/);
  const payload = JSON.parse(calls[0].options.body);
  assert.deepEqual(payload.generationConfig.thinkingConfig, { thinkingLevel: 'low' });
  assert.equal(payload.generationConfig.maxOutputTokens, 1024);
  assert.match(payload.contents[0].parts[0].text, /question 5/); assert.doesNotMatch(payload.contents[0].parts[0].text, /question 1/);
});
test('quota errors give a retry hint without calling another model', async () => {
  const out = await withResponse(() => Response.json({ error: { details: [{ retryDelay: '12.5s' }] } }, { status: 429 }));
  assert.equal(out.result.status, 429); assert.equal(out.body.error, 'QUOTA'); assert.equal(out.body.retryAfterSeconds, 13); assert.equal(out.result.headers.get('Retry-After'), '13'); assert.equal(out.calls.length, 1);
});
test('model, key and server errors are classified without retries', async () => {
  for (const [status, code] of [[400,'GEMINI'], [404,'MODEL'], [401,'BAD_KEY'], [403,'BAD_KEY'], [500,'GEMINI']]) {
    const out = await withResponse(() => new Response('error', { status })); assert.equal(out.body.error, code); assert.equal(out.calls.length, 1);
  }
});
test('anonymous and invalid sessions cannot spend Gemini quota', async () => {
  process.env.GEMINI_API_KEY = `test-key-${++sequence}`; const calls = [];
  global.fetch = async (url) => { calls.push(String(url)); return new Response('', { status: 401 }); };
  assert.equal((await POST(request({}, null))).status, 401); assert.equal(calls.length, 0);
  assert.equal((await POST(request({}, 'bad-session'))).status, 401); assert.equal(calls.length, 1); assert.match(calls[0], /auth\/v1\/user/);
});
test('auth service failures do not send a Gemini request', async () => {
  process.env.GEMINI_API_KEY = `test-key-${++sequence}`; const calls = [];
  global.fetch = async url => { calls.push(String(url)); return new Response('', { status: 503 }); };
  const res = await POST(request()); assert.equal(res.status, 503); assert.equal((await res.json()).error, 'AUTH_UNAVAILABLE'); assert.equal(calls.length, 1);
});
test('model zero quota and daily or minute limits remain distinct', async () => {
  for (const [quotaId, scope] of [['RequestsPerDayPerProjectPerModel', 'day'], ['RequestsPerMinutePerProjectPerModel', 'minute'], ['other', 'unknown']]) {
    const out = await withResponse(() => Response.json({ error: { details: [{ violations: [{ quotaId, quotaDimensions: { model: 'gemini-3.1-flash-lite' } }] }] } }, { status: 429 }));
    assert.equal(out.body.error, 'QUOTA'); assert.equal(out.body.quotaScope, scope); assert.equal(out.calls.length, 1);
  }
  const out = await withResponse(() => Response.json({ error: { details: [{ violations: [{ quotaValue: '0', quotaDimensions: { model: 'gemini-3.1-flash-lite' } }] }] } }, { status: 429 }));
  assert.equal(out.body.error, 'MODEL_QUOTA'); assert.equal(out.calls.length, 1);
});
test('thought parts are excluded and empty completions are reported', async () => {
  let out = await withResponse(() => Response.json({ candidates: [{ content: { parts: [{ text: 'hidden', thought: true }, { text: 'answer' }] } }] }));
  assert.equal(out.body.answer, 'answer');
  out = await withResponse(() => Response.json({ candidates: [{ content: { parts: [{ text: 'hidden', thought: true }] }, finishReason: 'MAX_TOKENS' }] }));
  assert.equal(out.body.error, 'GEMINI'); assert.match(out.body.detail, /MAX_TOKENS/);
});
test('failure explanations distinguish quota scope, network and expired sessions', () => {
  const { offlineReason, isOfflineNotice, OFFLINE_NOTICE } = require('../lib/doremon/offline.ts');
  assert.match(offlineReason('QUOTA', 25, 'day'), /midnight Pacific/); assert.match(offlineReason('QUOTA', 25, 'minute'), /per-minute.*25 seconds/); assert.match(offlineReason('NETWORK'), /network/); assert.match(offlineReason('AUTH_REQUIRED'), /sign in/); assert.equal(isOfflineNotice(OFFLINE_NOTICE), true);
});
