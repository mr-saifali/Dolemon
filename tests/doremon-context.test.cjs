const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(id, parent, ...rest) { if (id.startsWith('@/')) id = path.join(__dirname, '..', id.slice(2)); return resolve.call(this, id, parent, ...rest); };
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, f);
const { minimizeQuestionRequest } = require('../lib/doremon/context.ts');
const memory = { summary: 'A secret about work', notes: ['They promised dinner at home', 'Secret vacation in Paris'], chat: [{q:'old private question',a:'private answer'},{q:'recent private question',a:'recent answer'}], partnerUsername:'private handle' };
const recent = [{who:'them',text:'dinner at 8'}, {who:'me',text:'secret bank pin 1234'}, {who:'them',text:'dinner at 9'}];
const stats = { total: 14, firstAt:'2026-01-01',lastAt:'2026-01-02',users:{alice:{total:10,lastAt:'2026-01-02',hours:{9:10}},bob:{total:4,lastAt:'2026-01-01',hours:{20:4}}}, whoStarts:{alice:3,bob:1} };
const input = {action:'roomAsk', me:'SECRET NAME', partner:'SECRET HANDLE', meId:'alice', partnerId:'bob', memory, recent, stats};
const packet = (question) => minimizeQuestionRequest({...input, question});

test('greetings and unrelated questions contain no chat, IDs, handles or private history', () => {
  for (const question of ['Hello', 'how are you?', 'kaise ho', 'What time is it?', 'How many calories in an apple?', 'Explain a relationship']) {
    assert.deepEqual(packet(question), {action:'roomAsk', question});
  }
});
test('question-specific excerpt filtering removes unrelated messages and is idempotent', () => {
  const p = packet('What did she say about dinner?');
  assert.deepEqual(p.context.recent.map(x => x.text), ['dinner at 8','dinner at 9']);
  assert.doesNotMatch(JSON.stringify(p), /secret|private|alice/i);
  assert.deepEqual(minimizeQuestionRequest(p), p);
});
test('statistics questions send only the requested aggregates, not messages or other dimensions', () => {
  const p = packet('How many messages did we send?');
  assert.match(p.context.stats, /you 10, other person 4/);
  assert.doesNotMatch(JSON.stringify(p), /dinner|secret|private|alice|Peak|starts/);
  assert.deepEqual(minimizeQuestionRequest(p), p);
  const hours = packet('What hours do we message?');
  assert.match(hours.context.stats, /Peak activity/);
  assert.doesNotMatch(hours.context.stats, /Message counts/);
});
test('memory and follow-ups select bounded fields only, never all prior exchanges', () => {
  const p = packet('Do you remember dinner?');
  assert.deepEqual(p.context.notes, ['They promised dinner at home']);
  assert.doesNotMatch(JSON.stringify(p), /secret|private handle|private question/gi);
  assert.deepEqual(minimizeQuestionRequest(p), p);
  const f = packet('What was your previous answer?');
  assert.equal(f.context.history.length, 2);
  assert.doesNotMatch(JSON.stringify(f), /dinner|Paris|SECRET NAME/);
  assert.deepEqual(minimizeQuestionRequest(f), f);
});
test('browser fetch sends the minimized packet before it reaches the app server', async () => {
  const oldLoad = Module._load, oldFetch = global.fetch;
  Module._load = function(id, parent, main) { if (id === '@/lib/supabase') return { getSupabase: () => ({auth:{getSession:async () => ({data:{session:{access_token:'token'}}})}}) }; return oldLoad.call(this, id, parent, main); };
  const { doremonFetch } = require('../lib/doremon/api.ts'); Module._load = oldLoad;
  let body; global.fetch = async (_url, opts) => { body = JSON.parse(opts.body); return new Response('{}'); };
  try {
    await doremonFetch({...input, question:'hello'}, new AbortController().signal);
    assert.deepEqual(body, {action:'roomAsk', question:'hello'});
    await doremonFetch({...input, action:'daily', day:'2026-01-01', yesterday:recent}, new AbortController().signal);
    assert.equal(body.action, 'daily'); assert.equal(body.yesterday.length, 3);
    assert.doesNotMatch(JSON.stringify(body), /private question|SECRET NAME|alice|SECRET HANDLE/);
  } finally { global.fetch = oldFetch; }
});
