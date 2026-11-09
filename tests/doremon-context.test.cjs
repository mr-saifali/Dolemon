const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(id, parent, ...rest) { if (id.startsWith('@/')) id = path.join(__dirname, '..', id.slice(2)); return resolve.call(this, id, parent, ...rest); };
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, f);
const { minimizeQuestionRequest, sanitizePacket } = require('../lib/doremon/context.ts');
const { localLookup } = require('../lib/doremon/local-search.ts');
const now = Date.now();
const recent = [{who:'them',text:'dinner PRIVATE SECRET',at:now-1000},{who:'me',text:'secret PIN 1234',at:now-1000}];
const memory = { summary:'SECRET SUMMARY', chat: Array.from({length:7},(_,i)=>({q:`private question ${i}`,a:`private answer ${i}`})) };
const input = {action:'roomAsk', question:'Summarize the recent messages', recent, memory, me:'SECRET NAME', partner:'PRIVATE HANDLE'};
test('only fixed labels and bounded per-day counts leave the browser', () => {
  const p = minimizeQuestionRequest(input);
  assert.equal(p.intent,'recap'); assert.equal(p.incomplete,true); assert.deepEqual(p.packs,[{day:0,u1:1,u2:1}]); assert.equal(p.history.length,5);
  assert.doesNotMatch(JSON.stringify(p),/SECRET|PIN|1234|dinner|private|Summarize/i);
  assert.deepEqual(sanitizePacket(p),p);
});
test('server rejects injected free text and invalid counts even from modified clients', () => {
  const p = sanitizePacket({...input,intent:'SECRET',language:'SECRET',history:['SECRET','greeting'],packs:[{day:0,u1:1,u2:2,text:'SECRET'},{day:1,u1:10000,u2:0}]});
  assert.deepEqual(p.packs,[{day:0,u1:1,u2:2}]); assert.deepEqual(p.history,['other','greeting']); assert.doesNotMatch(JSON.stringify(p),/SECRET|PIN|private|dinner/i);
});
test('daily packets do not contain message or memory text and unknown timestamps are not fabricated', () => {
  const p = minimizeQuestionRequest({...input,action:'daily',yesterday:[...recent,{who:'me',text:'PRIVATE'}]});
  assert.equal(p.action,'daily'); assert.deepEqual(p.packs,[{day:0,u1:1,u2:1}]); assert.doesNotMatch(JSON.stringify(p),/secret|private|dinner/i);
});
test('local lookup resolves codes only against loaded messages and marks its limited coverage', () => {
  const out = localLookup('What did she say about dinner?',recent);
  assert.match(out,/m1 · u2: dinner PRIVATE SECRET/); assert.match(out,/not a complete history/);
  assert.match(localLookup('What did she say about nonexistent?',recent),/poori history nahi/);
  assert.equal(localLookup('Hello',recent),null);
});
test('browser fetch sends the safe packet for both question and daily actions', async () => {
  const oldLoad=Module._load, oldFetch=global.fetch;
  Module._load=function(id,parent,main) { if(id==='@/lib/supabase') return {getSupabase:()=>({auth:{getSession:async()=>({data:{session:{access_token:'token'}}})}})}; return oldLoad.call(this,id,parent,main); };
  const {doremonFetch}=require('../lib/doremon/api.ts'); Module._load=oldLoad;
  const sent=[]; global.fetch=async (_url,opts)=>{sent.push(JSON.parse(opts.body));return new Response('{}')};
  try {
    await doremonFetch(input,new AbortController().signal);
    await doremonFetch({...input,action:'daily',yesterday:recent},new AbortController().signal);
    assert.deepEqual(sent.map(x=>x.action),['roomAsk','daily']);
    assert.doesNotMatch(JSON.stringify(sent),/secret|private|dinner|PIN|1234/i);
    await assert.rejects(()=>doremonFetch({...input,action:'analyze'},new AbortController().signal),/UNSUPPORTED/);
  } finally {global.fetch=oldFetch;}
});

test('explicit sharing sends the actual bounded question and context, never account/media fields', () => {
  const { conversationPacket, MAX_CONTEXT_BYTES } = require('../lib/doremon/shared-context.ts');
  assert.equal(conversationPacket(input), null, 'legacy callers cannot accidentally opt in');
  const p = conversationPacket({ ...input, sharing: 'conversation-v1', meId: 'SECRET-ID', attachments: ['PRIVATE-IMAGE'], mediaUrl: 'PRIVATE-URL' });
  assert.equal(p.question, input.question);
  assert.equal(p.note, memory.summary);
  assert.equal(p.history.length, 3);
  assert.match(JSON.stringify(p.recent), /dinner PRIVATE SECRET/);
  assert.doesNotMatch(JSON.stringify(p), /SECRET NAME|PRIVATE HANDLE|SECRET-ID|PRIVATE-IMAGE|PRIVATE-URL/);
  assert.ok(Buffer.byteLength(JSON.stringify(p)) <= MAX_CONTEXT_BYTES);
  assert.deepEqual(conversationPacket(p), p, 'server allowlist preserves an already compact request');
});

test('Unicode, large history and message bursts stay within a byte budget with newest messages retained', () => {
  const { conversationPacket, MAX_CONTEXT_BYTES } = require('../lib/doremon/shared-context.ts');
  for (const text of ['नमस्ते 🐱 '.repeat(3000), '\n"\\'.repeat(3000), 'A'.repeat(10000)]) {
    const p = conversationPacket({ sharing: 'conversation-v1', action: 'roomAsk', question: text,
      memory: { summary: text, chat: Array.from({ length: 30 }, () => ({ q: text, a: text })) },
      recent: Array.from({ length: 100 }, (_, i) => ({ who: i % 2 ? 'me' : 'them', text: `${i}: ${text}`, media: 'NEVER-SENT' })) });
    assert.ok(Buffer.byteLength(JSON.stringify(p)) <= MAX_CONTEXT_BYTES);
    assert.ok(p.history.length <= 3); assert.ok(p.recent.length <= 16);
    assert.match(p.recent.at(-1).text, /^99:/);
    assert.doesNotMatch(JSON.stringify(p), /NEVER-SENT/);
    assert.equal(p.incomplete, true);
  }
});

test('a question can retrieve an older relevant loaded excerpt without uploading the whole window', () => {
  const { conversationPacket } = require('../lib/doremon/shared-context.ts');
  const p = conversationPacket({ sharing: 'conversation-v1', action: 'roomAsk', question: 'What about the dinner plan?', recent: Array.from({ length: 50 }, (_, i) => ({ who: 'them', text: i === 4 ? 'Dinner is booked for seven.' : `Small update ${i}` })) });
  assert.ok(p.recent.some(row => row.text === 'Dinner is booked for seven.'));
  assert.ok(p.recent.some(row => row.text === 'Small update 49'));
  assert.ok(p.recent.length <= 16);
});

test('browser opt-in path shares text only with the explicit marker', async () => {
  const oldFetch = global.fetch;
  const { doremonFetch } = require('../lib/doremon/api.ts');
  let sent;
  global.fetch = async (_url, opts) => { sent = JSON.parse(opts.body); return Response.json({}); };
  try {
    await doremonFetch({ ...input, sharing: 'conversation-v1' }, new AbortController().signal);
    assert.equal(sent.question, input.question);
    assert.equal(sent.sharing, 'conversation-v1');
    assert.ok(sent.recent.length);
  } finally { global.fetch = oldFetch; }
});
