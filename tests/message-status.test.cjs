const {test}=require('node:test'); const assert=require('node:assert/strict'); const fs=require('node:fs'); const path=require('node:path');const Module=require('node:module');const ts=require('typescript');const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');
const resolve=Module._resolveFilename;Module._resolveFilename=function(id,parent,...rest){if(id.startsWith('@/'))id=path.join(__dirname,'..',id.slice(2));return resolve.call(this,id,parent,...rest)};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f);
const {messageStatusLabel}=require('../lib/message-status.ts');const {MessageList}=require('../components/chat/MessageList.tsx');
test('relative status labels reflect sent, seen, hidden, pending and failure states',()=>{
 const m={author:'me',kind:'text',at:0,status:'sent'};
 assert.equal(messageStatusLabel(m,true,120000),'Sent 2 min ago');
 assert.equal(messageStatusLabel({...m,status:'read',seenAt:115000},true,120000),'Seen just now');
 assert.equal(messageStatusLabel({...m,status:'read',seenAt:115000},false,120000),'Sent 2 min ago');
 assert.equal(messageStatusLabel({...m,status:'sending'},true,120000),'Sending…');
 assert.equal(messageStatusLabel({...m,status:'failed'},false,120000),'Not sent');
 assert.equal(messageStatusLabel({...m,status:'read'},true,120000),'Seen');
});
test('only the latest outgoing bubble has a textual status, no checkmarks',()=>{
 const now=Date.now(), messages=[{id:'1',author:'me',kind:'text',text:'one',at:now-120000,status:'read',seenAt:now-1000},{id:'2',author:'me',kind:'text',text:'two',at:now-60000,status:'read',seenAt:now-1000},{id:'3',author:'them',kind:'text',text:'hi',at:now}];
 const html=renderToStaticMarkup(React.createElement(MessageList,{messages,partnerName:'Sam',typing:false,showReceipts:true,dividerId:null,onLongPress(){},onDoubleTap(){},onRemoveMyReaction(){},onRetry(){}}));
 assert.equal((html.match(/Seen just now/g)||[]).length,1);assert.doesNotMatch(html,/aria-label="(?:Seen at|Delivered|Sent to server)"/);
});
