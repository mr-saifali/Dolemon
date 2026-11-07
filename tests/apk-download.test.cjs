const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
const { ANDROID_APK_URL, ANDROID_APK_FILENAME, ANDROID_APP_VERSION, isAndroidAppWebView } = require('../lib/android-app.ts');

test('published APK is the exact signed CI test build', () => {
  const apk = fs.readFileSync(`public${ANDROID_APK_URL}`);
  assert.equal(ANDROID_APP_VERSION, '1.1.0');
  assert.equal(apk.subarray(0, 4).toString('hex'), '504b0304');
  assert.ok(apk.includes(Buffer.from('APK Sig Block 42')));
  assert.equal(crypto.createHash('sha256').update(apk).digest('hex'), '44b761256629bafd7193d3b44777d93a1fbc03d0497ceebe737890763aebbea4');
  assert.equal(ANDROID_APK_FILENAME, 'Dolemon-test-1.1.0.apk');
});

test('website uses the current APK but app installation prompts are gated in the Android shell', () => {
  for (const page of ['app/signin/page.tsx', 'app/app/page.tsx']) {
    const content = fs.readFileSync(page, 'utf8');
    assert.match(content, /href="\/download"/, page);
    assert.match(content, /androidApp/, page);
  }
  const downloadPage = fs.readFileSync('app/download/page.tsx', 'utf8');
  assert.match(downloadPage, /href=\{ANDROID_APK_URL\}/);
  assert.match(downloadPage, /download=\{ANDROID_APK_FILENAME\}/);
  assert.match(downloadPage, /uninstall it first; uninstalling erases its local app data/);
  for (const page of ['app/signin/page.tsx','app/app/page.tsx','app/settings/page.tsx', 'components/pwa/install-sheet.tsx']) {
    assert.match(fs.readFileSync(page, 'utf8'), /environmentReady && !androidApp/, page);
  }
  const download = fs.readFileSync('app/download/page.tsx', 'utf8');
  assert.match(download, /if \(androidApp\) return/);
  assert.match(download, /offline chats and push notifications aren/);
  assert.match(download, /Install browser app/);
  assert.match(fs.readFileSync('app/signin/page.tsx', 'utf8'), /No offline chats or push notifications/);
});

test('Android app marker and legacy Android WebView are recognized without hiding in Chrome or iOS', () => {
  assert.equal(isAndroidAppWebView('Mozilla/5.0 (Linux; Android 13; Pixel) AppleWebKit/537.36 DolemonAndroid/1.1.0'), true);
  assert.equal(isAndroidAppWebView('Mozilla/5.0 (Linux; Android 10; Pixel; wv) AppleWebKit/537.36'), true);
  assert.equal(isAndroidAppWebView('Mozilla/5.0 (Linux; Android 13; Pixel) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36'), false);
  assert.equal(isAndroidAppWebView('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'), false);
  assert.equal(isAndroidAppWebView('Mozilla/5.0'), false);
  const activity = fs.readFileSync('android/app/src/main/java/app/dolemon/mobile/MainActivity.java','utf8');
  assert.match(activity, /setUserAgentString\(settings\.getUserAgentString\(\) \+ " DolemonAndroid\/1\.1\.0"\)/);
});

test('server labels the latest APK download correctly', async () => {
  const { default: config } = await import(pathToFileURL(path.join(__dirname, '..', 'next.config.mjs')));
  const route = (await config.headers()).find((item) => item.source === ANDROID_APK_URL);
  assert.ok(route);
  assert.equal(route.headers.find((h) => h.key === 'Content-Type').value, 'application/vnd.android.package-archive');
  assert.match(route.headers.find((h) => h.key === 'Content-Disposition').value, /^attachment;/);
});
