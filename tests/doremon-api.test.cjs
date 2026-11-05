const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

// Load the route and its TypeScript dependencies without a running Next server.
const resolve = Module._resolveFilename;
Module._resolveFilename = function (id, parent, ...rest) {
  if (id.startsWith('@/')) id = path.join(__dirname, '..', id.slice(2));
  return resolve.call(this, id, parent, ...rest);
};
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  module._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename);
};
const { POST } = require('../app/api/doremon/route.ts');
const originalFetch = global.fetch;
const originalKey = process.env.GEMINI_API_KEY;
const originalModel = process.env.GEMINI_MODEL;
const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
let sequence = 0;
after(() => {
  global.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalKey;
  if (originalModel === undefined) delete process.env.GEMINI_MODEL; else process.env.GEMINI_MODEL = originalModel;
  if (originalSupabaseUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
  if (originalAnonKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey;
});
const request = (extra = {}, token = 'valid-session') => ({ headers: new Headers(token ? { authorization: `Bearer ${token}` } : {}), json: async () => ({ action: 'roomAsk', me: 'A', partner: 'B', recent: [], memory: null, question: 'Hello', ...extra }) });

async function withResponse(response, extra = {}) {
  let calls = [];
  global.fetch = async (url, options) => {
    if (String(url).includes('/auth/v1/user')) return Response.json({ id: 'user-1' });
    calls.push({ url: String(url), options }); return response();
  };
  process.env.GEMINI_API_KEY = `test-key-${++sequence}`;
  delete process.env.GEMINI_MODEL;
  const result = await POST(request(extra));
  return { result, body: await result.json(), calls };
}

test('one successful question uses one lightweight generation and includes recent room context', async () => {
  const { result, body, calls } = await withResponse(
    () => Response.json({ candidates: [{ content: { parts: [{ text: 'Hi there!' }] } }] }),
    { memory: { chat: Array.from({ length: 6 }, (_, i) => ({ q: `question ${i}`, a: `answer ${i}` })) }, question: 'And then?' }
  );
  assert.equal(result.status, 200);
  assert.equal(body.answer, 'Hi there!');
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /gemini-2\.5-flash-lite:generateContent/);
  const payload = JSON.parse(calls[0].options.body);
  assert.equal(payload.generationConfig.thinkingConfig.thinkingBudget, 0);
  assert.equal(payload.generationConfig.maxOutputTokens, 512);
  assert.match(payload.contents[0].parts[0].text, /question 5/);
  assert.doesNotMatch(payload.contents[0].parts[0].text, /question 1/);
});

test('429 returns a retry hint and never calls another model', async () => {
  const { result, body, calls } = await withResponse(() => Response.json({ error: { details: [{ retryDelay: '12.5s' }] } }, { status: 429 }));
  assert.equal(result.status, 429);
  assert.equal(body.error, 'QUOTA');
  assert.equal(body.retryAfterSeconds, 13);
  assert.equal(result.headers.get('Retry-After'), '13');
  assert.equal(calls.length, 1);
});

test('Retry-After header is preserved and non-quota errors are not retried', async () => {
  const quota = await withResponse(() => new Response('quota', { status: 429, headers: { 'retry-after': '42' } }));
  assert.equal(quota.body.retryAfterSeconds, 42);
  for (const status of [400, 404, 500]) {
    const out = await withResponse(() => new Response('error', { status }));
    assert.equal(out.calls.filter((c) => c.options.method === 'POST').length, 1);
    assert.equal(out.body.error, status === 404 ? 'MODEL' : 'GEMINI');
  }
});

test('configured model is honored without 2.5-only thinking settings', async () => {
  process.env.GEMINI_API_KEY = 'test-key';
  process.env.GEMINI_MODEL = 'custom-model';
  let payload;
  global.fetch = async (url, options) => { if (String(url).includes('/auth/v1/user')) return Response.json({ id: 'user-1' }); payload = JSON.parse(options.body); return Response.json({ candidates: [{ content: { parts: [{ text: 'OK' }] } }] }); };
  assert.equal((await POST(request())).status, 200);
  assert.equal(payload.generationConfig.thinkingConfig, undefined);
});


test('anonymous and invalid sessions cannot spend Gemini quota', async () => {
  process.env.GEMINI_API_KEY = `test-key-${++sequence}`;
  let calls = [];
  global.fetch = async (url) => { calls.push(String(url)); return new Response('', { status: 401 }); };
  assert.equal((await POST(request({}, null))).status, 401);
  assert.equal(calls.length, 0);
  assert.equal((await POST(request({}, 'bad-session'))).status, 401);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /auth\/v1\/user/);
});

test('missing default model or explicit zero quota can use one catalog-listed fallback', async () => {
  for (const failure of ['missing', 'zero-quota']) {
    process.env.GEMINI_API_KEY = `test-key-${++sequence}`;
    delete process.env.GEMINI_MODEL;
    let calls = [];
    global.fetch = async (url, options) => {
      url = String(url);
      if (url.includes('/auth/v1/user')) return Response.json({ id: 'user-1' });
      calls.push({ url, method: options.method });
      if (options.method === 'GET') return Response.json({ models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }] });
      if (url.includes('flash-lite:')) return failure === 'missing'
        ? new Response('missing', { status: 404 })
        : Response.json({ error: { details: [{ violations: [{ quotaValue: '0', quotaDimensions: { model: 'gemini-2.5-flash-lite' } }] }] } }, { status: 429 });
      return Response.json({ candidates: [{ content: { parts: [{ text: 'fallback works' }] } }] });
    };
    const result = await POST(request());
    assert.equal(result.status, 200);
    assert.equal((await result.json()).answer, 'fallback works');
    assert.equal(calls.filter((c) => c.method === 'POST').length, 2);
    assert.match(calls.at(-1).url, /gemini-2\.5-flash:generateContent/);
    calls = [];
    assert.equal((await POST(request())).status, 200);
    assert.equal(calls.filter((c) => c.method === 'POST').length, 1);
    assert.match(calls[0].url, /gemini-2\.5-flash:generateContent/);
  }
});

test('a zero quota on an unrelated metric does not trigger fallback', async () => {
  const result = await withResponse(() => Response.json({ error: { details: [{ violations: [{ quotaValue: '0' }] }] } }, { status: 429 }));
  assert.equal(result.result.status, 429);
  assert.equal(result.body.error, 'QUOTA');
  assert.equal(result.calls.length, 1);
});

test('an auth service failure does not send a Gemini request', async () => {
  process.env.GEMINI_API_KEY = `test-key-${++sequence}`;
  const calls = [];
  global.fetch = async (url) => { calls.push(String(url)); return new Response('', { status: 503 }); };
  const result = await POST(request());
  assert.equal(result.status, 503);
  assert.equal((await result.json()).error, 'AUTH_UNAVAILABLE');
  assert.equal(calls.length, 1);
  assert.match(calls[0], /auth\/v1\/user/);
});

test('zero quota falls back at most once and preserves a quota error', async () => {
  process.env.GEMINI_API_KEY = `test-key-${++sequence}`;
  delete process.env.GEMINI_MODEL;
  const calls = [];
  global.fetch = async (url, options) => {
    url = String(url);
    if (url.includes('/auth/v1/user')) return Response.json({ id: 'user-1' });
    calls.push({ url, method: options.method });
    if (options.method === 'GET') return Response.json({ models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }] });
    return Response.json({ error: { details: [{ violations: [{ quotaValue: '0', quotaDimensions: { model: url.includes('flash-lite:') ? 'gemini-2.5-flash-lite' : 'gemini-2.5-flash' } }] }] } }, { status: 429 });
  };
  const result = await POST(request());
  assert.equal(result.status, 429);
  assert.equal((await result.json()).error, 'MODEL_QUOTA');
  assert.equal(calls.filter((c) => c.method === 'POST').length, 2);
});

test('Google daily and minute quota dimensions are reported without guessing reset timing', async () => {
  for (const [quotaId, scope] of [['GenerateRequestsPerDayPerProjectPerModel-FreeTier', 'day'], ['GenerateRequestsPerMinutePerProjectPerModel-FreeTier', 'minute'], ['other', 'unknown']]) {
    const out = await withResponse(() => Response.json({ error: { details: [{ violations: [{ quotaId, quotaDimensions: { model: 'gemini-2.5-flash-lite' } }] }] } }, { status: 429 }));
    assert.equal(out.body.error, 'QUOTA');
    assert.equal(out.body.quotaScope, scope);
    assert.equal(out.calls.length, 1);
  }
});

test('message-only zero model quota may use a single catalog-listed alternative', async () => {
  process.env.GEMINI_API_KEY = `test-key-${++sequence}`;
  delete process.env.GEMINI_MODEL;
  const calls = [];
  global.fetch = async (url, options) => {
    url = String(url);
    if (url.includes('/auth/v1/user')) return Response.json({ id: 'user-1' });
    calls.push({ url, method: options.method });
    if (options.method === 'GET') return Response.json({ models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }] });
    if (url.includes('flash-lite:')) return Response.json({ error: { message: '* Quota exceeded for metric: requests, limit: 0, model: gemini-2.5-flash-lite', details: [{ violations: [{ quotaDimensions: { model: 'gemini-2.5-flash-lite' } }] }] } }, { status: 429 });
    return Response.json({ candidates: [{ content: { parts: [{ text: 'alternate' }] } }] });
  };
  const result = await POST(request());
  assert.equal((await result.json()).answer, 'alternate');
  assert.equal(calls.filter((c) => c.method === 'POST').length, 2);
});

test('non-zero decimal quota or another model in the error text is not treated as zero quota', async () => {
  for (const message of [
    'Quota exceeded, limit: 0.5, model: gemini-2.5-flash-lite',
    'Quota exceeded, limit: 0, model: gemini-2.5-flash-lite-other',
  ]) {
    const out = await withResponse(() => Response.json({ error: { message, details: [{ violations: [{ quotaDimensions: { model: 'gemini-2.5-flash-lite' } }] }] } }, { status: 429 }));
    assert.equal(out.body.error, 'QUOTA');
    assert.equal(out.calls.length, 1);
  }
});

test('failure explanations distinguish quota scope, network and expired sessions', () => {
  const { offlineReason, isOfflineNotice, OFFLINE_NOTICE } = require('../lib/doremon/offline.ts');
  assert.match(offlineReason('QUOTA', 25, 'day'), /midnight Pacific/);
  assert.match(offlineReason('QUOTA', 25, 'minute'), /per-minute.*25 seconds/);
  assert.match(offlineReason('NETWORK'), /network/);
  assert.match(offlineReason('AUTH_REQUIRED'), /sign in/);
  assert.equal(isOfflineNotice(OFFLINE_NOTICE), true);
  assert.equal(isOfflineNotice('Arre Nobita, abhi mera Gemini brain offline hai, old notice'), true);
});
