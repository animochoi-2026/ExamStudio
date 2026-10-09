'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {localServer}=require('./shared-bank-local-server.cjs');
test('phase 1: rating/review saves, irreversible deletion permissions and source identity in real SQL',async t=>{
 const x=await localServer();t.after(()=>x.close());const id=()=>crypto.randomUUID();
 const rpc=async(uid,name,args)=>{const r=await x.fetch('https://test-project.supabase.co/rest/v1/rpc/'+name,{method:'POST',headers:{Authorization:'Bearer '+uid},body:JSON.stringify(args)});return {status:r.status,data:await r.json()};};
 await rpc(x.A,'bank_join',{s:x.S});await rpc(x.A,'bank_invite',{s:x.S,email_address:'teacher-b@example.test',enabled_value:true});await rpc(x.B,'bank_join',{s:x.S});
 async function admin(query,args=[]){await x.db.exec('reset role');return x.db.query(query,args);}
 async function seed(source={},confirmed={}){
  const q=id(),r=id(),f=id();await admin("insert into bank_questions(id,space_id,owner_id,owner_email) values($1,$2,$3,'animochoi@gmail.com')",[q,x.S,x.A]);
  await admin("insert into bank_revisions(id,question_id,actor_id,committed,visibility) values($1,$2,$3,true,'shared_pending')",[r,q,x.A]);
  await admin("insert into bank_entries(id,space_id,name,kind,owner_id,verified,props) values($1,$2,'commit','file',$3,true,$4)",[f,x.S,x.A,{role:'commit',questionId:q}]);
  await admin("insert into bank_catalog(revision_id,space_id,question_id,commit_id,metadata,content,files,confirmed) values($1,$2,$3,$4,$5,'{}','[]',$6)",[r,x.S,q,f,{source,relations:{}},confirmed]);return {q,r,f};
 }
 const first=await seed({}, {difficulty:'8.5',sharingNote:'keep memo',sharingAllowed:false,unitId:'old-unit',typeId:'old-type'});
 await t.test('one rating save adopts only own sample, leaving directly confirmed values intact',async()=>{
  assert.equal((await rpc(x.A,'bank_set_visibility',{r:first.r,v:'private',reason:'retired feature'})).status,403);
  assert.equal((await rpc(x.B,'bank_rate_save',{r:first.r,value:4.2})).status,200);
  const ratings=await x.sql(x.B,'select * from bank_difficulty_ratings where revision_id=$1',[first.r]);assert.equal(ratings.rows[0].adopted,true);assert.equal(ratings.rows[0].user_id,x.B);
  assert.equal((await rpc(x.X,'bank_rate_save',{r:first.r,value:2})).status,403);
  assert.equal((await rpc(x.B,'bank_rate_save',{r:first.r,value:11})).status,400);
  assert.equal((await x.sql(x.B,'select confirmed from bank_catalog where revision_id=$1',[first.r])).rows[0].confirmed.difficulty,'8.5');
 });
 await t.test('single review save works after completion, protects removed fields and rejects stale/injected edits',async()=>{
  const preserved=await seed({}, {unitId:'old-unit',typeId:'old-type'});
  assert.equal((await rpc(x.B,'bank_review_save',{r:preserved.r,p:{},expected:0})).status,200);
  const unchanged=(await x.sql(x.B,'select confirmed from bank_catalog where revision_id=$1',[preserved.r])).rows[0].confirmed;
  assert.equal(unchanged.unitId,'old-unit');assert.equal(unchanged.typeId,'old-type');
  assert.equal((await rpc(x.B,'bank_review_save',{r:first.r,p:{},expected:null})).status,409);
  const patch={tags:['검수'],primaryUnit:'삼각형',type:'증명'};
  const saved=await rpc(x.B,'bank_review_save',{r:first.r,p:patch,expected:0});assert.equal(saved.status,200,JSON.stringify(saved));assert.equal(saved.data.version,1);
  const again=await rpc(x.B,'bank_review_save',{r:first.r,p:{...patch,tags:['수정']},expected:1});assert.equal(again.status,200);
  assert.equal((await rpc(x.A,'bank_review_save',{r:first.r,p:patch,expected:1})).status,409);
  assert.equal((await rpc(x.B,'bank_review_save',{r:first.r,p:{...patch,difficulty:0},expected:2})).status,400);
  const current=(await x.sql(x.B,'select confirmed from bank_catalog where revision_id=$1',[first.r])).rows[0].confirmed;
  assert.equal(current.difficulty,'8.5');assert.equal(current.sharingNote,'keep memo');assert.equal(current.sharingAllowed,false);assert.deepEqual(current.tags,['수정']);
 });
 const exam=id(),doc={id:exam,title:'확인할 시험지',items:[{questionId:first.q,revisionId:first.r,workspaceMm:0}],print:{paper:'A4',columns:2},answerMode:'quick'};
 await t.test('actual exam deletion is owner-only, title/CAS checked, removes history and blocks resurrection',async()=>{
  assert.equal((await rpc(x.B,'bank_exam_save',{s:x.S,e:exam,expected:0,doc})).status,200);
  assert.equal((await rpc(x.B,'bank_exam_delete',{s:x.S,e:exam,expected:null,title_confirmation:doc.title})).status,409);
  assert.equal((await rpc(x.A,'bank_exam_delete',{s:x.S,e:exam,expected:1,title_confirmation:doc.title})).status,403);
  assert.equal((await rpc(x.B,'bank_exam_delete',{s:x.S,e:exam,expected:1,title_confirmation:'wrong'})).status,409);
  const blocked=await rpc(x.A,'bank_question_delete_plan',{q:first.q});assert.equal(blocked.data.blocked,true);
  await rpc(x.B,'bank_exam_save',{s:x.S,e:exam,expected:1,doc:{...doc,items:[]}});
  assert.equal((await rpc(x.A,'bank_question_delete_plan',{q:first.q})).data.blocked,true,'old exam history is still a reference');
  assert.equal((await rpc(x.B,'bank_exam_delete',{s:x.S,e:exam,expected:2,title_confirmation:doc.title})).status,200);
  assert.equal((await x.sql(x.B,'select * from bank_exam_history where exam_id=$1',[exam])).rows.length,0);
  assert.equal((await rpc(x.B,'bank_exam_save',{s:x.S,e:exam,expected:0,doc})).status,409);
  assert.equal((await x.sql(x.A,'select * from bank_questions where id=$1',[first.q])).rows.length,1);
 });
 await t.test('question deletion preserves shared/source files, prevents new references, resumes and truly deletes rows',async()=>{
  const other=await seed(),source=id(),shared=id(),dedicated=id();
  for(const [f,role]of [[source,'source'],[shared,'asset'],[dedicated,'data']]){
   await admin("insert into bank_entries(id,space_id,name,kind,owner_id,verified,chunks,props) values($1,$2,'file','file',$3,true,1,$4)",[f,x.S,x.A,{role,questionId:first.q}]);
   await admin('insert into bank_revision_files values($1,$2)',[first.r,f]);await admin("insert into storage.objects(bucket_id,name) values('question-bank',$1)",[`${x.S}/${f}/000`]);
  }
  await admin('insert into bank_revision_files values($1,$2)',[other.r,shared]);
  assert.equal((await rpc(x.B,'bank_question_delete_plan',{q:first.q})).status,403);
  const plan=(await rpc(x.A,'bank_question_delete_plan',{q:first.q})).data;assert.equal(plan.blocked,false);
  for(const caller of [x.B,x.X]){
   const denied=await x.fetch('https://test-project.supabase.co/functions/v1/bank-delete-question',{method:'POST',headers:{Authorization:'Bearer '+caller},body:JSON.stringify({questionId:first.q,token:plan.token})});
   assert.equal(denied.status,400);assert.equal((await denied.json()).complete,false);
   assert.equal((await admin('select * from bank_questions where id=$1',[first.q])).rows.length,1);
   assert.equal((await admin('select * from storage.objects where name=$1',[`${x.S}/${dedicated}/000`])).rows.length,1);
  }
  assert.equal((await rpc(x.A,'bank_question_delete_claim',{q:first.q,expected_token:'stale'})).status,409);
  const claim=await rpc(x.A,'bank_question_delete_claim',{q:first.q,expected_token:plan.token});assert.equal(claim.status,200,JSON.stringify(claim));
  assert.deepEqual(claim.data.files.map(f=>f.id).sort(),[first.f,dedicated].sort());
  assert.equal((await rpc(x.A,'bank_question_delete_finish',{q:first.q,expected_token:plan.token})).status,400);
  const copyId=id();assert.equal((await rpc(x.B,'bank_exam_save',{s:x.S,e:copyId,expected:0,doc:{...doc,id:copyId}})).status,409);
  assert.equal((await rpc(x.A,'bank_begin_revision',{s:x.S,q:first.q,r:id(),p:first.r})).status,409);
  assert.equal((await x.sql(x.B,'delete from storage.objects where name=$1 returning name',[`${x.S}/${dedicated}/000`])).rows.length,0);
  assert.equal((await x.sql(x.A,'delete from storage.objects where name=$1 returning name',[`${x.S}/${source}/000`])).rows.length,0);
  assert.equal((await x.sql(x.A,'delete from storage.objects where name=$1 returning name',[`${x.S}/${dedicated}/000`])).rows.length,1);
  const resume=await rpc(x.A,'bank_question_delete_claim',{q:first.q,expected_token:plan.token});assert.deepEqual(resume.data.files,claim.data.files);
  const completed=await x.fetch('https://test-project.supabase.co/functions/v1/bank-delete-question',{method:'POST',headers:{Authorization:'Bearer '+x.A},body:JSON.stringify({questionId:first.q,token:plan.token})});assert.equal(completed.status,200);assert.equal((await completed.json()).complete,true);
  assert.equal((await admin('select * from bank_questions where id=$1',[first.q])).rows.length,0);
  assert.equal((await admin('select * from bank_catalog where question_id=$1',[first.q])).rows.length,0);
  assert.equal((await admin('select * from bank_entries where id=any($1)',[[source,shared]])).rows.length,2);
  assert.equal((await rpc(x.A,'bank_begin_revision',{s:x.S,q:first.q,r:id(),p:null})).status,409);
 });
 await t.test('printed source identity excludes work order and partial recognition cannot replace exam total',async()=>{
  const documentId=id(),source={kind:'학교기출',school:'검증중',grade:'중2',academicYear:'2026',semester:'2학기',exam:'중간고사',documentId,originalNumber:'5',originalOrder:1,numbering:{section:'objective',total:25,objectiveCount:25,writtenCount:0,evidence:'시험지에 인쇄된 전체 수',confirmed:true}};
  const original=await seed(source);
  const candidates=await rpc(x.A,'bank_source_candidates',{s:x.S,source});assert.equal(candidates.data[0].question_id,original.q);
  await assert.rejects(seed({...source,originalOrder:17}),/같은 원본 번호/);
  await seed({...source,originalNumber:'6',numbering:{...source.numbering,total:1,objectiveCount:1}});
  const progress=await rpc(x.A,'bank_source_progress_get',{s:x.S,k:documentId});assert.equal(progress.data.expected_count,25);
  const written=await seed({...source,originalNumber:'서답형 5',numbering:{...source.numbering,section:'written'}});assert.notEqual(written.q,original.q);
 });
});
