'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const R=require('../app/difficulty-v12/subscription.cjs'),I=require('../app/difficulty-v12/input.cjs');
function input(){const bytes=Buffer.from('fixture-only'),sha=require('node:crypto').createHash('sha256').update(bytes).digest('hex');return I.input({question:{body:'시험용 원문'},scope:'중2',images:[{sha256:sha,dataUrl:'data:image/png;base64,'+bytes.toString('base64')}]});}
test('subscription-only settings strip API credentials and use isolated structured output',()=>{
 const env=R.cleanEnv({PATH:'ok',OPENAI_API_KEY:'private',CODEX_API_KEY:'private',R2_SECRET:'private'});assert.deepEqual(env,{PATH:'ok'});
 const args=R.argsFor({cwd:'isolated',schemaFile:'schema',outputFile:'out',images:['source']});
 for(const required of ['--ignore-user-config','forced_login_method="chatgpt"','features.shell_tool=false','--output-schema','gpt-6.1-sol'])assert(args.includes(required));
 assert(!args.some(a=>a.startsWith('model_providers.openai.')),'reserved built-in provider overrides are rejected before model execution');
 assert.notEqual(R.evaluationVersion,I.evaluationVersion);
 assert(!R.promptFor(input()).includes('expectedTier'));
});
test('successful raw result is scored once and cached without a second model run',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'v12-sub-success-'));let calls=0;
 const F=require('./fixtures/difficulty-v12-values.cjs');
 const launch=(exe,args)=>{calls++;const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.kill=()=>{};setImmediate(()=>{
  fs.writeFileSync(args[args.indexOf('--output-last-message')+1],JSON.stringify(F.raw(F.route([F.d('d')]))));
  child.stdout.write(JSON.stringify({type:'turn.completed',usage:{input_tokens:100,output_tokens:40}})+'\n');child.emit('close',0);
 });return child;};
 const entry={id:'V2',input:input()},a=await R.runOne(entry,{outputRoot:root,launch}),b=await R.runOne(entry,{outputRoot:root,launch});
 assert.equal(calls,1);assert.equal(a.status,'complete');assert.equal(a.computed.score,b.computed.score);assert.equal(a.evidence.usage.input_tokens,100);
 const dir=path.join(root,a.key);for(const name of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,name));fs.rmdirSync(dir);fs.rmdirSync(root);
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

test('structured CLI failure preserves actual message/code and redacts secrets, cached retry calls zero',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'v12-error-events-'));let calls=0;
 const launch=()=>{calls++;const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.kill=()=>{};setImmediate(()=>{
  child.stdout.write(JSON.stringify({type:'turn.failed',error:{code:'rate_limit',message:'Limit reached. Retry later. Bearer secret'}})+'\n');child.emit('close',1);
 });return child;};
 const e={id:'error',input:input()},a=await R.runOne(e,{outputRoot:root,launch});await R.runOne(e,{outputRoot:root,launch});
 assert.equal(calls,1);assert.equal(a.evidence.errors[0].code,'rate_limit');assert.match(a.evidence.errors[0].message,/Limit reached/);assert(!JSON.stringify(a).includes('Bearer secret'));
 const dir=path.join(root,a.key);for(const name of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,name));fs.rmdirSync(dir);fs.rmdirSync(root);
});
test('explicit literacy-one profile sends its prompt and scores in a separate cache',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'v12-sub-profile-')),F=require('./fixtures/difficulty-v12-values.cjs');let calls=0;const sent=[];
 const launch=(exe,args)=>{calls++;const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.stdin.on('data',b=>sent.push(b.toString()));child.kill=()=>{};setImmediate(()=>{
  fs.writeFileSync(args[args.indexOf('--output-last-message')+1],JSON.stringify({...F.raw(F.route([F.d('d',1,1,1,1)])),literacy_high:true,literacy_evidence:'memory'}));
  child.stdout.write(JSON.stringify({type:'turn.completed'})+'\n');child.emit('close',0);
 });return child;};
 const entry={id:'new',input:input()},old=await R.runOne(entry,{outputRoot:root,launch}),options={outputRoot:root,launch,scoringProfile:'literacy-plus-one-20261018'},current=await R.runOne(entry,options),again=await R.runOne(entry,options);
 assert.equal(calls,2);assert.equal(old.computed.problem_tier,'T2');assert.equal(current.computed.problem_tier,'T1');assert.notEqual(old.key,current.key);assert.equal(current.key,again.key);
 assert.match(sent[1],/문해력\+1/);assert.doesNotMatch(sent[1],/문해력\s*\+2/);assert.equal(current.promptHash,R.profile(options.scoringProfile).promptHash);
 for(const key of [old.key,current.key]){const dir=path.join(root,key);for(const name of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,name));fs.rmdirSync(dir);}fs.rmdirSync(root);
});
