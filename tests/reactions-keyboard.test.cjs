const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,f);
const {REACTION_TYPES,REACTION_META,REACTION_EMOJI,isReactionType}=require('../lib/reactions.ts');
const {messageMenuPosition}=require('../lib/message-menu.ts');
test('expanded emoji range preserves existing stored reaction IDs and validates every entry',()=>{
 assert.deepEqual(REACTION_TYPES.slice(0,5),['dil','haha','wow','aww','hype']);assert.ok(REACTION_TYPES.length>=35);
 assert.equal(new Set(REACTION_TYPES).size,REACTION_TYPES.length);
 for(const id of REACTION_TYPES){assert.ok(isReactionType(id));assert.ok(REACTION_META[id].label);assert.ok(REACTION_EMOJI[id]);}
 assert.equal(isReactionType('bogus'),false);
});
test('expanded reactions stay inside a keyboard-shrunken viewport',()=>{
 for(const height of [280,380,640]){
 const p=messageMenuPosition({top:200,bottom:500,left:310,width:200},{width:360,height},true,4,330);
 assert.ok(p.left>=8);assert.ok(p.top>=8);assert.ok(p.top+p.maxHeight<=height-8);
 }
});
test('message and picker interactions preserve composer focus without removing keyboard navigation',()=>{
 const bubble=fs.readFileSync('components/chat/MessageBubble.tsx','utf8'),picker=fs.readFileSync('components/chat/ReactionPicker.tsx','utf8');
 assert.match(bubble,/isTextEntry\(document.activeElement\)\) event.preventDefault/);
 assert.match(picker,/if \(!isTextEntry\(previous\)\)/);
 assert.match(picker,/onPointerDownCapture/);assert.match(picker,/event.preventDefault/);
 assert.match(picker,/window.visualViewport\?\.height/);assert.match(picker,/More emoji reactions/);
 assert.match(picker,/<DialogPortal>/);
});
test('database check accepts every picker reaction without removing legacy IDs',()=>{
 const sql=fs.readFileSync('docs/migrations/021_expanded_reactions.sql','utf8');
 const ids=[...sql.matchAll(/'([a-z]+)'/g)].map(m=>m[1]);
 assert.deepEqual(ids,REACTION_TYPES);
 assert.match(sql,/add constraint message_reactions_reaction_type_check/);
 assert.doesNotMatch(sql,/delete from|storage\.objects|create policy/i);
});
