'use strict';
// Explicit developer smoke test: one public synthetic image, no personal exam data.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {ClaudeBridge}=require('../app/claude.cjs');
(async()=>{
 const root=path.resolve('data/validation');fs.mkdirSync(root,{recursive:true});const dir=fs.mkdtempSync(path.join(root,'claude-live-'));
 const file=path.join(dir,'problem.png');await require('sharp')(Buffer.from('<svg width="400" height="160"><rect width="400" height="160" fill="white"/><text x="20" y="90" font-size="40">7 + 5 = ?</text></svg>')).png().toFile(file);
 const bridge=new ClaudeBridge({cwd:dir,requestsDir:path.join(dir,'requests'),runtimeDir:path.resolve('runtime/claude'),onEvent:e=>console.log(e.text||e.type)});
 try{const response=await bridge.run({context:{id:'smoke'},text:'이미지의 계산 결과를 answer 필드에 숫자 문자열로 쓰세요.',images:[file],model:'sonnet',effort:'medium',execution:{instructions:'이미지에 보이는 덧셈을 계산하세요.',schema:{type:'object',properties:{answer:{type:'string'}},required:['answer'],additionalProperties:false}}});assert.equal(response.result.answer,'12');console.log('PASS official Claude CLI image input, JSON result and subscription auth');}finally{bridge.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
