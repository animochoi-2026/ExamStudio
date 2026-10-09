'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {localServer}=require('./shared-bank-local-server.cjs'),{SharedBankStorage}=require('../app/shared-bank-storage.cjs'),P=require('../app/revision-payload-prune.cjs');
const proposal=path.join(__dirname,'../supabase/proposals/202610040027_revision_payload_pruning.sql');
async function fixture(t){
 const s=await localServer();t.after(()=>s.close());await s.db.exec('reset role');await s.auth(s.A).membership();
 await s.auth(s.A).request('/rest/v1/rpc/bank_invite',{method:'POST',body:{s:s.S,email_address:'teacher-b@example.test'}});await s.auth(s.B).membership();await s.db.exec('reset role');
 const q=crypto.randomUUID(),root=crypto.randomUUID(),old=crypto.randomUUID(),head=crypto.randomUUID();
 await s.db.query('insert into bank_questions(id,space_id,owner_id,owner_email) values($1,$2,$3,$4)',[q,s.S,s.A,'animochoi@gmail.com']);
 for(const [i,id,parent] of [[0,root,null],[1,old,root],[2,head,old]])await s.db.query("insert into bank_revisions(id,question_id,parent_id,actor_id,committed,visibility,created_at) values($1,$2,$3,$4,true,'approved',$5)",[id,q,parent,s.A,`2026-01-0${i+1}`]);
 const files=[];
 for(const [i,rev,size,chunks,role] of [[0,root,2,1,'commit'],[1,old,6291458,2,'commit'],[2,old,4,1,'data'],[3,old,4,1,'asset'],[4,head,2,1,'commit'],[5,old,3,1,'source']]){
  const id=crypto.randomUUID(),sha256='a'.repeat(64);files.push({id,rev,size,chunks,sha256,role});
  await s.db.query("insert into bank_entries(id,space_id,name,kind,owner_id,verified,size,chunks,sha256,props) values($1,$2,'fixture','file',$3,true,$4,$5,$6,$7)",[id,s.S,s.A,size,chunks,sha256,{role,revisionId:rev,questionId:q,...(role==='source'?{sourceKey:'b'.repeat(64)}:{})}]);
  await s.db.query('insert into bank_revision_files values($1,$2)',[rev,id]);
  for(let n=0;n<chunks;n++){const name=`${s.S}/${id}/${String(n).padStart(3,'0')}`;await s.db.query("insert into storage.objects(bucket_id,name,metadata) values('question-bank',$1,$2)",[name,{size:Math.min(6291456,size-n*6291456)}]);s.bytes.set(name,Buffer.from('fixture'));}
 }
 for(const [i,rev] of [root,old,head].entries()){const own=files.filter(f=>f.rev===rev&&f.role!=='commit');await s.db.query('insert into bank_catalog(revision_id,space_id,question_id,commit_id,metadata,content,files,created_at) values($1,$2,$3,$4,$5,$6,$7,$8)',[rev,s.S,q,files.find(f=>f.rev===rev&&f.role==='commit').id,{}, {body:'Preserved text'},own.map(f=>({id:f.id,role:f.role,size:f.size,sha256:f.sha256})),`2026-01-0${i+1}`]);}
 const manifest={schema:1,spaceId:s.S,approvalHash:'c'.repeat(64),ceilingBytes:6291473,revisions:[root,old,head],files:files.map(({id,size,chunks,sha256})=>({id,size,chunks,sha256}))};
 const storage=new SharedBankStorage({auth:s.auth(s.A),fetchImpl:s.fetch}),plan=()=>P.dryRun(storage,manifest),rpc=(name,body)=>storage.rpc(name,body);
 const raw=async(q,args=[])=>{await s.db.exec('reset role');return s.db.query(q,args);};
 return{...s,q,root,old,head,files,manifest,storage,plan,rpc,raw};
}
test('payload retirement keeps lineage/source/shared files, resumes partial removal and lost finish response',async t=>{
 const f=await fixture(t),shared=f.files[3];
 await f.raw('insert into bank_revision_files values($1,$2)',[f.head,shared.id]);
 const p=await f.plan();assert.deepEqual(p.revisions,[f.old]);assert.deepEqual(p.files.map(x=>x.id).sort(),f.files.slice(1,3).map(x=>x.id).sort());assert.equal(p.bytes,6291462);
 assert(p.excluded.some(x=>x.reason==='original_root'));assert(p.excluded.some(x=>x.reason==='current_head'));
 const jobId=crypto.randomUUID(),args={s:f.S,j:jobId,manifest:f.manifest,expected_token:p.token};
 assert.equal((await f.rpc('bank_revision_prune_status',{s:f.S,j:jobId})).exists,false);
 const claim=await f.rpc('bank_revision_prune_claim',args);assert.equal(claim.complete,false);
 const denied=await f.auth(f.B).request('/storage/v1/object/question-bank',{method:'DELETE',body:{prefixes:claim.files[0].objectNames}});assert.deepEqual(denied,[]);
 await f.raw('insert into bank_revisions(id,question_id,parent_id,actor_id) values($1,$2,$3,$4)',[crypto.randomUUID(),f.q,f.head,f.A]);
 await assert.rejects(f.rpc('bank_revision_prune_finish',{s:f.S,j:jobId,expected_token:p.token}),/incomplete/);
 await assert.rejects(f.raw('insert into bank_revision_files values($1,$2)',[f.head,f.files[2].id]),/frozen/);
 await assert.rejects(f.raw('insert into bank_revisions(id,question_id,parent_id,actor_id) values($1,$2,$3,$4)',[crypto.randomUUID(),f.q,f.old,f.A]),/frozen/);
 await assert.rejects(f.raw("insert into storage.objects(bucket_id,name,metadata) values('question-bank',$1,'{}')",[claim.files[0].objectNames[0]]),/frozen/);
 await assert.rejects(f.raw('insert into bank_exam_drafts(id,space_id,owner_id,title,document) values($1,$2,$3,$4,$5)',[crypto.randomUUID(),f.S,f.B,'Other teacher',{items:[{questionId:f.q,revisionId:f.old}]}]),/frozen/);
 await assert.rejects(f.raw('update bank_catalog set metadata=$1 where revision_id=$2',[{nested:{prior:[f.old]}},f.head]),/frozen/);
 await assert.rejects(f.raw('insert into bank_scope_evidence(revision_id,evidence,reviewer_id) values($1,$2,$3)',[f.old,{},f.A]),/frozen/);
 const auth=f.storage.auth,request=auth.request.bind(auth),checkpoints=[];let partial=true,lost=true,lostClaim=true;
 auth.request=async(route,opt)=>{
  if(route.includes('/storage/')&&partial){partial=false;await request(route,{...opt,body:{prefixes:opt.body.prefixes.slice(0,1)}});throw Error('Partial Storage failure');}
  const r=await request(route,opt);if(route.endsWith('bank_revision_prune_claim')&&lostClaim){lostClaim=false;throw Error('Lost claim response');}if(route.endsWith('bank_revision_prune_finish')&&lost){lost=false;throw Error('Lost completed response');}return r;
 };
 const run=()=>P.execute(f.storage,{manifest:f.manifest,jobId,expectedToken:p.token,saveCheckpoint:async x=>checkpoints.push(x)});
 await assert.rejects(run(),/Lost claim/);await assert.rejects(run(),/Partial/);assert.equal((await f.rpc('bank_revision_prune_claim',args)).resuming,true);
 await assert.rejects(run(),/Lost/);const result=await run();assert.equal(result.complete,true);assert.equal(result.replayed,true);
 assert.equal((await f.rpc('bank_revision_prune_status',{s:f.S,j:jobId})).complete,true);
 const r=await f.raw('select id,parent_id from bank_revisions where question_id=$1 order by created_at',[f.q]);assert.equal(r.rows.length,4);assert.equal(r.rows[2].parent_id,f.old);
 assert.equal((await f.raw('select count(*) n from bank_catalog where revision_id=$1',[f.old])).rows[0].n,0);
 assert.equal((await f.raw('select count(*) n from bank_revision_prune_marks where revision_id=$1',[f.old])).rows[0].n,1);
 assert.equal((await f.raw("select count(*) n from bank_audit where action='revision_payload_prune'")).rows[0].n,1);
 for(const kept of [f.files[0],shared,f.files[4],f.files[5]])assert.equal((await f.raw('select count(*) n from bank_entries where id=$1',[kept.id])).rows[0].n,1);
 assert(checkpoints.some(x=>x.phase==='storage'));assert.equal(await f.rpc('bank_read_revision',{r:f.old}),true);assert.equal(await f.rpc('bank_read_revision',{r:f.head}),true);
 const visible=(await f.storage.rows('bank_revisions','question_id=eq.'+f.q)).filter(r=>r.committed),parents=new Set(visible.map(r=>r.parent_id));
 assert.deepEqual(visible.filter(r=>!parents.has(r.id)).map(r=>r.id),[f.head],'Retirement must not create phantom heads in the existing upload/maintenance path');
});
test('all-owner current/history pins, maintenance, incomplete base and review evidence protect payloads',async t=>{
 const f=await fixture(t),exam=crypto.randomUUID();
 await f.raw('insert into bank_exam_drafts(id,space_id,owner_id,title,document) values($1,$2,$3,$4,$5)',[exam,f.S,f.B,'Foreign exam',{items:[{questionId:f.q,revisionId:f.old}]}]);
 assert.equal((await f.plan()).files.length,0);
 await f.raw('insert into bank_exam_history(exam_id,version,actor_id,document) values($1,1,$2,$3)',[exam,f.B,{items:[{questionId:f.q,revisionId:f.old}]}]);
 await f.raw('update bank_exam_drafts set document=$1 where id=$2',[{items:[]},exam]);assert.equal((await f.plan()).files.length,0);
 await f.raw('delete from bank_exam_history where exam_id=$1',[exam]);assert((await f.plan()).files.length>0);
 const incomplete=crypto.randomUUID();await f.raw('insert into bank_revisions(id,question_id,parent_id,actor_id) values($1,$2,$3,$4)',[incomplete,f.q,f.old,f.A]);assert((await f.plan()).excluded.some(x=>x.reason==='incomplete_base'));await f.raw('delete from bank_revisions where id=$1',[incomplete]);
 const job=crypto.randomUUID();await f.raw('insert into bank_maintenance_jobs(id,space_id,actor_id,spec) values($1,$2,$3,$4)',[job,f.S,f.A,{}]);await f.raw('insert into bank_maintenance_items(job_id,question_id,base_id,result_id,review_version) values($1,$2,$3,$4,0)',[job,f.q,f.old,crypto.randomUUID()]);assert((await f.plan()).excluded.some(x=>x.reason==='maintenance'));await f.raw('delete from bank_maintenance_items where job_id=$1',[job]);
 await f.raw('insert into bank_scope_evidence(revision_id,evidence,reviewer_id) values($1,$2,$3)',[f.old,{},f.A]);assert((await f.plan()).excluded.some(x=>x.reason==='review_or_evidence'));
});
test('stale CAS, ordinary teachers, inventory drift and manifest tampering fail before deletion',async t=>{
 const f=await fixture(t),p=await f.plan();
 await assert.rejects(new SharedBankStorage({auth:f.auth(f.B)}).rpc('bank_revision_prune_plan',{s:f.S,manifest:f.manifest}),/privilege|permission/);
 await assert.rejects(new SharedBankStorage({auth:f.auth(f.X)}).rpc('bank_revision_prune_plan',{s:f.S,manifest:f.manifest}),/privilege|permission/);
 await f.raw('update bank_catalog set confirmed=$1 where revision_id=$2',[{updated:true},f.head]);
 await assert.rejects(f.rpc('bank_revision_prune_claim',{s:f.S,j:crypto.randomUUID(),manifest:f.manifest,expected_token:p.token}),/References changed/);
 const m=structuredClone(f.manifest);m.files[1].size++;await assert.rejects(P.dryRun(f.storage,m),/Approved file changed/);
 await f.raw("update storage.objects set metadata='{}' where name=$1",[`${f.S}/${f.files[1].id}/000`]);await assert.rejects(f.plan(),/inventory/);
 assert.equal((await f.raw('select count(*) n from bank_revision_prunes')).rows[0].n,0);
});
test('preserved approved manifest is validated exactly and creates no remote action',()=>{
 const file=path.join(__dirname,'../tmp/approved-history-cleanup-20261003/approved-manifest.json');
 const m=P.approvedEnvelope(file,'a3af55dfa6044574a3e6e9df26efd420b91aac8891927ad8982aaecfb82f4955');
 assert.equal(m.files.length,966);assert.equal(m.revisions.length,193);assert.equal(m.ceilingBytes,282139576);
 assert.throws(()=>P.approvedEnvelope(file,'d'.repeat(64)),/hash mismatch/);
});
