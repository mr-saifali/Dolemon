import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../package.json', import.meta.url));const ts=require('typescript');
const browserRequire=process.env.BROWSER_TEST_MODULES ? createRequire(process.env.BROWSER_TEST_MODULES+'/package.json') : require;
const puppeteer=browserRequire('puppeteer-core');const chromiumModule=browserRequire('@sparticuz/chromium');const chromium=chromiumModule.default ?? chromiumModule;
const source=ts.transpileModule(fs.readFileSync(new URL('../lib/call-media.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const browser=await puppeteer.launch({executablePath:await chromium.executablePath(),args:chromium.args,headless:true});
const page=await browser.newPage();
try {
 await page.goto(process.env.TEST_BASE_URL || 'http://localhost:3000');
 const result=await page.evaluate(async(source)=>{
  const exports={};new Function('exports',source)(exports);const {replaceCamera,removeCamera,setCameraEnabled}=exports;
  const pcs=[new RTCPeerConnection({iceServers:[]}),new RTCPeerConnection({iceServers:[]})];
  const remotes=[new MediaStream(),new MediaStream()];const cameras=[];const streams=[];const logs=[];
  const audio=new AudioContext();const osc=audio.createOscillator();const dst=audio.createMediaStreamDestination();osc.connect(dst);osc.start();
  for(let i=0;i<2;i++){
   const pc=pcs[i],other=pcs[1-i];
   pc.onicecandidate=e=>{if(e.candidate)other.addIceCandidate(e.candidate).catch(()=>{});};
   pc.ontrack=e=>remotes[i].addTrack(e.track);
   const stream=new MediaStream([dst.stream.getAudioTracks()[0].clone()]);streams.push(stream);pc.addTrack(stream.getAudioTracks()[0],stream);if(i===0)pc.addTransceiver('video',{direction:'sendrecv',streams:[stream]});
  }
  const negotiate=async(from=0)=>{const a=pcs[from],b=pcs[1-from];await a.setLocalDescription(await a.createOffer());await b.setRemoteDescription(a.localDescription);await b.setLocalDescription(await b.createAnswer());await a.setRemoteDescription(b.localDescription);};
  await negotiate();
  const wait=async(fn,label)=>{const start=Date.now();while(!await fn()){if(Date.now()-start>10000)throw Error(label);await new Promise(r=>setTimeout(r,100));}};
  await wait(()=>pcs.every(p=>p.connectionState==='connected'),'connect timeout');logs.push('two real WebRTC peers connected with voice');
  // Synthetic cameras exercise RTP without accessing anyone's real camera or account.
  const canvases=[];
  const camera=()=>{const c=document.createElement('canvas');c.width=160;c.height=120;let n=0;const ctx=c.getContext('2d');const timer=setInterval(()=>{ctx.fillStyle=`rgb(${n++%255},80,120)`;ctx.fillRect(0,0,160,120);},30);canvases.push(timer);const stream=c.captureStream(30);cameras.push(stream);return stream;};
  Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>camera()});
  for(let i=0;i<2;i++)await replaceCamera(pcs[i],streams[i],'user',true,()=>true);
  await negotiate(1); // The receiving user can initiate an upgrade too.
  const frames=async(i)=>{let n=0;(await pcs[i].getStats()).forEach(s=>{if(s.type==='inbound-rtp'&&s.kind==='video')n+=s.framesDecoded||0;});return n;};
  await wait(async()=>await frames(0)>2&&await frames(1)>2,'bidirectional video missing');logs.push('voice -> video: both peers decode received video');
  for(let i=0;i<2;i++){
   setCameraEnabled(streams[i],false);await new Promise(r=>setTimeout(r,150));setCameraEnabled(streams[i],true);
   let before=await frames(1-i);await wait(async()=>await frames(1-i)>before+2,'camera restart video missing');
   await replaceCamera(pcs[i],streams[i],'environment',true,()=>true);before=await frames(1-i);await wait(async()=>await frames(1-i)>before+2,'flip video missing');
  }
  logs.push('camera off/on and camera replacement on each peer continue decoding remote frames');
  for(let i=0;i<2;i++)await removeCamera(pcs[i],streams[i]);await negotiate();
  for(let i=0;i<2;i++)await replaceCamera(pcs[i],streams[i],'user',true,()=>true);await negotiate();
  const before=await Promise.all([frames(0),frames(1)]);await wait(async()=>await frames(0)>before[0]+2&&await frames(1)>before[1]+2,'second upgrade missing');
  logs.push('video -> voice -> video works again with reusable senders');
  for(const p of pcs)p.close();for(const s of [...streams,...cameras])s.getTracks().forEach(t=>t.stop());canvases.forEach(clearInterval);osc.stop();await audio.close();
  return logs;
 },source);
 console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}
