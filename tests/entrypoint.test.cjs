const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

test('the root redirects directly to the inbox', async () => {
  const { default: config } = await import(pathToFileURL(path.join(__dirname, '..', 'next.config.mjs')));
  assert.ok((await config.redirects()).some((redirect) => redirect.source === '/' && redirect.destination === '/app'));
});
