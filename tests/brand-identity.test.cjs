const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const resolve=Module._resolveFilename;
Module._resolveFilename=function(id,parent,...rest){if(id.startsWith('@/'))id=path.join(__dirname,'..',id.slice(2));return resolve.call(this,id,parent,...rest)};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f);

test('AI avatar uses its own supplied logo at the requested display size',()=>{
 const {DoremonFace}=require('../components/chat/doremon.tsx');
 const html=renderToStaticMarkup(React.createElement(DoremonFace,{size:32}));
 assert.match(html,/src="\/images\/ai-agent\.png\?v=1"/);assert.match(html,/width="32" height="32"/);
 const b=fs.readFileSync('public/images/ai-agent.png');assert.equal(b.readUInt32BE(16),256);assert.equal(b.readUInt32BE(20),256);
 assert.notDeepEqual(b,fs.readFileSync('public/icons/icon-192.png'));
});
test('app logo is versioned in the manifest and Apple metadata and available at every Android density',()=>{
 const manifest=fs.readFileSync('app/manifest.ts','utf8'),layout=fs.readFileSync('app/layout.tsx','utf8');
 assert.match(manifest,/icon-192\.png\?v=2/);assert.match(manifest,/icon-maskable\.png\?v=2/);assert.match(layout,/apple-touch-icon\.png\?v=2/);
 for(const [density,size] of [['mdpi',48],['hdpi',72],['xhdpi',96],['xxhdpi',144],['xxxhdpi',192]]){
  const b=fs.readFileSync(`android/app/src/main/res/drawable-${density}/ic_launcher.png`);assert.equal(b.readUInt32BE(16),size);assert.equal(b.readUInt32BE(20),size);
 }
});
