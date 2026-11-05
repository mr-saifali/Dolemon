const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

// Load the pure personal-OS core without a running Next server or a browser.
const resolve = Module._resolveFilename;
Module._resolveFilename = function (id, parent, ...rest) {
  if (id.startsWith('@/')) id = path.join(__dirname, '..', id.slice(2));
  return resolve.call(this, id, parent, ...rest);
};
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  module._compile(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText,
    filename
  );
};

const core = require('../lib/personal/core.ts');

const at = (day, hour = 12) => new Date(2026, 10, day, hour, 0, 0).getTime();

test('the Constitution is sanitized and can never grant Doremon the right to send', () => {
  const p = core.sanitizeProfile({
    nickname: '  Nobita  ',
    quietFrom: 99,
    quietTo: -4,
    selfChord: [1, 2, 3],
    boundaries: { aiMaySend: true, telemetry: false },
  });
  assert.equal(p.nickname, 'Nobita');
  assert.equal(p.quietFrom, 23);
  assert.equal(p.quietTo, 0);
  assert.equal(p.selfChord.length, 4);
  assert.equal(p.boundaries.aiMaySend, false);
  assert.equal(p.boundaries.telemetry, false);
  assert.equal(core.sanitizeProfile(null).boundaries.aiMaySend, false);
});

test('quiet hours wrap midnight and change the greeting', () => {
  const p = { ...core.DEFAULT_PROFILE, quietFrom: 23, quietTo: 7, nickname: 'Saif' };
  assert.equal(core.isQuietHour(p, new Date(2026, 10, 4, 23, 30)), true);
  assert.equal(core.isQuietHour(p, new Date(2026, 10, 4, 3, 0)), true);
  assert.equal(core.isQuietHour(p, new Date(2026, 10, 4, 12, 0)), false);
  assert.match(core.greetingForProfile(p, new Date(2026, 10, 4, 23, 30)), /Still up, Saif/);
  assert.match(core.greetingForProfile(p, new Date(2026, 10, 4, 9, 0)), /Good morning, Saif/);
});

test('the context block fed to Gemini carries the one-owner identity and lexicon', () => {
  const block = core.personalContextForPrompt({
    ...core.DEFAULT_PROFILE,
    name: 'Saif',
    city: 'Patna',
    language: 'Hinglish',
  });
  assert.match(block, /Saif/);
  assert.match(block, /Patna/);
  assert.match(block, /Hinglish/);
  assert.match(block, /dil = I feel this/);
  assert.equal(core.personalContextForPrompt(null), '');
});

test('the private lexicon expands search and completes your words', () => {
  const p = core.DEFAULT_PROFILE;
  const terms = core.expandQuery(p, 'heart');
  assert.ok(terms.includes('dil'));
  assert.ok(terms.includes('feel'));
  assert.deepEqual(core.expandQuery(p, '   '), []);
  const suggestions = core.autocompleteFor(p, 'I sent a di');
  assert.equal(suggestions[0].insert, 'dil');
  assert.equal(core.autocompleteFor(p, 'dil').length, 0);
});

test('the whisper reads a draft locally and offers rewrites, never a send', () => {
  const sharp = core.whisperFor('You ALWAYS do this!! Why do you never listen??', {
    quiet: false,
    hoursSinceTheirLastMessage: 1,
    theirLastLine: 'ok',
  });
  assert.equal(sharp.tone, 'sharp');
  assert.ok(sharp.rewrites.some((r) => r.label === 'Softer'));
  assert.ok(!sharp.rewrites[0].text.includes('ALWAYS'));

  const quiet = core.whisperFor('are you up', {
    quiet: true,
    hoursSinceTheirLastMessage: null,
    theirLastLine: '',
  });
  assert.equal(quiet.tone, 'quiet');
  assert.match(quiet.line, /quiet hour/);
  assert.equal(core.whisperFor('', { quiet: false, hoursSinceTheirLastMessage: null, theirLastLine: '' }).line, '');
});

test('the memory graph extracts facts, promises and episodes without duplicates', () => {
  const messages = [
    { who: 'me', text: 'My birthday is on 12 June', at: at(1, 9), id: 'm1' },
    { who: 'them', text: "I'll call you at 9, pakka", at: at(1, 21), id: 'm2' },
    { who: 'them', text: "I'll call you at 9, pakka", at: at(1, 21), id: 'm3' },
    { who: 'me', text: 'haha our joke about chai', at: at(2, 22), id: 'm4' },
  ];
  const graph = core.extractGraph(messages, null, at(3));
  assert.equal(graph.facts.length, 2, 'one fact + one inside joke');
  assert.equal(graph.openLoops.length, 1, 'duplicate promise must not create a second loop');
  assert.equal(graph.episodes.length, 2, 'one episode per day');
  assert.equal(graph.episodes[0].day, '2026-11-01');
  assert.equal(core.openLoopsOf(graph).length, 1);
  const done = core.withLoopDone(graph, graph.openLoops[0].id);
  assert.equal(core.openLoopsOf(done).length, 0);
  assert.equal(graph.openLoops[0].status, 'open', 'the original graph is not mutated');
});

test('learnings are derived from real events and each has a reason', () => {
  const now = at(10, 12);
  const events = [];
  for (let i = 0; i < 6; i += 1) {
    events.push({ id: `o${i}`, kind: 'app.open', at: now - i * 3_600_000 - 10 * 3_600_000 });
  }
  for (let i = 0; i < 10; i += 1) {
    events.push({ id: `m${i}`, kind: 'message.sent', at: now - 3_600_000 });
  }
  for (let i = 0; i < 4; i += 1) {
    events.push({ id: `p${i}`, kind: 'pulse.sent', at: now - i * 3_600_000 });
  }
  // Opens placed at 02:00 local (quiet window) by shifting the clock used by the derivation.
  const quietEvents = events.map((e) =>
    e.kind === 'app.open' ? { ...e, at: new Date(2026, 10, 10, 2, 0, 0).getTime() } : e
  );
  const learnings = core.deriveLearnings(quietEvents, core.DEFAULT_PROFILE, now);
  assert.ok(learnings.some((l) => l.id === 'quietGlow'));
  assert.ok(learnings.some((l) => l.id === 'compact'));
  assert.ok(learnings.some((l) => l.id === 'pulseFirst'));
  for (const l of learnings) assert.ok(l.why.length > 10);
  assert.equal(core.deriveLearnings([], core.DEFAULT_PROFILE, now).length, 0);
});

test('labs defaults are complete and unknown values fall back safely', () => {
  const defaults = core.defaultLabs();
  assert.equal(Object.keys(defaults).length, core.LAB_FLAGS.length);
  assert.equal(defaults['home.room'], true);
  assert.equal(defaults['ambient.drone'], false);
  const labs = core.sanitizeLabs({ 'home.room': false, nonsense: true });
  assert.equal(labs['home.room'], false);
  assert.equal(labs['draft.whisper'], true);
});

test('the climate follows the hour, quiet window and tension', () => {
  const p = core.DEFAULT_PROFILE;
  assert.equal(core.climateFor(p, new Date(2026, 10, 4, 2)).label, 'quiet hours');
  assert.equal(core.climateFor(p, new Date(2026, 10, 4, 12), 8).label, 'warm front');
  assert.equal(core.climateFor(p, new Date(2026, 10, 4, 9)).label, 'morning light');
  assert.equal(core.climateFor(p, new Date(2026, 10, 4, 20)).label, 'evening rose');
});
