'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const R=require('../app/difficulty-v12/subscription.cjs'),I=require('../app/difficulty-v12/input.cjs');
function input(){const bytes=Buffer.from('fixture-only'),sha=require('node:crypto').createHash('sha256').update(bytes).digest('hex');return I.input({question:{body:'시험용 원문'},scope:'중2',images:[{sha256:sha,dataUrl:'data:image/png;base64,'+bytes.toString('base64')}]});}
test('subscription-only settings strip API credentials and use isolated structured output',()=>{
 const env=R.cleanEnv({PATH:'ok',OPENAI_API_KEY:'private',CODEX_API_KEY:'private',R2_SECRET:'private'});assert.deepEqual(env,{PATH:'ok'});
 const args=R.argsFor({cwd:'isolated',schemaFile:'schema',outputFile:'out',images:['source']});
 for(const required of ['--ignore-user-config','forced_login_method="chatgpt"','features.shell_tool=false','--output-schema','gpt-6.1-sol'])assert(args.includes(required));
 assert.notEqual(R.evaluationVersion,I.evaluationVersion);
 assert(!R.promptFor(input()).includes('expectedTier'));
});
test('partial external set cannot start the 30-item pilot; tampered inputs fail',()=>{
 const entries=Array.from({length:22},(_,i)=>({id:'B'+i,questionId:'q'+i,input:input()}));
 for(let i=1;i<=5;i++)entries.push({id:'V'+i,input:input()});
 assert.throws(()=>R.validatePilot(entries),/30개/);
 for(let i=6;i<=8;i++)entries.push({id:'V'+i,input:input()});
 assert.match(R.validatePilot(entries),/^[a-f0-9]{64}$/);
 entries[0].input.payload.question.body='변조';assert.throws(()=>R.validatePilot(entries),/불일치/);
});
test('interrupted result is retained and never automatically replayed',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'v12-sub-test-'));let calls=0;
 const launch=()=>{calls++;const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.kill=()=>{};setImmediate(()=>{child.stdout.write(JSON.stringify({type:'thread.started',thread_id:'fixture'})+'\n');child.emit('close',1);});return child;};
 const entry={id:'V1',input:input()};const a=await R.runOne(entry,{outputRoot:root,launch});const b=await R.runOne(entry,{outputRoot:root,launch});
 assert.equal(calls,1);assert.equal(a.status,'failed');assert.equal(b.computed.score,null);assert.equal(a.evidence.threadId,'fixture');
 const dir=path.join(root,a.key);for(const name of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,name));fs.rmdirSync(dir);fs.rmdirSync(root);
});
