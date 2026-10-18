'use strict';
const test=require('node:test'),assert=require('assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto'),{EventEmitter}=require('events'),{PassThrough}=require('stream');
const C=require('../app/difficulty-v12/three-stage.cjs'),P=require('../app/difficulty-v12/three-stage-profile.cjs'),R=require('../app/difficulty-v12/subscription.cjs'),I=require('../app/difficulty-v12/input.cjs'),F=require('./fixtures/difficulty-v12-values.cjs');
const result=(tier=2,extra={})=>({status:'complete',computed:{status:'complete',problem_tier:'T'+tier,score:4.5},raw:{confidence:.9,assessment_uncertainty:[],...extra}});
test('stage one uses only its own T3 threshold; T2 is final without extra validation',()=>{
 assert.equal(C.decision(1,result()).next,null);assert.equal(C.decision(1,result(2,{confidence:.4,assessment_uncertainty:['gate_ambiguity']})).finalStatus,'complete');
 assert.equal(C.decision(1,result(3)).next,2);assert.equal(C.decision(1,{status:'failed',computed:{reason:'invalid_response'}}).next,2);
});
test('stage two escalates failures and uncertainty only, high tier alone is accepted',()=>{
 assert.equal(C.decision(2,result(5)).finalStatus,'complete');assert.equal(C.decision(2,result(1,{assessment_uncertainty:['gate_ambiguity']})).next,3);
 assert.equal(C.decision(2,result(3,{confidence:.69})).next,3);assert.equal(C.decision(2,result(3,{confidence:.7})).next,null);
 assert.equal(C.decision(3,result(3,{confidence:.2})).finalStatus,'failed');assert.equal(C.decision(3,{status:'failed'}).next,null);
});
test('proof-d profile and hashes differ from baseline; fixed model/effort pairs only',()=>{
 assert.match(P.instructions,/\(d\) 증명에서 빈칸/);assert.notEqual(P.promptHash,R.profile('literacy-plus-one-20261018').promptHash);
 assert.equal(new Set(C.stages.map(s=>R.profile(P.id,s).evaluationVersion)).size,3);assert.throws(()=>R.execution('other'));
 assert.equal(P.evaluate({...F.raw(F.route([F.d('a')])),assessment_uncertainty:[]}).computed.status,'complete');assert.equal(P.evaluate(F.raw(F.route([F.d('a')]))).computed.status,'failed');
});
test('subscription stage runs send exact models, retain uncertainty, isolate caches and never pass prior scores',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'three-stage-test-')),bytes=Buffer.from('fixture');
 const entry={id:'a',priorScore:9.9,input:I.input({question:{body:'문항'},scope:'중2',images:[{sha256:crypto.createHash('sha256').update(bytes).digest('hex'),dataUrl:'data:image/png;base64,'+bytes.toString('base64')}]})};
 const seen=[];let calls=0;const launch=(exe,args)=>{calls++;const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.stdin.on('data',b=>{assert(!b.toString().includes('priorScore'));assert(!b.toString().includes('9.9'));});child.kill=()=>{};seen.push(args);setImmediate(()=>{fs.writeFileSync(args[args.indexOf('--output-last-message')+1],JSON.stringify({...F.raw(F.route([F.d('a')])),assessment_uncertainty:['gate_ambiguity']}));child.stdout.write(JSON.stringify({type:'turn.completed'})+'\n');child.emit('close',0);});return child;};
 const values=[];for(const executionProfile of C.stages){const options={outputRoot:root,executionProfile,scoringProfile:P.id,launch};values.push(await R.runOne(entry,options));await R.runOne(entry,options);}
 assert.equal(calls,3);assert.equal(new Set(values.map(r=>r.key)).size,3);
 for(const [i,id] of C.stages.entries()){const s=R.execution(id);assert.equal(seen[i][seen[i].indexOf('--model')+1],s.model);assert(seen[i].includes('model_reasoning_effort="'+s.effort+'"'));assert.deepEqual(values[i].raw.assessment_uncertainty,['gate_ambiguity']);}
 for(const r of values){const dir=path.join(root,r.key);for(const name of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,name));fs.rmdirSync(dir);}fs.rmdirSync(root);
});
