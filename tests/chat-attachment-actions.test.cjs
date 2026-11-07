const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const {act, create} = require('react-test-renderer');
const resolve=Module._resolveFilename;
Module._resolveFilename=function(id,parent,...rest){if(id.startsWith('@/'))id=path.join(__dirname,'..',id.slice(2));return resolve.call(this,id,parent,...rest)};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f);
const {AttachmentSheet}=require('../components/chat/attachment-sheet.tsx');

test('direct attachment actions synchronously open the correct native input',async()=>{
 const ref=React.createRef(), calls=[];let view;
 await act(async()=>{view=create(React.createElement(AttachmentSheet,{ref,open:false,onClose(){},onPhoto(){},onVoice(){},onFile(){},onVideo:async()=>{}}),{createNodeMock(node){
  if(node.type!=='input')return null;
  const label=node.props.capture?'camera':node.props.accept==='image/*'?'photo':node.props.accept?'video':'file';
  return {click(){calls.push(label)},value:''};
 }});});
 ref.current.openPhoto();ref.current.openFile();ref.current.openVideo();
 assert.deepEqual(calls,['photo','file','video']);
 await act(async()=>view.unmount());
});

test('dismissing a pending microphone permission request stops a late stream',async()=>{
 const oldNavigator=Object.getOwnPropertyDescriptor(global,'navigator');const oldRecorder=global.MediaRecorder;
 let resolveMedia,stopped=0,closed=0,view;const ref=React.createRef();
 Object.defineProperty(global,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:()=>new Promise(resolve=>{resolveMedia=resolve})}}});
 global.MediaRecorder=class {};
 try {
  await act(async()=>{view=create(React.createElement(AttachmentSheet,{ref,open:true,preferred:'voice',onClose(){closed++},onPhoto(){},onVoice(){}}));});
  await act(async()=>{ref.current.startVoice()});
  await act(async()=>{const buttons=view.root.findAllByProps({'aria-label':'Close'});buttons[buttons.length-1].props.onClick();});
  await act(async()=>{resolveMedia({getTracks:()=>[{stop(){stopped++}}]});await Promise.resolve();});
  assert.equal(closed,1);assert.equal(stopped,1);
  await act(async()=>view.unmount());
 } finally {if(oldNavigator)Object.defineProperty(global,'navigator',oldNavigator);else delete global.navigator;global.MediaRecorder=oldRecorder;}
});

test('voice action requests the microphone immediately and starts recording',async()=>{
 const oldNavigator=Object.getOwnPropertyDescriptor(global,'navigator');const oldRecorder=global.MediaRecorder;
 let requested=0,started=0,stopped=0,view;const ref=React.createRef();
 const stream={getTracks:()=>[{stop(){stopped++}}]};
 Object.defineProperty(global,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async constraints=>{requested++;assert.deepEqual(constraints,{audio:true});return stream}}}});
 global.MediaRecorder=class {static isTypeSupported(){return true}constructor(s){this.stream=s;this.mimeType='audio/webm';this.state='inactive'}start(){this.state='recording';started++}stop(){this.state='inactive'}};
 try {
  await act(async()=>{view=create(React.createElement(AttachmentSheet,{ref,open:true,preferred:'voice',onClose(){},onPhoto(){},onVoice(){}}));});
  await act(async()=>{ref.current.startVoice();await Promise.resolve()});
  assert.equal(requested,1);assert.equal(started,1);
  assert.ok(view.root.findAll(node=>node.type==='div' && node.children.includes('Recording voice note')).length);
  await act(async()=>{const close=view.root.findAllByProps({'aria-label':'Close'}).at(-1);close.props.onClick()});
  assert.equal(stopped,1);
  await act(async()=>view.unmount());
 } finally {if(oldNavigator)Object.defineProperty(global,'navigator',oldNavigator);else delete global.navigator;global.MediaRecorder=oldRecorder;}
});


test('camera requests the rear-facing stream immediately and stops it on close',async()=>{
 const oldNavigator=Object.getOwnPropertyDescriptor(global,'navigator');
 let requested=0,stopped=0,view;const ref=React.createRef();const video={srcObject:null,play:async()=>{}};
 const stream={getTracks:()=>[{stop(){stopped++}}]};
 Object.defineProperty(global,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async constraints=>{requested++;assert.deepEqual(constraints,{video:{facingMode:{ideal:'environment'}},audio:false});return stream}}}});
 try {
  await act(async()=>{view=create(React.createElement(AttachmentSheet,{ref,open:true,preferred:'camera',onClose(){},onPhoto(){},onVoice(){}}),{createNodeMock(node){return node.type==='video'?video:null}});});
  await act(async()=>{ref.current.openCamera();assert.equal(requested,1);await Promise.resolve()});
  assert.equal(video.srcObject,stream);assert.ok(view.root.findByProps({'aria-label':'Camera preview'}));
  await act(async()=>view.root.findAllByProps({'aria-label':'Close'}).at(-1).props.onClick());
  assert.equal(stopped,1);
  await act(async()=>view.unmount());
 } finally {if(oldNavigator)Object.defineProperty(global,'navigator',oldNavigator);else delete global.navigator;}
});

test('dismissing a pending camera permission request stops a late stream',async()=>{
 const oldNavigator=Object.getOwnPropertyDescriptor(global,'navigator');let resolveMedia,stopped=0,view;const ref=React.createRef();
 Object.defineProperty(global,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:()=>new Promise(resolve=>{resolveMedia=resolve})}}});
 try {
  await act(async()=>{view=create(React.createElement(AttachmentSheet,{ref,open:true,preferred:'camera',onClose(){},onPhoto(){},onVoice(){}}));});
  await act(async()=>{ref.current.openCamera()});
  await act(async()=>view.root.findAllByProps({'aria-label':'Close'}).at(-1).props.onClick());
  await act(async()=>{resolveMedia({getTracks:()=>[{stop(){stopped++}}]});await Promise.resolve()});
  assert.equal(stopped,1);
  await act(async()=>view.unmount());
 } finally {if(oldNavigator)Object.defineProperty(global,'navigator',oldNavigator);else delete global.navigator;}
});

test('switching to camera cancels a pending microphone request',async()=>{
 const oldNavigator=Object.getOwnPropertyDescriptor(global,'navigator'),oldRecorder=global.MediaRecorder;
 let resolveAudio,audioStopped=0,cameraStopped=0,view;const ref=React.createRef();const video={srcObject:null,play:async()=>{}};
 Object.defineProperty(global,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:constraints=>constraints.audio?new Promise(resolve=>{resolveAudio=resolve}):Promise.resolve({getTracks:()=>[{stop(){cameraStopped++}}]})}}});global.MediaRecorder=class{};
 try {
  await act(async()=>{view=create(React.createElement(AttachmentSheet,{ref,open:true,onClose(){},onPhoto(){},onVoice(){}}),{createNodeMock(node){return node.type==='video'?video:null}})});
  await act(async()=>ref.current.startVoice());
  await act(async()=>{ref.current.openCamera();await Promise.resolve()});
  await act(async()=>{resolveAudio({getTracks:()=>[{stop(){audioStopped++}}]});await Promise.resolve()});
  assert.equal(audioStopped,1);assert.ok(view.root.findByProps({'aria-label':'Camera preview'}));
  await act(async()=>view.root.findAllByProps({'aria-label':'Close'}).at(-1).props.onClick());assert.equal(cameraStopped,1);
  await act(async()=>view.unmount());
 } finally {if(oldNavigator)Object.defineProperty(global,'navigator',oldNavigator);else delete global.navigator;global.MediaRecorder=oldRecorder;}
});
