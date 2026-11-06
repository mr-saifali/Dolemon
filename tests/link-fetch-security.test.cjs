const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const { EventEmitter } = require('node:events');
const ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, f);
let redirect = false, count = 0, pinned;
const old = Module._load;
Module._load = function(id, parent, main) {
  if (id === 'node:dns/promises') return { lookup: async () => [{ address:'1.1.1.1', family:4 }] };
  if (id === 'node:https') return { get(url, options, cb) {
    count++; options.lookup('example.com', {}, (_err, address) => { pinned = address; });
    const req = new EventEmitter(); req.destroy = () => {};
    process.nextTick(() => { const res = new EventEmitter(); res.statusCode = redirect ? 302 : 200; res.headers = redirect ? { location:'http://127.0.0.1/private' } : { 'content-type':'text/html; charset=utf-8' }; res.destroy = () => {}; cb(res); if (!redirect) { res.emit('data', Buffer.from('<title>Welcome</title><meta property="og:description" content="Hello &amp; hi">')); res.emit('end'); } });
    return req;
  } };
  return old.call(this, id, parent, main);
};
const { fetchLinkPreview } = require('../lib/link-preview-server.ts');
Module._load = old;

test('preview pins the resolved public IP and extracts bounded text metadata', async () => {
  redirect = false; count = 0; const out = await fetchLinkPreview('https://example.com/path');
  assert.equal(pinned, '1.1.1.1'); assert.equal(count, 1); assert.equal(out.title, 'Welcome'); assert.equal(out.description, 'Hello & hi');
});

test('a redirect to a private IP is rejected before another request', async () => {
  redirect = true; count = 0; await assert.rejects(fetchLinkPreview('https://example.com/path')); assert.equal(count, 1);
});
