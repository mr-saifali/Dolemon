const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { indexedDB } = require('fake-indexeddb');
global.indexedDB = indexedDB;
const resolve = Module._resolveFilename;
Module._resolveFilename = function(id, parent, ...rest) { if (id.startsWith('@/')) id = path.join(__dirname, '..', id.slice(2)); return resolve.call(this, id, parent, ...rest); };
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, f);
const uploads = [], deletes = [], inserts = [];
let failUpload = false;
const blob = new Blob(['video-data'], { type: 'video/mp4' });
const db = { auth: { getSession: async () => ({ data: { session: { user: { id: 'alice' } } } }) }, from() { return { insert: async (row) => { inserts.push(row); return { error: null }; } }; }, storage: { from(bucket) { return {
  upload: async (p, file, opts) => { uploads.push({ bucket, p, file, opts }); return { error: failUpload ? { message:'failure' } : null }; },
  download: async () => ({ data: blob, error: null }),
  remove: async (paths) => { deletes.push(paths); return { data: [{ name: paths[0] }], error: null }; },
}; } } };
const old = Module._load;
Module._load = function(id, parent, main) { if (id === '@/lib/supabase') return { getSupabase: () => db }; return old.call(this, id, parent, main); };
const storage = require('../lib/video-storage.ts');
const refs = require('../lib/video-reference.ts');
const { toRemoteSendOptions } = require('../lib/remote-send-options.ts');
Module._load = old;
const room = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

test('video references are validated and existing attachment uploads remain unchanged', () => {
  const ref = refs.videoReference(room, id);
  assert.equal(refs.parseVideoReference(ref).path, `${room}/${id}`);
  assert.equal(refs.parseVideoReference('dolemon-video:../other:bad'), null);
  assert.equal(refs.supportedVideo({ type:'video/mp4', size:50*1024*1024 }), true);
  assert.equal(refs.supportedVideo({ type:'video/mp4', size:50*1024*1024+1 }), false);
  assert.equal(refs.supportedVideo({ type:'text/html', size:5 }), false);
  assert.equal(toRemoteSendOptions({kind:'file', media:{url:ref}}).media.url, ref);
  assert.equal(toRemoteSendOptions({kind:'file', media:{url:'data:text/plain;base64,AA=='}}).media.dataUrl, 'data:text/plain;base64,AA==');
});

test('sender saves the Blob locally before direct private upload without base64', async () => {
  uploads.length = 0; inserts.length = 0;
  const file = new File(['video-data'], 'clip.mp4', { type:'video/mp4' });
  const ref = await storage.prepareVideo('alice', room, file, true);
  assert.equal(uploads.length, 1); assert.equal(uploads[0].bucket, 'temporary-chat-videos');
  assert.equal(uploads[0].file, file); assert.equal(inserts[0].sender_id, 'alice');
  assert.equal(await (await storage.loadVideoOnDevice('alice', ref)).text(), 'video-data');
  assert.equal(await storage.loadVideoOnDevice('bob', ref), null);
});

test('recipient persists before requesting deletion and does not delete if local save fails', async () => {
  deletes.length = 0; const ref = refs.videoReference(room, id);
  const saved = await storage.receiveVideo('bob', ref);
  assert.equal(await saved.blob.text(), 'video-data'); assert.equal(saved.serverRemoved, true);
  assert.equal(await (await storage.loadVideoOnDevice('bob', ref)).text(), 'video-data'); assert.equal(deletes.length, 1);
  const original = global.indexedDB;
  global.indexedDB = { open() { throw new Error('storage full'); } };
  try { await assert.rejects(storage.receiveVideo('charlie', ref), /storage full/); assert.equal(deletes.length, 1); }
  finally { global.indexedDB = original; }
});

test('failed upload removes the attempted sender local copy and reports failure', async () => {
  failUpload = true; const file = new File(['video-data'], 'clip.mp4', { type:'video/mp4' });
  try { await assert.rejects(storage.prepareVideo('alice', room, file, true), /upload failed/); }
  finally { failUpload = false; }
  const latest = inserts[inserts.length-1]; const ref = refs.videoReference(room, latest.id);
  assert.equal(await storage.loadVideoOnDevice('alice', ref), null);
});


test('conversation cleanup removes only that account and chat’s device videos', async () => {
  const target = refs.videoReference(room, id);
  const otherRoom = refs.videoReference('cccccccc-cccc-cccc-cccc-cccccccccccc', id);
  await storage.saveVideoOnDevice('alice', target, blob);
  await storage.saveVideoOnDevice('alice', otherRoom, blob);
  await storage.saveVideoOnDevice('bob', target, blob);
  await storage.clearConversationVideos('alice', room);
  assert.equal(await storage.loadVideoOnDevice('alice', target), null);
  assert.ok(await storage.loadVideoOnDevice('alice', otherRoom));
  assert.ok(await storage.loadVideoOnDevice('bob', target));
});
