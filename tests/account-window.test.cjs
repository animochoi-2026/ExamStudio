'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{EventEmitter}=require('node:events');
const {AntigravityBridge}=require('../app/antigravity.cjs');
test('Gemini account actions launch official interactive commands without an AI request',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'exam-auth-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const calls=[],bridge=new AntigravityBridge({cwd:dir,requestsDir:dir,executable:"C:\\test folder\\a'b.exe",spawnImpl:(exe,args,opts)=>{calls.push({exe,args,opts});const p=new EventEmitter();p.kill=()=>{};queueMicrotask(()=>p.emit('close',0));return p;}});
 for(const action of ['login','logout','switch']){assert.deepEqual(await bridge.openAccountWindow(action),{opened:true,action});const c=calls.at(-1),outer=Buffer.from(c.args.at(-1),'base64').toString('utf16le');assert.match(outer,/Start-Process/);assert.match(outer,/-WindowStyle Normal/);const encoded=outer.match(/'-EncodedCommand','([^']+)'/)[1],inner=Buffer.from(encoded,'base64').toString('utf16le');assert.doesNotMatch(inner,/--print| -p /);if(action!=='login')assert.match(inner,/--prompt-interactive '\/logout'/);assert.match(inner,/a''b/);assert.equal(c.opts.shell,false);assert.equal(c.opts.env.GEMINI_API_KEY,undefined);}
 await assert.rejects(bridge.openAccountWindow('unknown'),/계정 작업/);assert.equal(calls.length,3);
});
