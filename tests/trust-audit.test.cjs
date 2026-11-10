const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
test('cache clear is narrowly scoped and privacy disclosure is reachable',()=>{
 const settings=read('app/settings/page.tsx');assert.match(settings,/await clearOfflineData\(\)/);assert.doesNotMatch(settings,/Object.keys\(window.localStorage\)/);assert.match(settings,/setOfflineScope\(account/);
 for(const p of ['app/settings/page.tsx','app/signin/page.tsx','app/u/[username]/page.tsx'])assert.match(read(p),/href="\/privacy"/);
 assert.match(read('app/privacy/page.tsx'),/not end-to-end encrypted/);
});
test('invite route validates handles without exposing public profiles or creating conversations',()=>{
 const source=read('app/u/[username]/page.tsx');assert.match(source,/USERNAME_PATTERN.test/);assert.match(source,/notFound\(\)/);assert.doesNotMatch(source,/searchUsers|ensureConversation|getSupabase/);
});
test('patched framework supports async route params and security headers preserve preview embedding',()=>{
 const pkg=JSON.parse(read('package.json'));assert.equal(pkg.dependencies.next,'15.5.29');assert.equal(pkg.dependencies.zod,'4.6.7');assert.equal(pkg.dependencies['@supabase/ssr'],undefined);
 const config=read('next.config.mjs');assert.match(config,/X-Content-Type-Options/);assert.match(config,/Referrer-Policy/);assert.doesNotMatch(config,/X-Frame-Options/);
 assert.doesNotMatch(read('app/layout.tsx'),/maximumScale: 1/);
});
