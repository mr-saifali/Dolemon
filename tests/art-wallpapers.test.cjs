const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(id,parent,...rest) { if (id.startsWith('@/')) id=path.join(__dirname,'..',id.slice(2)); return resolve.call(this,id,parent,...rest); };
for (const ext of ['.ts','.tsx']) require.extensions[ext] = (mod,file) => mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);
const { getChatTheme, isVividChatTheme, NIGHT_CHAT_THEMES, VIVID_CHAT_THEMES, LEGACY_CHAT_THEMES } = require('../lib/chat-themes.ts');
const { ChatWallpaper, chatThemeStyle } = require('../components/chat/ChatWallpaper.tsx');
const { ChatThemePicker } = require('../components/chat/ChatThemePicker.tsx');
const { MessageBubble } = require('../components/chat/MessageBubble.tsx');

test('the six chosen night designs and all five new vivid designs are available, but not the unchosen aurora', () => {
  const night = ['midnight-lake','rose-clouds','ocean-lights','sakura-rain','firefly-forest','cosmic-drift'];
  const vivid = ['cloud-castles','glass-ocean','sky-koi','aurora-garden','dream-train'];
  assert.deepEqual(NIGHT_CHAT_THEMES.map((theme)=>theme.id),night);
  assert.deepEqual(VIVID_CHAT_THEMES.map((theme)=>theme.id),vivid);
  assert.equal(getChatTheme('velvet-aurora').id,'soft-glow');
  assert.equal(LEGACY_CHAT_THEMES.length,12);
  for (const id of [...night,...vivid]) {
    const theme = getChatTheme(id), file=fs.readFileSync(path.join(__dirname,'..','public',theme.image));
    assert.equal(file.subarray(0,3).toString('hex'),'ffd8ff'); assert.ok(file.length < 600*1024, `${id} should be mobile-friendly`);
    assert.equal(isVividChatTheme(theme),vivid.includes(id));
    const html = renderToStaticMarkup(React.createElement(ChatWallpaper,{theme}));
    assert.ok(html.includes(theme.image)); assert.match(html,/bg-black\/10/); assert.doesNotMatch(html,/bg-black\/60/);
  }
});

test('theme picker exposes both collections without removing earlier wallpapers', () => {
  const html=renderToStaticMarkup(React.createElement(ChatThemePicker,{value:'sky-koi',onChange(){}}));
  assert.match(html,/Light &amp; vivid/); assert.match(html,/After dark/); assert.match(html,/More wallpapers/);
  for(const name of ['Cloud Castles','Glass Ocean','Sky Koi','Aurora Garden','Dream Train','Midnight Lake','Rose Clouds','Ocean Lights','Sakura Rain','Firefly Forest','Cosmic Drift','Peach glow']) assert.ok(html.includes(name),name);
  assert.match(html,/checked="" value="sky-koi"/);
});

test('vivid backgrounds use local, not full-screen, protection for white chat content', () => {
  const styles=fs.readFileSync('app/globals.css','utf8');
  assert.match(styles,/data-vivid-wallpaper="true"/); assert.match(styles,/data-received-message="true"/);
  assert.match(styles,/backdrop-filter: brightness\(\.4\)/); assert.match(styles,/background-color: rgba\(0, 0, 0, 0\.68\)/);
  assert.match(styles,/data-chat-composer="true"/); assert.match(styles,/data-emoji-reply="true"/);
  assert.equal(chatThemeStyle(getChatTheme('sky-koi'))['--message-incoming'],'rgba(0,0,0,.7)');
  const props={tail:true,partnerName:'Sam',onLongPress(){},onDoubleTap(){},onRemoveMyReaction(){},onRetry(){},animateIn:false};
  const received=renderToStaticMarkup(React.createElement(MessageBubble,{...props,message:{id:'1',author:'them',kind:'text',text:'hello',at:0}}));
  assert.match(received,/data-received-message="true"/);
  const emoji=renderToStaticMarkup(React.createElement(MessageBubble,{...props,message:{id:'2',author:'them',kind:'text',text:'❤️',at:0,replyTo:{id:'x',author:'me',text:'hello'}}}));
  assert.doesNotMatch(emoji,/data-received-message/); assert.match(emoji,/data-emoji-reply="true"/); assert.match(emoji,/border-0 bg-transparent p-0/);
  const l = (v) => {v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4};
  // Worst case: white artwork, 10% global scrim, then 0.4 brightness and 5% white bubble.
  const bright = 255*(.9*.4*.95 + .05);
  assert.ok(1.05/(l(bright)+.05) >= 4.5);
  // The no-backdrop-filter fallback is at least as protective.
  assert.ok(1.05/(l(255*.9*(1-.68))+.05) >= 4.5);
});
