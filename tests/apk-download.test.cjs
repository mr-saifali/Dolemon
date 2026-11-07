const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const apkPath = '/downloads/dolemon-test-1.0.0.apk';
test('published APK is the exact signed CI test build', () => {
  const apk = fs.readFileSync(`public${apkPath}`);
  assert.equal(apk.subarray(0, 4).toString('hex'), '504b0304');
  assert.ok(apk.includes(Buffer.from('APK Sig Block 42')));
  assert.equal(crypto.createHash('sha256').update(apk).digest('hex'), '88a832820f94b1af80f85ca8b39438fd6a681a4a027a90cdd47af0b9db651153');
});
test('landing screens and download page offer the same real APK with honest limitations', () => {
  for (const page of ['app/signin/page.tsx', 'app/app/page.tsx', 'app/download/page.tsx']) {
    const content = fs.readFileSync(page, 'utf8');
    assert.ok(content.includes(`href="${apkPath}"`), page);
    assert.match(content, /download="Dolemon-test-1\.0\.0\.apk"/);
    assert.match(content, /[Tt]est/);
  }
  const signin = fs.readFileSync('app/signin/page.tsx', 'utf8');
  const page = fs.readFileSync('app/download/page.tsx', 'utf8');
  assert.match(signin, /Internet required/); assert.match(signin, /No offline chats or push notifications/);
  assert.match(page, /offline chats and push notifications aren/); assert.match(page, /Install browser app/);
});
test('server labels APK downloads correctly', async () => {
  const { default: config } = await import(pathToFileURL(path.join(__dirname, '..', 'next.config.mjs')));
  const route = (await config.headers()).find((item) => item.source === apkPath);
  assert.ok(route);
  assert.equal(route.headers.find((h) => h.key === 'Content-Type').value, 'application/vnd.android.package-archive');
  assert.match(route.headers.find((h) => h.key === 'Content-Disposition').value, /^attachment;/);
});
