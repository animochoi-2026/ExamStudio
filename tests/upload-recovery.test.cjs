'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const R=require('../app/upload-recovery.cjs'),P=require('../app/bank-protected-metadata.cjs'),{SharedBankStorage}=require('../app/shared-bank-storage.cjs');
function directory(t){const d=fs.mkdtempSync(path.join(os.tmpdir(),'upload-recovery-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return d;}
test('lost upload response probes server, reuses bytes and verification; bounded retry and sanitized stage diagnostics',async t=>{
 const dir=directory(t),id='11111111-1111-4111-8111-111111111111',file=path.join(dir,'image.png'),bytes=Buffer.from('controlled image fixture');fs.writeFileSync(file,bytes);
 let stored=null,uploads=0,verify=0,reserves=0;const entry={id,space_id:id,chunks:1,verified:false};
 const auth={config:()=>({url:'https://fixture.supabase.co',spaceId:id,publishableKey:'public',storageGateway:true}),token:async()=> 'private-test-token',request:async(route,{body})=>{
  if(route.endsWith('bank_reserve')){reserves++;return {...entry};}
  if(route.includes('bank_entries'))return [{...entry}];
  if(route.endsWith('bank-storage'))return {provider:'r2',url:'https://fixture.r2.cloudflarestorage.com/file?secret=do-not-log'};
  if(route.endsWith('bank-verify')){verify++;entry.verified=true;return {};}
  throw Error(route);
 }};
 const storage=new SharedBankStorage({auth,fetchImpl:async(url,opts)=>{if(opts.method==='POST'){uploads++;stored=Buffer.from(opts.body);throw new TypeError('fetch failed',{cause:Object.assign(Error('socket closed https://secret.invalid/?token=hidden'),{code:'ECONNRESET'})});}return stored?new Response(stored):new Response('',{status:404});}});
 const job={id,questionId:id,revisionId:id,remote:{}},bank={dir,auth,state:{items:{[id]:{metadata:{source:{school:'검증중',originalNumber:'13'}}}}},save(){},remoteHeads:async()=>[]};let lookups=0;bank.remoteHeads=async()=>{lookups++;return [];};const waits=[];
 const execute=()=>storage.put({file,id,name:'image.png',parent:id,properties:{role:'asset',questionId:id}});
 await R.run(bank,job,execute,{sleep:async ms=>waits.push(ms),random:()=>0});
 assert.equal(uploads,1);assert.equal(verify,1);assert.equal(reserves,2);assert.equal(lookups,2);assert.deepEqual(waits,[1000]);
 await R.run(bank,job,execute);assert.equal(uploads,1);assert.equal(verify,1);
 const log=fs.readFileSync(path.join(dir,'upload-diagnostics.jsonl'),'utf8');assert.match(log,/ECONNRESET/);assert.match(log,/"attempt":1/);assert.match(log,/"automaticRetry":true/);assert.match(log,/파일 전송/);assert.doesNotMatch(log,/private-test-token|secret.invalid|do-not-log|token=hidden/);
});
test('protected metadata recursively survives the deployed SQL guard and database reread',async t=>{
 const {PGlite}=require('@electric-sql/pglite'),db=new PGlite();t.after(()=>db.close());
 const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/202609300011_maintenance.sql'),'utf8'),start=sql.indexOf('create function public.bank_metadata_keys_preserved'),end=sql.indexOf('revoke execute',start);
 await db.exec(sql.slice(start,end));await db.exec('create table fixture(metadata jsonb)');
 const prior={processing:{displayCorrection:{at:'saved',figures:['original']},rules:{integrity:{sha:'verified'}}},classification:{confirmed:{unit:'teacher'}},futureProtected:{nested:{value:'keep'}}};
 let rows=[{metadata:prior,review_version:4}],item={id:'q',baseRevisionId:'r',metadata:{classification:{suggested:{unit:'new'}}}};await P.refresh({storage:{kind:'shared',rows:async()=>rows}},item);
 assert.deepEqual(item.metadata.processing,prior.processing);assert.deepEqual(item.metadata.futureProtected,prior.futureProtected);
 assert.equal((await db.query('select bank_metadata_keys_preserved($1,$2) ok',[prior,item.metadata])).rows[0].ok,true);
 const oldDifficulty={...prior,difficulty:{aiScore:9,userScore:8,assessment:{old:true},v121Active:{final_score:9}}};
 const replaced=P.merge(oldDifficulty,{difficulty:{v121Latest:{record:{spec_revision:'1.2.1',final_status:'complete',final_score:4.7}},userScore:null}});
 assert.equal((await db.query('select bank_metadata_keys_preserved($1,$2) ok',[oldDifficulty,replaced])).rows[0].ok,true);
 assert.equal(replaced.difficulty.aiScore,null);assert.equal(replaced.difficulty.userScore,null);assert.equal(replaced.difficulty.assessment,null);assert.equal(replaced.difficulty.v121Active,null);
 assert.deepEqual(replaced.processing,prior.processing);assert.deepEqual(replaced.classification,prior.classification);
 const unchanged=P.merge({...oldDifficulty,difficulty:{userScore:6.2,v121Active:{input_identity:'same'}}},{difficulty:{userScore:null,v121Latest:{identity:'same',record:{spec_revision:'1.2.1'}}}});
 assert.equal(unchanged.difficulty.userScore,6.2);
 await db.query('insert into fixture values($1)',[item.metadata]);assert.deepEqual((await db.query('select metadata from fixture')).rows[0].metadata.processing,prior.processing);
 rows=[{metadata:{...prior,processing:{displayCorrection:{at:'concurrent'}}}}];await assert.rejects(P.check({storage:{rows:async()=>rows}},{protectedBase:item.protectedBase}),/최신 수정 이력/);
});
test('failed upload is local; configured concurrency stays five and another slot continues',async t=>{
 const {ExamQueue}=require('../app/exam-queue.cjs'),{runQuestions}=await import('../app/question-workers.js');const q=new ExamQueue({directory:directory(t),store:{get:()=>({problems:[]})}});
 q.state.items.push({id:'exam',status:'pending',steps:{},metadata:{numbering:{}},discoveryIssues:[],move:{}});q.action('limits',null,{aiConcurrency:5});q.action('resume');let active=0,peak=0,done=0;
 await runQuestions({problems:Array.from({length:7},(_,i)=>({id:String(i)})),limit:q.state.limits.aiConcurrency,stages:['upload'],keepGoing:()=>true,step:(p)=>q.stage('exam',p.id+':upload','upload',{},async()=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,10));active--;if(p.id==='0')throw Object.assign(Error('network'),{code:'network'});done++;return true;},v=>!!v),onResult:()=>{}});
 assert.equal(peak,5);assert.equal(done,6);assert.equal(q.state.limits.aiConcurrency,5);assert.equal(q.item('exam').steps['0:upload'].uploadState,'재시도 대기');assert(!q.state.blockers?.supabase);assert.equal(q.state.mode,'running');
});
test('retry policy excludes structural errors; server Retry-After overrides backoff',async t=>{
 for(const status of [400,403,409,500])assert.equal(R.retryable({status}),false);for(const status of [408,429,502,503,504])assert.equal(R.retryable({status}),true);
 const dir=directory(t),job={id:'job',questionId:'q'},bank={dir,state:{items:{}},save(){},remoteHeads:async()=>[]},waits=[];let calls=0;
 await assert.rejects(R.run(bank,job,async()=>{calls++;throw Object.assign(Error('busy'),{status:429,retryAfterMs:7});},{sleep:async ms=>waits.push(ms)}));assert.equal(calls,4);assert.deepEqual(waits,[7,7,7]);
});
