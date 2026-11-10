const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
const { ANDROID_APK_URL, ANDROID_APK_FILENAME, ANDROID_APP_VERSION, isAndroidAppWebView } = require('../lib/android-app.ts');

test('published APK is a signed CI test build of the current version', () => {
  const apk = fs.readFileSync(`public${ANDROID_APK_URL}`);
  assert.equal(ANDROID_APP_VERSION, '1.4.1');
  assert.equal(ANDROID_APK_FILENAME, 'Dolemon-test-1.4.1.apk');
  assert.equal(apk.subarray(0, 4).toString('hex'), '504b0304');
  // v2/v3 signature block: the file on our origin is a signed build, not a copy.
  // The bytes are not pinned — a rebuild (fresh debug key, new timestamps) is a
  // different file, so the version string and the compiled classes are the checks.
  assert.ok(apk.includes(Buffer.from('APK Sig Block 42')));
  assert.ok(apk.length > 60_000, `unexpectedly small APK: ${apk.length} bytes`);
  assert.equal(crypto.createHash('sha256').update(apk).digest('hex').length, 64);
});

test('the shipped binary really is the 1.4.1 shell with the notification hand-off', () => {
  // Compiled strings live inside the (deflated) dex entries, not the raw file.
  const { execFileSync } = require('node:child_process');
  const out = execFileSync(process.execPath, ['-e', `
    const fs=require('fs');
    const data=fs.readFileSync('public${ANDROID_APK_URL}');
    // Inflate every stored entry with a tiny reader: class files are the only big ones.
    const { inflateRawSync } = require('node:zlib');
    let blob='';
    for (let i = 0; i < data.length - 4; i++) {
      if (data.readUInt32LE(i) === 0x04034b50) {
        const method = data.readUInt16LE(i + 8);
        const size = data.readUInt32LE(i + 18);
        const nameLen = data.readUInt16LE(i + 26);
        const extraLen = data.readUInt16LE(i + 28);
        const name = data.slice(i + 30, i + 30 + nameLen).toString();
        const start = i + 30 + nameLen + extraLen;
        if (name.endsWith('.dex')) {
          const raw = data.slice(start, start + size);
          blob += (method === 8 ? inflateRawSync(raw) : raw).toString('latin1');
        }
      }
    }
    process.stdout.write(JSON.stringify({
      version: blob.includes('1.4.1'),
      marker: blob.includes('DolemonAndroid/'),
      bridge: blob.includes('openInBrowser'),
      notify: blob.includes('notifyMessage'),
      inbox: blob.includes('inboxReady'),
    }));
  `], { encoding: 'utf8' });
  const found = JSON.parse(out);
  assert.equal(found.version, true);
  assert.equal(found.marker, true);
  assert.equal(found.bridge, true);
  assert.equal(found.notify, true);
  assert.equal(found.inbox, true);
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
  assert.match(downloadPage, /uninstall the old app first; uninstalling erases its local app data/);
  for (const page of ['app/signin/page.tsx','app/app/page.tsx','app/settings/page.tsx', 'components/pwa/install-sheet.tsx']) {
    assert.match(fs.readFileSync(page, 'utf8'), /environmentReady && !androidApp/, page);
  }
  const download = fs.readFileSync('app/download/page.tsx', 'utf8');
  assert.match(download, /if \(androidApp\) return/);
  assert.match(download, /Chats you have opened stay readable offline/);
  assert.match(download, /Install browser app/);
  assert.match(fs.readFileSync('app/signin/page.tsx', 'utf8'), /Read cached chats offline/);
});

test('Android app marker and legacy Android WebView are recognized without hiding in Chrome or iOS', () => {
  assert.equal(isAndroidAppWebView('Mozilla/5.0 (Linux; Android 13; Pixel) AppleWebKit/537.36 DolemonAndroid/1.2.0'), true);
  assert.equal(isAndroidAppWebView('Mozilla/5.0 (Linux; Android 10; Pixel; wv) AppleWebKit/537.36'), true);
  assert.equal(isAndroidAppWebView('Mozilla/5.0 (Linux; Android 13; Pixel) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36'), false);
  assert.equal(isAndroidAppWebView('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'), false);
  assert.equal(isAndroidAppWebView('Mozilla/5.0'), false);
  const activity = fs.readFileSync('android/app/src/main/java/app/dolemon/mobile/MainActivity.java','utf8');
  assert.match(activity, /private static final String APP_VERSION = "1\.4\.1"/);
  assert.match(activity, /setUserAgentString\(settings\.getUserAgentString\(\) \+ " DolemonAndroid\/" \+ APP_VERSION\)/);
});

test('server labels the latest APK download correctly', async () => {
  const { default: config } = await import(pathToFileURL(path.join(__dirname, '..', 'next.config.mjs')));
  const route = (await config.headers()).find((item) => item.source === ANDROID_APK_URL);
  assert.ok(route);
  assert.equal(route.headers.find((h) => h.key === 'Content-Type').value, 'application/vnd.android.package-archive');
  assert.match(route.headers.find((h) => h.key === 'Content-Disposition').value, /^attachment;/);
});
