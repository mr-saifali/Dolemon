const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,f);
const {videoSender,setCameraEnabled,replaceCamera,removeCamera}=require('../lib/call-media.ts');
const track=(kind='video')=>({kind,enabled:true,readyState:'live',stop(){this.readyState='ended';}});
const stream=(...tracks)=>({getTracks:()=>[...tracks],getVideoTracks:()=>tracks.filter(t=>t.kind==='video'),addTrack:t=>tracks.push(t),removeTrack(t){tracks=tracks.filter(x=>x!==t);}});
const peer=(video=track())=>{const sender={track:video,async replaceTrack(t){this.track=t;}};return {sender,getTransceivers:()=>[{sender,receiver:{track:track()}}],addTrack(){throw Error('must reuse sender');}};};
function media(fn){Object.defineProperty(global,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:fn}}});}

test('camera on -> off -> on enables the outgoing track again',()=>{
 const t=track(),s=stream(t);setCameraEnabled(s,false);assert.equal(t.enabled,false);setCameraEnabled(s,true);assert.equal(t.enabled,true);
});
test('voice -> video reuses nullable sender; repeated upgrades do not leak cameras',async()=>{
 const old=track(),s=stream(track('audio'),old),p=peer(old);
 await removeCamera(p,s);assert.equal(old.readyState,'ended');assert.equal(p.sender.track,null);assert.equal(videoSender(p),p.sender);
 const fresh=track();media(async()=>stream(fresh));
 assert.equal(await replaceCamera(p,s,'user',true,()=>true),true);
 assert.equal(p.sender.track,fresh);assert.deepEqual(s.getVideoTracks(),[fresh]);assert.equal(fresh.enabled,true);
 await removeCamera(p,s);assert.equal(fresh.readyState,'ended');
});
test('flip replaces sender and preview, stops old camera and preserves camera-off state',async()=>{
 const old=track(),fresh=track(),s=stream(old),p=peer(old);media(async()=>stream(fresh));
 await replaceCamera(p,s,'environment',false,()=>true);
 assert.equal(p.sender.track,fresh);assert.equal(fresh.enabled,false);assert.equal(old.readyState,'ended');assert.deepEqual(s.getVideoTracks(),[fresh]);
});
test('Android busy-camera retry releases old device before opening other lens',async()=>{
 const old=track(),fresh=track(),s=stream(old),p=peer(old);let n=0;
 media(async()=>{if(!n++){const e=Error('busy');e.name='NotReadableError';throw e;}assert.equal(old.readyState,'ended');return stream(fresh);});
 assert.equal(await replaceCamera(p,s,'environment',true,()=>true),true);assert.equal(n,2);
});
test('permission denial keeps live camera; late capture after hangup is stopped',async()=>{
 const old=track(),s=stream(old),p=peer(old);media(async()=>{throw Error('denied');});
 await assert.rejects(replaceCamera(p,s,'environment',true,()=>true));assert.equal(old.readyState,'live');
 const fresh=track();media(async()=>stream(fresh));assert.equal(await replaceCamera(p,s,'user',true,()=>false),false);assert.equal(fresh.readyState,'ended');assert.equal(p.sender.track,old);
});
test('failed replacement releases newly captured device',async()=>{
 const old=track(),fresh=track(),s=stream(old),p=peer(old);p.sender.replaceTrack=async()=>{throw Error('invalid');};media(async()=>stream(fresh));
 await assert.rejects(replaceCamera(p,s,'user',true,()=>true));assert.equal(fresh.readyState,'ended');assert.equal(old.readyState,'live');
});
test('upgrade waits for receiver media acknowledgement, handles glare and streamless remote tracks',()=>{
 const src=fs.readFileSync('lib/live-call.tsx','utf8');
 assert.match(src,/signal\.acknowledged\) \{ await renegotiate\(\)/);
 assert.match(src,/await applyCallType\(signal.type\)/);
 assert.match(src,/acknowledged: true/);
 assert.match(src,/setLocalDescription\(\{ type: "rollback" \}\)/);
 assert.match(src,/received.addTrack\(event.track\)/);
 assert.match(src,/event.track.onunmute = publish/);
 assert.match(src,/signalQueue.current.then/);
});

test('camera sender prefers the negotiated transceiver and upgrades receive-only direction',()=>{
 const orphan={mid:null,receiver:{track:track()},sender:{track:null},direction:'sendrecv'};
 const negotiated={mid:'1',receiver:{track:track()},sender:{track:null},direction:'recvonly'};
 assert.equal(videoSender({getTransceivers:()=>[orphan,negotiated]}),negotiated.sender);
 assert.equal(negotiated.direction,'sendrecv');
});
