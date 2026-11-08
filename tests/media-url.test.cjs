const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, f);

const conv = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
let signed = [];
let failSigning = false;
const sb = {
  storage: {
    from(bucket) {
      return {
        async createSignedUrl(path, seconds) {
          signed.push({ bucket, path, seconds });
          if (failSigning) return { data: null, error: { message: 'denied' } };
          return { data: { signedUrl: `https://db.example/storage/v1/object/sign/${bucket}/${path}?token=t` }, error: null };
        },
      };
    },
  },
};
const old = Module._load;
Module._load = function (id, parent, main) {
  if (id === '@supabase/supabase-js') return { createClient: () => sb };
  return old.call(this, id, parent, main);
};
Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: 'https://db.example', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon' });
const media = require('../lib/media-url.ts');
Module._load = old;

test('references round-trip and refuse traversal or foreign buckets', () => {
  assert.equal(media.chatMediaReference(`${conv}/photo.jpg`), `dolemon-media:${conv}/photo.jpg`);
  assert.equal(media.parseChatMediaReference(`dolemon-media:${conv}/photo.jpg`), `${conv}/photo.jpg`);
  for (const bad of [
    `dolemon-media:${conv}/../secret`,
    `dolemon-media:${conv}/a%2fb.jpg`,
    'dolemon-media:other/photo.jpg',
    'dolemon-media:/etc/passwd',
    'https://evil.test/storage/v1/object/public/chat-media/x/y.jpg',
  ]) assert.equal(media.parseChatMediaReference(bad), null, bad);
  assert.throws(() => media.chatMediaReference('../escape'));
});

test('legacy public URLs map to the same storage path', () => {
  const url = `https://db.example/storage/v1/object/public/chat-media/${conv}/note.webm`;
  assert.equal(media.chatMediaPathFromUrl(url), `${conv}/note.webm`);
  assert.equal(media.isStoredMedia(url), true);
  assert.equal(media.isStoredMedia(`dolemon-media:${conv}/note.webm`), true);
});

test('local data and blob URLs never hit the network', async () => {
  signed = [];
  media.clearChatMediaCache();
  assert.equal(await media.resolveChatMediaUrl('data:image/png;base64,xx'), 'data:image/png;base64,xx');
  assert.equal(await media.resolveChatMediaUrl('blob:https://app/1'), 'blob:https://app/1');
  assert.equal(signed.length, 0);
});

test('a stored reference is signed once and cached until cleared', async () => {
  signed = []; failSigning = false;
  media.clearChatMediaCache();
  const reference = `dolemon-media:${conv}/photo.jpg`;
  const first = await media.resolveChatMediaUrl(reference);
  assert.match(first, /\/object\/sign\/chat-media\//);
  assert.equal(signed.length, 1);
  assert.equal(signed[0].path, `${conv}/photo.jpg`);
  await media.resolveChatMediaUrl(reference);
  assert.equal(signed.length, 1);
  media.clearChatMediaCache();
  await media.resolveChatMediaUrl(reference);
  assert.equal(signed.length, 2);
});

test('concurrent readers share one signature request and failures are not cached', async () => {
  signed = []; failSigning = false;
  media.clearChatMediaCache();
  const reference = `dolemon-media:${conv}/voice.webm`;
  const [a, b] = await Promise.all([media.resolveChatMediaUrl(reference), media.resolveChatMediaUrl(reference)]);
  assert.equal(a, b);
  assert.equal(signed.length, 1);

  media.clearChatMediaCache();
  failSigning = true;
  assert.equal(await media.resolveChatMediaUrl(reference), null);
  failSigning = false;
  assert.match(await media.resolveChatMediaUrl(reference), /\/object\/sign\//);
});
