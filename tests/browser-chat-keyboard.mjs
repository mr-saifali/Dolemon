import {createRequire} from 'node:module';
const require=createRequire(process.env.BROWSER_TEST_MODULES ? process.env.BROWSER_TEST_MODULES+'/package.json' : new URL('../package.json',import.meta.url));
const puppeteer=require('puppeteer-core');const chromiumModule=require('@sparticuz/chromium');const chromium=chromiumModule.default ?? chromiumModule;
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: chromium.args, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await page.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel; wv) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36 DolemonAndroid/1.4.1');
let aiCalls=0;page.on('request',r=>{if(r.url().includes('/api/doremon'))aiCalls++;});
const errors=[];page.on('pageerror', e=>errors.push(e.message));
await page.evaluateOnNewDocument(()=>{
 const u={id:'test-user',email:'test@example.test',username:'tester',avatarId:null,passwordHash:'unused',salt:'unused',createdAt:Date.now()};
 localStorage.setItem('dolemon:users',JSON.stringify({[u.email]:u}));
 localStorage.setItem('dolemon:session',JSON.stringify({userId:u.id}));
 localStorage.setItem('dolemon:prefs',JSON.stringify({introMusic:false,sounds:false}));
});
async function clickText(text) {
 const h=await page.evaluateHandle((text)=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith(text)),text);
 const el=h.asElement(); if(!el)throw new Error('Missing button '+text);await el.click();await h.dispose();
}
async function openChat() {
 await page.goto((process.env.TEST_BASE_URL || 'http://localhost:3000')+'/app');
 await page.waitForSelector('a[href="/app/chat/c_aarohi"]');
 await page.click('a[href="/app/chat/c_aarohi"]');
 await page.waitForSelector('[aria-label="Chat options"]');
}
try{
 await openChat();
 await page.waitForSelector('textarea');
 await page.focus('textarea');await page.keyboard.type('draft stays here');
 const focused=await page.$eval('textarea',e=>({value:e.value,start:e.selectionStart,end:e.selectionEnd}));
 const bubbles=await page.$$('[role="button"][aria-label*="Open message options"]');
 if(!bubbles.length)throw Error('no bubbles');
 const bubble=bubbles.at(-1);await bubble.evaluate(e=>e.scrollIntoView({block:'center'}));
 const box=await bubble.boundingBox();
 await page.touchscreen.touchStart(box.x+box.width/2,box.y+box.height/2);
 await page.waitForSelector('[aria-label="Message options"]',{visible:true});
 await page.touchscreen.touchEnd();
 const check=async(label)=>{
  const result=await page.$eval('textarea',e=>({active:document.activeElement===e,value:e.value,start:e.selectionStart,end:e.selectionEnd}));
  if(!result.active||result.value!==focused.value||result.start!==focused.start||result.end!==focused.end)throw Error(label+JSON.stringify(result));
  console.log(label,JSON.stringify(result));
 };
 await check('long press keeps composer focus/draft/selection');
 await page.tap('[aria-label="More emoji reactions"]');
 await page.waitForSelector('[aria-label="All emoji reactions"]');await check('expanding reactions keeps focus');
 const count=await page.$$eval('[aria-label="All emoji reactions"] button',els=>els.length);if(count!==37)throw Error('emoji range '+count);
 await page.tap('[aria-label="All emoji reactions"] [aria-label="Thumbs up"]');
 await page.waitForFunction(()=>!document.querySelector('[aria-label="Message options"]'));
 await check('choosing emoji keeps focus');
 if(errors.length)throw Error(errors.join('\n'));console.log('ERRORS',JSON.stringify(errors));
}catch(e){console.log('FAIL DOM',await page.evaluate(()=>document.body.innerText.slice(-5000)), 'ERRORS',errors); await page.screenshot({path:'/tmp/dolemon-menu-failure.png'});throw e;}finally{await browser.close()}
