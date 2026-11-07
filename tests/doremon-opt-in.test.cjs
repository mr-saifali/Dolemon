const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText, file);
const {confirmDoremonSharing, confirmDoremonAnalysis} = require('../lib/doremon/consent.ts');

test('cloud requests and automatic analysis require a clear action-specific acknowledgement', () => {
  let prompts=[]; global.window={confirm: (text) => {prompts.push(text);return false}};
  try {
    assert.equal(confirmDoremonSharing(false), true);
    assert.equal(prompts.length, 0);
    assert.equal(confirmDoremonSharing(true), false);
    assert.match(prompts[0], /Google Gemini/); assert.match(prompts[0], /other person/);
    assert.equal(confirmDoremonAnalysis(), false);
    assert.match(prompts[1], /until you turn it off/); assert.match(prompts[1], /does not delete/);
    window.confirm = () => true;
    assert.equal(confirmDoremonSharing(true), true);
    assert.equal(confirmDoremonAnalysis(), true);
  } finally {delete global.window;}
});

test('recap and suggestion buttons only fill a draft and both room and chat check consent', () => {
  const room = fs.readFileSync('app/app/doremon/[id]/page.tsx','utf8');
  const chat = fs.readFileSync('app/app/chat/[id]/page.tsx','utf8');
  const input = fs.readFileSync('components/chat/ChatInput.tsx','utf8');
  assert.match(room, /Recent recap/); assert.match(room, /Kind reply/); assert.match(room, /Conversation idea/);
  assert.match(room, /onClick=\{\(\) => setDraft\(question\)\}/);
  assert.ok((room.match(/confirmDoremonSharing\(REMOTE\)/g) || []).length >= 3);
  assert.match(chat, /!confirmDoremonSharing\(REMOTE\)\) return false/);
  assert.match(input, /if \(onSend\(text\) === false\) return/);
});
