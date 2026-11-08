const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, f);
let steps = [], rowData = [];
const sb = { rpc: async () => ({ data: [], error: null }), from(table) { const chain = {
  select(x) { steps.push(['select', table, x]); return this; }, eq(...x) { steps.push(['eq', ...x]); return this; },
  ilike(...x) { steps.push(['ilike', ...x]); return this; }, or(x) { steps.push(['or', x]); return this; },
  order(...x) { steps.push(['order', ...x]); return this; }, limit(x) { steps.push(['limit', x]); return Promise.resolve({ data: rowData, error: null }); },
  then(resolve) { return Promise.resolve({ data: [], error: null }).then(resolve); },
}; return chain; } };
const old = Module._load;
Module._load = function(id, parent, main) { if (id === './supabase' && parent.filename.endsWith('/lib/db.ts')) return { getSupabase: () => sb }; return old.call(this, id, parent, main); };
const { searchThread, loadOlderMessages, OLDER_THREAD_PAGE_SIZE } = require('../lib/db.ts');
Module._load = old;

test('search is scoped to the conversation and escapes literal LIKE metacharacters', async () => {
  steps = []; rowData = [];
  await searchThread('conversation', ' 50%_off\\ sale ');
  assert.ok(steps.some((s) => s[0] === 'eq' && s[1] === 'conversation_id' && s[2] === 'conversation'));
  assert.ok(steps.some((s) => s[0] === 'ilike' && s[2] === '%50\\%\\_off\\\\ sale%'));
  assert.ok(steps.some((s) => s[0] === 'limit' && s[1] === 50));
});

test('older pages use a full-precision timestamp plus id tie-breaker and reject malformed cursors', async () => {
  steps = []; rowData = [];
  const cursor = { createdAt: '2026-01-01T00:00:00.123456+00:00', id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' };
  await loadOlderMessages('conversation', cursor, 'alice');
  assert.ok(steps.some((s) => s[0] === 'or' && s[1].includes(`created_at.eq.${cursor.createdAt},id.lt.${cursor.id}`)));
  assert.ok(steps.some((s) => s[0] === 'limit' && s[1] === OLDER_THREAD_PAGE_SIZE));
  await assert.rejects(loadOlderMessages('conversation', { ...cursor, id: 'bad,filter' }, 'alice'), /Invalid message cursor/);
});
