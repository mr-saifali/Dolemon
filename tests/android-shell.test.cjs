const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const activity=fs.readFileSync('android/app/src/main/java/app/dolemon/mobile/MainActivity.java','utf8');
const manifest=fs.readFileSync('android/app/src/main/AndroidManifest.xml','utf8');

test('Android shell restricts app navigation and media permissions to the HTTPS production origin',()=>{
  assert.match(activity,/"https:\/\/dolemon\.vercel\.app\/app"/);
  assert.match(activity,/"https"\.equalsIgnoreCase\(uri\.getScheme\(\)\)/);
  assert.match(activity,/ORIGIN_HOST\.equalsIgnoreCase\(uri\.getHost\(\)\)/);
  assert.match(activity,/!trusted\(request\.getOrigin\(\)\)/);
  assert.match(activity,/MIXED_CONTENT_NEVER_ALLOW/);
  assert.match(activity,/setAllowFileAccess\(false\)/);
  assert.match(manifest,/usesCleartextTraffic="false"/);
});
test('Android shell includes file chooser, back navigation and opt-in device media permissions',()=>{
  assert.match(activity,/onShowFileChooser/); assert.match(activity,/onActivityResult/);
  assert.match(activity,/onBackPressed/); assert.match(activity,/requestPermissions\(/);
  assert.match(manifest,/android.permission.CAMERA/); assert.match(manifest,/android.permission.RECORD_AUDIO/);
});
test('launcher icons are real PNGs with expected dimensions',()=>{
  for(const [file,size] of [['public/icons/icon-192.png',192],['public/icons/icon-512.png',512],['public/icons/icon-maskable.png',512],['public/icons/apple-touch-icon.png',180],['app/icon.png',192]]) {
    const b=fs.readFileSync(file); assert.equal(b.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.equal(b.readUInt32BE(16),size); assert.equal(b.readUInt32BE(20),size);
  }
  assert.match(fs.readFileSync('app/manifest.ts','utf8'),/icon-maskable\.png/);
});

test('offline vault scaffolding binds encrypted entries to their account and requires device authentication',()=>{
  const vault=fs.readFileSync('android/app/src/main/java/app/dolemon/mobile/OfflineVault.java','utf8');
  assert.match(vault,/AndroidKeyStore/);
  assert.match(vault,/setUserAuthenticationRequired\(true\)/);
  assert.match(vault,/AES\/GCM\/NoPadding/);
  assert.match(vault,/cipher\.updateAAD\(associatedData\(accountId, itemId\)\)/);
  assert.match(vault,/getNoBackupFilesDir/);
  assert.match(vault,/AtomicFile/);
  assert.match(vault,/MAX_ITEM_BYTES/);
  // The encrypted reader is still unwired…
  assert.doesNotMatch(activity,/new OfflineVault/);
});


test('the release shell version and package configuration match the published update',()=>{
  const build=fs.readFileSync('android/app/build.gradle','utf8');
  assert.match(build,/applicationId 'app\.dolemon\.mobile'/);
  assert.match(build,/versionCode 5/);
  assert.match(build,/versionName '1\.4\.0'/);
  assert.match(activity,/private static final String APP_VERSION = "1\.4\.0"/);
  assert.match(activity,/DolemonAndroid\/" \+ APP_VERSION/);
});

test('the JavaScript bridge is tiny, origin-pinned and cannot reach native storage',()=>{
  assert.match(activity,/addJavascriptInterface\(new Bridge\(\), "DolemonAndroid"\)/);
  const bridge=activity.slice(activity.indexOf('public final class Bridge'));
  const exposed=[...bridge.matchAll(/@JavascriptInterface public (\w+) (\w+)\(/g)].map((m)=>m[2]);
  assert.deepEqual(exposed,['version','openInBrowser','notifyMessage']);
  // The path is a plain in-app route, never a scheme, host or traversal.
  assert.ok(bridge.includes('path.matches("^/[A-Za-z0-9/_-]{0,120}$")'));
  assert.ok(bridge.includes('"https://" + ORIGIN_HOST + safe'));
  assert.doesNotMatch(bridge,/OfflineVault|startActivity|openFileOutput/);
  // Notifications are posted from Java, with the text flattened and capped.
  assert.ok(bridge.includes('oneLine(title, 80)'));
  assert.ok(bridge.includes('oneLine(body, 200)'));
});
