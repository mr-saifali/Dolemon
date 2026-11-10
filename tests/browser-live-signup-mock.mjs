// Start a LOCAL build with NEXT_PUBLIC_AUTH_MODE=supabase,
// NEXT_PUBLIC_SUPABASE_URL=https://auth-test.invalid and a dummy anon key.
// Every provider request is intercepted: no real mailbox, account or backend.
import {createRequire} from 'node:module';
const require=createRequire(process.env.BROWSER_TEST_MODULES ? process.env.BROWSER_TEST_MODULES+'/package.json' : new URL('../package.json',import.meta.url));
const puppeteer=require('puppeteer-core');const chromiumModule=require('@sparticuz/chromium');const chromium=chromiumModule.default??chromiumModule;
const browser=await puppeteer.launch({executablePath:await chromium.executablePath(),args:chromium.args,headless:true});
const page=await browser.newPage();await page.setViewport({width:360,height:780,isMobile:true,hasTouch:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const user={id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',email:'audit@example.test',aud:'authenticated',role:'authenticated',created_at:new Date().toISOString(),identities:[{id:'identity'}]};
let verified=false,verifyCalls=0,signupCalls=0,passwordLogins=0;
const encode=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt=encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:user.id,aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})+'.test';
await page.setRequestInterception(true);
page.on('request',async r=>{
 const u=new URL(r.url());if(u.host!=='auth-test.invalid'){return r.continue();}
 const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET, POST, PATCH, OPTIONS','content-type':'application/json'};
 if(r.method()==='OPTIONS')return r.respond({status:200,headers,body:'{}'});
 let data={};let status=200;
 if(u.pathname.endsWith('/signup')){signupCalls++;data=user;}
 else if(u.pathname.endsWith('/verify')){verifyCalls++;const input=JSON.parse(r.postData());if(input.type!=='signup')throw Error('wrong OTP purpose');if(input.token==='00000000'){status=403;data={code:'otp_expired',msg:'Token has expired or is invalid'};}else{verified=true;data={access_token:jwt,refresh_token:'test-only-refresh',expires_in:3600,token_type:'bearer',user:{...user,email_confirmed_at:new Date().toISOString()}};}}
 else if(u.pathname.endsWith('/user'))data={...user,email_confirmed_at:verified?new Date().toISOString():null};
 else if(u.pathname.endsWith('/token')){passwordLogins++;status=400;}
 else if(u.pathname.includes('/rest/v1/profiles'))data=[{id:user.id,username:null,avatar_id:null,visibility:'public'}];
 else data=null;
 return r.respond({status,headers,body:JSON.stringify(data)});
});
const fillCode=async(code)=>page.evaluate(code=>{const e=document.querySelector('[aria-label="Digit 1"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,code);e.dispatchEvent(new Event('input',{bubbles:true}));},code);
try{
 await page.goto(process.env.TEST_BASE_URL||'http://localhost:3000/signup/email');
 await page.waitForSelector('#email');await page.type('#email',user.email);await page.click('button[type=submit]');
 await page.waitForSelector('#password');await page.type('#password','auditPassword123');await page.click('button[type=submit]');
 await page.waitForSelector('[aria-label="8-digit verification code"]');
 if(signupCalls!==1||passwordLogins!==0)throw Error('signup bypass/duplicate');
 await fillCode('00000000');await page.waitForFunction(()=>document.body.innerText.includes('expired'));console.log('wrong OTP rejected without profile setup');
 await fillCode('12345678');await page.waitForSelector('#username',{timeout:20000});
 if(verifyCalls!==2||!verified||passwordLogins!==0)throw Error('duplicate verification or password fallback');
 if(errors.length)throw Error(errors.join('\n'));
 console.log('LIVE-FLOW MOCK email -> password -> OTP -> username; signup=1, verify=2 (one wrong, one correct), password-login fallback=0, JS errors=0');
}finally{await browser.close();}
