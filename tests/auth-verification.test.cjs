const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const Module=require('node:module');const ts=require('typescript');
const resolve=Module._resolveFilename;
Module._resolveFilename=function(id,parent,...rest){if(id.startsWith('@/'))id=path.join(__dirname,'..',id.slice(2));return resolve.call(this,id,parent,...rest);};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,f);
const calls=[];let signup,user,verify,error;
const db={auth:{signUp:async x=>{calls.push(['signup',x]);return signup;},signInWithPassword:async x=>{calls.push(['signin',x]);return {error};},signOut:async x=>{calls.push(['signout',x]);return {error};},resend:async x=>{calls.push(['resend',x]);return {error};},signInWithOtp:async x=>{calls.push(['recovery',x]);return {error};},verifyOtp:async x=>{calls.push(['verify',x]);return verify;},getUser:async()=>({data:{user},error}),updateUser:async x=>{calls.push(['password',x]);return {error};}},from(){return {upsert:()=>Promise.resolve({})};}};
const load=Module._load;Module._load=function(id,parent,...rest){if(id==='@/lib/supabase')return {getSupabase:()=>db};if(id==='@/lib/media-url')return {clearChatMediaCache(){}};return load.call(this,id,parent,...rest);};
const {supabaseProvider:auth}=require('../lib/auth/supabase.ts');Module._load=load;
const reset=()=>{calls.length=0;error=null;user=null;signup={data:{session:null,user:{identities:[{}]}},error:null};verify={data:{session:{},user:{email_confirmed_at:'now'}},error:null};};
test('signup requests email verification and does not silently sign into existing accounts',async()=>{
 reset();await auth.signUpWithPassword(' A@EXAMPLE.TEST ','password123');assert.equal(calls[0][1].email,'a@example.test');assert.equal(calls.length,1);
 signup.error={message:'User already registered'};await assert.rejects(auth.signUpWithPassword('a@example.test','password123'),e=>e.code==='ACCOUNT_EXISTS');assert.ok(!calls.some(c=>c[0]==='signin'));
});
test('misconfigured autoconfirm fails closed and unverified sessions cannot become accounts',async()=>{
 reset();signup.data.session={};await assert.rejects(auth.signUpWithPassword('a@example.test','password123'),e=>e.code==='EMAIL_CONFIRMATION');assert.deepEqual(calls.at(-1),['signout',{scope:'local'}]);
 user={email:'a@example.test',id:'one',email_confirmed_at:null};assert.equal(await auth.getAccount(),null);
});
test('signup resends confirmation, recovery never creates users, OTP types are separate',async()=>{
 reset();await auth.sendOtp('a@example.test');assert.equal(calls.at(-1)[0],'resend');assert.equal(calls.at(-1)[1].type,'signup');
 await auth.sendOtp('a@example.test','recovery');assert.equal(calls.at(-1)[1].options.shouldCreateUser,false);
 await auth.verifyOtp('a@example.test','1234 5678');assert.equal(calls.at(-1)[1].type,'signup');assert.equal(calls.at(-1)[1].token,'12345678');
 await auth.verifyOtp('a@example.test','12345678','recovery');assert.equal(calls.at(-1)[1].type,'email');
 verify.data.session=null;await assert.rejects(auth.verifyOtp('a@example.test','12345678'),e=>e.code==='EMAIL_CONFIRMATION');
});
test('password updates require server-verified ownership and valid password; auth failures are actionable',async()=>{
 reset();await assert.rejects(auth.createPassword('password123'),e=>e.code==='EMAIL_CONFIRMATION');assert.equal(calls.length,0);
 user={id:'one',email_confirmed_at:'now'};await auth.createPassword('password123');assert.equal(calls[0][0],'password');
 await assert.rejects(auth.createPassword('short'),e=>e.code==='WEAK_PASSWORD');
 error={message:'Invalid login credentials'};await assert.rejects(auth.signInWithPassword('a@example.test','bad'),e=>e.code==='WRONG_PASSWORD');
 error={message:'Email not confirmed'};await assert.rejects(auth.signInWithPassword('a@example.test','bad'),e=>e.code==='EMAIL_CONFIRMATION');
 error={message:'Failed to fetch'};await assert.rejects(auth.signOut(),e=>e.code==='NETWORK');
});
test('OTP defaults match deployed project, support paste and use truthful copy',()=>{
 const {OTP_LENGTH}=require('../lib/otp.ts');assert.equal(OTP_LENGTH,8);
 const otp=fs.readFileSync('components/onboarding/otp-input.tsx','utf8');assert.match(otp,/maxLength=\{length\}/);assert.match(otp,/onPaste=/);assert.match(otp,/\$\{length\}-digit verification code/);
 const email=fs.readFileSync('app/signup/email/page.tsx','utf8');assert.doesNotMatch(email,/No emails, no codes/);
 assert.doesNotMatch(fs.readFileSync('app/signup/verify/page.tsx','utf8'),/router.replace\("\/signup\/password"\)/);
});
