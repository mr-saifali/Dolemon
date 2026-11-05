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
after(() => {
  global.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalKey;
  if (originalModel === undefined) delete process.env.GEMINI_MODEL; else process.env.GEMINI_MODEL = originalModel;
});
const request = (extra = {}) => ({ json: async () => ({ action: 'roomAsk', me: 'A', partner: 'B', recent: [], memory: null, question: 'Hello', ...extra }) });

async function withResponse(response, extra = {}) {
  let calls = [];
  global.fetch = async (url, options) => { calls.push({ url: String(url), options }); return response(); };
  process.env.GEMINI_API_KEY = 'test-key';
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
    assert.equal(out.calls.length, 1);
    assert.equal(out.body.error, status === 404 ? 'MODEL' : 'GEMINI');
  }
});

test('configured model is honored without 2.5-only thinking settings', async () => {
  process.env.GEMINI_API_KEY = 'test-key';
  process.env.GEMINI_MODEL = 'custom-model';
  let payload;
  global.fetch = async (_url, options) => { payload = JSON.parse(options.body); return Response.json({ candidates: [{ content: { parts: [{ text: 'OK' }] } }] }); };
  assert.equal((await POST(request())).status, 200);
  assert.equal(payload.generationConfig.thinkingConfig, undefined);
});
