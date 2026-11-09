const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText, file);
const {confirmDoremonSharing, confirmDoremonAnalysis} = require('../lib/doremon/consent.ts');

test('cloud requests use an in-app acknowledgement and analysis remains separately opt-in', async () => {
  const prompts = [];
  let allow = false;
  global.window = {
    dispatchEvent(event) { prompts.push(event.detail.message); event.detail.handled = true; event.detail.resolve(allow); },
    confirm(text) { prompts.push(text); return allow; },
  };
  try {
    assert.equal(await confirmDoremonSharing(false), true);
    assert.equal(prompts.length, 0);
    assert.equal(await confirmDoremonSharing(true), false);
    assert.match(prompts[0], /external AI service/);
    assert.match(prompts[0], /question.*conversation text/);
    assert.match(prompts[0], /Paid API access does not itself guarantee privacy/);
    assert.match(prompts[0], /other person/);
    assert.equal(confirmDoremonAnalysis(), false);
    assert.match(prompts[1], /until you turn it off/);
    allow = true;
    assert.equal(await confirmDoremonSharing(true), true);
    assert.equal(confirmDoremonAnalysis(), true);
  } finally { delete global.window; }
});

test('recap and suggestion buttons only fill a draft and both room and chat check consent', () => {
  const room = fs.readFileSync('app/app/doremon/[id]/page.tsx','utf8');
  const chat = fs.readFileSync('app/app/chat/[id]/page.tsx','utf8');
  const input = fs.readFileSync('components/chat/ChatInput.tsx','utf8');
  assert.match(room, /Recent recap/); assert.match(room, /Kind reply/); assert.match(room, /Conversation idea/);
  assert.match(room, /onClick=\{\(\) => setDraft\(question\)\}/);
  assert.equal((room.match(/await confirmDoremonSharing\(REMOTE\)/g) || []).length, 2);
  assert.match(chat, /!await confirmDoremonSharing\(REMOTE\)\) return false/);
  assert.match(input, /result instanceof Promise \? await result : result/);
});
