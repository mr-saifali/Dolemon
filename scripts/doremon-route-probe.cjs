// Temporary preview-only verification of Doremon's actual POST and prompts.
// Auth is mocked; Gemini is real. No secrets or personal chat data are logged.
if (process.env.VERCEL_ENV !== 'preview') process.exit(0);
if (!process.env.GEMINI_API_KEY) { console.log('DOREMON_ROUTE_PROBE ' + JSON.stringify({ error: 'NO_KEY' })); process.exit(0); }
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(id, parent, ...rest) { if (id.startsWith('@/')) id = path.join(process.cwd(), id.slice(2)); return resolve.call(this, id, parent, ...rest); };
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename);
const { POST } = require('../app/api/doremon/route.ts');
const realFetch = global.fetch;
global.fetch = (url, opts) => String(url).includes('/auth/v1/user') ? Promise.resolve(Response.json({ id: 'synthetic-test-user' })) : realFetch(url, opts);
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.invalid';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'synthetic';
(async () => {
  for (const action of ['roomAsk', 'ask']) {
    const response = await POST({ headers: new Headers({ authorization: 'Bearer synthetic' }), json: async () => ({ action, me: 'Alice', partner: 'Bob', recent: [], memory: null, question: 'Say hello in one short sentence.' }) });
    const body = await response.json();
    console.log('DOREMON_ROUTE_PROBE ' + JSON.stringify({ action, status: response.status, ok: body.ok, answer: body.answer?.slice(0, 120), error: body.error, detail: body.detail }));
  }
})().catch((error) => console.log('DOREMON_ROUTE_PROBE ' + JSON.stringify({ error: error.name })));
