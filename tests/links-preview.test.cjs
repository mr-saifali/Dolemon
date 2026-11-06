const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(id, parent, ...rest) { if (id.startsWith('@/')) id = path.join(__dirname, '..', id.slice(2)); return resolve.call(this, id, parent, ...rest); };
for (const ext of ['.ts','.tsx']) require.extensions[ext] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, file);
const { splitLinks, instagramEmbed } = require('../lib/links.ts');
const { publicAddress, validateWebUrl } = require('../lib/link-preview-server.ts');
const { LinkContent } = require('../components/chat/link-content.tsx');

test('recognizes multiple links, preserves punctuation and does not make unsafe schemes clickable', () => {
  const parts = splitLinks('See https://example.com/a, and https://example.org/b! javascript:alert(1)');
  assert.deepEqual(parts.filter(p => p.type === 'link').map(p => p.value), ['https://example.com/a','https://example.org/b']);
  assert.equal(parts.map(p => p.value).join(''), 'See https://example.com/a, and https://example.org/b! javascript:alert(1)');
  assert.equal(splitLinks('http://user:password@example.com/').some(p => p.type === 'link'), false);
});

test('only canonical Instagram reel/post URLs create an embed', () => {
  assert.equal(instagramEmbed('https://www.instagram.com/reel/Ab_C-12/?igsh=test'), 'https://www.instagram.com/reel/Ab_C-12/embed/');
  assert.equal(instagramEmbed('https://instagram.com/p/AbC123/'), 'https://www.instagram.com/p/AbC123/embed/');
  for (const url of ['https://instagram.com.evil.test/reel/abc/', 'http://instagram.com/reel/abc/', 'https://www.instagram.com/stories/user/abc', 'https://evil.test/reel/abc/', 'https://instagram.com/reel/a%2Fb/']) assert.equal(instagramEmbed(url), null);
});

test('link preview rejects local, private and reserved destinations before network use', () => {
  for (const value of ['http://localhost', 'http://127.0.0.1', 'http://[::1]/', 'http://169.254.169.254/latest/meta-data/', 'http://0x7f000001/', 'https://some.local/', 'https://user:pass@example.com/', 'https://example.com:8080/', 'file:///etc/passwd']) assert.throws(() => validateWebUrl(value), undefined, value);
  for (const value of ['127.0.0.1', '10.1.2.3', '169.254.169.254', '100.64.0.1', '::1', 'fc00::1', '::ffff:127.0.0.1', '2001:db8::1']) assert.equal(publicAddress(value), false, value);
  assert.equal(publicAddress('1.1.1.1'), true);
  assert.equal(validateWebUrl('https://example.com/a').hostname, 'example.com');
});

test('link cards render domain and a safe external link without fetching automatically', () => {
  const html = renderToStaticMarkup(React.createElement(LinkContent, { text: 'Look https://www.instagram.com/reel/abc123/' }));
  assert.match(html, /www.instagram.com/); assert.match(html, /Load preview/); assert.match(html, /Watch here/);
  assert.match(html, /rel="noopener noreferrer"/); assert.doesNotMatch(html, /<iframe/);
});
