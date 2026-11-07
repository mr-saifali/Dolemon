const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(id, parent, ...rest) { if (id.startsWith('@/')) id = path.join(__dirname, '..', id.slice(2)); return resolve.call(this, id, parent, ...rest); };
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
const { MessageBubble } = require('../components/chat/MessageBubble.tsx');
const { MessageList } = require('../components/chat/MessageList.tsx');
const { ChatInput } = require('../components/chat/ChatInput.tsx');
const { AttachmentSheet } = require('../components/chat/attachment-sheet.tsx');
const { isEmojiOnly } = require('../lib/emoji.ts');
const props = { tail:true, partnerName:'Sam', partnerAvatarId:'rose', onLongPress(){}, onDoubleTap(){}, onRemoveMyReaction(){}, onRetry(){}, animateIn:false };
const msg = (author, text, extra = {}) => ({ id:'1', author, kind:'text', text, at:1000, ...extra });
const renderBubble = (message, overrides = {}) => renderToStaticMarkup(React.createElement(MessageBubble, { ...props, ...overrides, message }));

test('sent and received text bubbles implement the requested dimensions and treatments', () => {
  for (const author of ['me', 'them']) {
    const html = renderBubble(msg(author, 'Hello there'));
    for (const token of ['max-w-[75%]', 'px-4', 'py-2.5', 'text-[15px]', 'leading-snug', 'rounded-[22px]']) assert.ok(html.includes(token), token);
    assert.match(html, /text-\[10px\].*float-right ml-2 mt-1.*text-white\/50/);
    if (author === 'me') { assert.match(html, /rounded-br-sm bg-\[#005C4B\]/); assert.doesNotMatch(html, /border-white\/20/); }
    else assert.match(html, /rounded-bl-sm border border-white\/20 bg-white\/5/);
  }
});

test('only complete emoji messages use the unboxed large treatment, including common complex emoji', () => {
  for (const text of ['❤️', '👩🏽‍💻', '🇮🇳', '1️⃣', '🎉 ✨', '👨‍👩‍👧‍👦']) {
    assert.equal(isEmojiOnly(text), true, text);
    const html = renderBubble(msg('them', text));
    assert.match(html, /border-0 bg-transparent p-0/); assert.match(html, /text-5xl/); assert.match(html, /text-\[10px\].*text-zinc-500/);
    assert.doesNotMatch(html, /rounded-\[22px\]/);
  }
  for (const text of ['1', '123', 'hello 👋', '👋2', '', '  ']) {
    assert.equal(isEmojiOnly(text), false, text);
    assert.match(renderBubble(msg('me', text)), /rounded-\[22px\]/);
  }
});

test('reply quotes use a thin border and truncated text, including in emoji messages', () => {
  for (const text of ['reply', '❤️']) {
    const html = renderBubble(msg('me', text, { replyTo:{ id:'x', author:'them', text:'A previous message' } }));
    assert.match(html, /mb-1 .*border-l-2 border-white\/40 pl-2 text-\[13px\].*text-white\/70/);
    assert.match(html, /class="truncate"/); assert.match(html, /Sam:.*A previous message/);
  }
});

test('received avatars appear at the end of each consecutive sender group and spacing follows the next sender', () => {
  const messages = [msg('them','one',{id:'one'}), msg('them','photo',{id:'two',kind:'image',media:{url:'/photo.jpg'}}), msg('me','three',{id:'three'}), msg('them','four',{id:'four'})];
  const html = renderToStaticMarkup(React.createElement(MessageList, { ...props, messages, typing:false, showReceipts:true, dividerId:null }));
  assert.match(html, /id="message-one" class="mb-1"/);
  for (const id of ['two','three','four']) assert.match(html, new RegExp(`id="message-${id}" class="mb-4"`));
  assert.equal((html.match(/width:24px;height:24px/g) || []).length, 2);
  assert.equal((html.match(/h-6 w-6 shrink-0/g) || []).length, 3);
  assert.doesNotMatch(renderBubble(msg('them','not last'),{tail:false}), /width:24px;height:24px/);
  assert.match(renderBubble(msg('them','last'),{tail:true,partnerAvatarUrl:'https://example.com/avatar.png'}), /src="https:\/\/example.com\/avatar.png"/);
});

test('composer keeps its attachment choices behind one plus button', () => {
  const html = renderToStaticMarkup(React.createElement(ChatInput, { onSend(){}, onSticker(){}, onPulse(){}, onAttach(){}, onVoice(){} }));
  for (const token of ['mx-3 mb-4', 'rounded-full', 'bg-black/40', 'backdrop-blur-md', 'Attachment options', 'text-[16px]']) assert.ok(html.includes(token), token);
  assert.doesNotMatch(html, />Photo<|>Camera<|>Voice note</);
  const sheet = renderToStaticMarkup(React.createElement(AttachmentSheet, { open:true, onClose(){}, onPhoto(){}, onVoice(){} }));
  assert.match(sheet, /Take a photo/); assert.match(sheet, /capture="environment"/); assert.match(sheet, /From your phone/); assert.match(sheet, /Voice note/);
});

test('plus menu invokes photo, camera, voice, file, video and stickers', async () => {
  const { act, create } = require('react-test-renderer');
  const calls=[]; let sticker, tree;
  await act(async () => { tree = create(React.createElement(ChatInput, { onSend(){}, onSticker:(value) => { sticker = value; }, onPulse(){}, onAttach:() => calls.push('photo'), onCamera:() => calls.push('camera'), onVoice:() => calls.push('voice'), onFile:() => calls.push('file'), onVideo:() => calls.push('video') })); });
  for (const label of ['Photo','Camera','Voice note','File','Video']) {
    await act(async () => tree.root.findByProps({'aria-label':'Attachment options'}).props.onClick());
    const button=tree.root.findAllByType('button').find((node)=>node.children.includes(label));
    assert.ok(button,label); await act(async()=>button.props.onClick());
  }
  assert.deepEqual(calls,['photo','camera','voice','file','video']);
  await act(async () => tree.root.findByProps({'aria-label':'Attachment options'}).props.onClick());
  await act(async () => tree.root.findAllByType('button').find((node)=>node.children.includes('Stickers')).props.onClick());
  const stickerButton = tree.root.findAll((node) => typeof node.props['aria-label'] === 'string' && node.props['aria-label'].startsWith('Send ') && node.props['aria-label'] !== 'Send message')[0];
  assert.ok(stickerButton); await act(async () => stickerButton.props.onClick());
  assert.ok(sticker); assert.equal(tree.root.findByProps({ 'aria-label':'Attachment options' }).props['aria-expanded'], false);
  await act(async () => tree.unmount());
});

test('attachment sheet highlights the camera and offers a device picker when preview is unavailable', async () => {
  const { act, create } = require('react-test-renderer');
  let cameraClicks = 0, tree;
  await act(async () => { tree = create(React.createElement(AttachmentSheet, { open:true, preferred:'camera', onClose(){}, onPhoto(){}, onVoice(){} }), {
    createNodeMock: (node) => node.type === 'input' && node.props.capture === 'environment' ? { click() { cameraClicks++; } } : null,
  }); });
  const camera = tree.root.findAllByType('button').find((button) => button.findAllByType('span').some((span) => span.children.includes('Camera')));
  assert.ok(camera); assert.match(camera.props.className, /border-rose\/50/);
  await act(async () => camera.props.onClick());
  const fallback=tree.root.findAllByType('button').find(button => button.children.includes('Open device camera'));
  assert.ok(fallback);await act(async () => fallback.props.onClick());assert.equal(cameraClicks,1);
  await act(async () => tree.unmount());
});

test('typing hides attachment controls, expands the draft and preserves the send action', async () => {
  const { act, create } = require('react-test-renderer');
  let sent, tree;
  const textareaNode = { style:{}, scrollHeight:24, focus() {} };
  global.document = { activeElement: textareaNode };
  try {
    await act(async () => { tree = create(React.createElement(ChatInput, { onSend:(v) => { sent = v; }, onSticker(){}, onPulse(){}, onAttach(){}, onCamera(){}, onVoice(){} }), { createNodeMock: (node) => node.type === 'textarea' ? textareaNode : null }); });
    await act(async () => tree.root.findByProps({'aria-label':'Attachment options'}).props.onClick());
    await act(async () => tree.root.findByType('textarea').props.onChange({ target:{ value:'Hi there' } }));
    assert.equal(tree.root.findAllByProps({ 'aria-label':'Attachment options' }).length,0);
    assert.equal(tree.root.findAllByProps({ 'aria-label':'Add to your message' }).length,0);
    assert.deepEqual(tree.root.findAllByType('button').map(button=>button.props['aria-label']), ['Send message']);
    await act(async () => tree.root.findByProps({ 'aria-label':'Send message' }).props.onClick());
    assert.equal(sent, 'Hi there');
    assert.ok(tree.root.findByProps({ 'aria-label':'Attachment options' }));
    await act(async () => tree.unmount());
  } finally { delete global.document; }
});

test('unread separators and system events break an avatar group; compact mode remains available', () => {
  const messages = [msg('them','one',{id:'one'}), msg('them','two',{id:'two'}), msg('system','moment',{id:'moment',kind:'presence'}), msg('them','three',{id:'three'})];
  const base = { ...props, messages, typing:false, showReceipts:true, dividerId:'two' };
  const html = renderToStaticMarkup(React.createElement(MessageList, base));
  assert.equal((html.match(/width:24px;height:24px/g) || []).length, 3);
  assert.match(html, /id="message-one" class="mb-4"/);
  assert.match(html, /id="message-two" class="mb-4"/);
  const compact = renderToStaticMarkup(React.createElement(MessageList, { ...base, compact:true }));
  assert.match(compact, /id="message-one" class="mb-2"/);
});

test('scrolling upward requests older messages once and keeps the visible position stable', async () => {
  const { act, create } = require('react-test-renderer');
  const oldRaf = global.requestAnimationFrame;
  global.requestAnimationFrame = (fn) => { fn(); return 1; };
  const scroller = { scrollHeight: 1000, scrollTop: 250, clientHeight: 300, scrollTo() {} };
  let calls = 0, tree;
  try {
    await act(async () => { tree = create(React.createElement(MessageList, {
      messages: [], partnerName:'Sam', typing:false, showReceipts:true, dividerId:null,
      onLongPress(){}, onDoubleTap(){}, onRemoveMyReaction(){}, onRetry(){},
      hasOlder:true, onLoadOlder:async () => { calls++; scroller.scrollHeight += 120; },
    }), { createNodeMock: (node) => node.type === 'div' && node.props.onScroll ? scroller : null }); });
    const scroll = tree.root.find((node) => node.type === 'div' && node.props.onScroll).props.onScroll;
    await act(async () => { scroll(); scroller.scrollTop = 40; scroll(); await Promise.resolve(); });
    assert.equal(calls, 1);
    assert.equal(scroller.scrollTop, 160);
    await act(async () => tree.unmount());
  } finally { global.requestAnimationFrame = oldRaf; }
});
