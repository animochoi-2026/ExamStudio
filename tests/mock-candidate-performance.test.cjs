const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID:id}=require('node:crypto');
const {groupFixture}=require('./group-operations-fixture.cjs');
test('optimized mock snapshots preserve legacy visibility, latest revision, grade, school and conflict semantics',async t=>{
 const x=await groupFixture();t.after(()=>x.close());const {db,A,B,X,S,rpc}=x;
 const seed=async({q=id(),actor=A,visibility='approved',committed=true,archived=false,grade='중2',school='검증중',parent=null,created='2026-01-01'}={})=>{
  await db.exec('reset role');const r=id(),f=id();
  await db.query("insert into bank_questions(id,space_id,owner_id,owner_email,archived) values($1,$2,$3,'animochoi@gmail.com',$4) on conflict do nothing",[q,S,A,archived]);
  await db.query('insert into bank_revisions(id,question_id,actor_id,committed,visibility,parent_id) values($1,$2,$3,$4,$5,$6)',[r,q,actor,committed,visibility,parent]);
  await db.query("insert into bank_entries(id,space_id,name,kind,owner_id) values($1,$2,'fixture','file',$3)",[f,S,A]);
  await db.query("insert into bank_catalog(revision_id,space_id,question_id,commit_id,metadata,content,files,created_at) values($1,$2,$3,$4,$5,'{}','[]',$6)",[r,S,q,f,{source:{kind:'학교기출',school,grade}},created]);return {q,r};
 };
 const visible=await seed();await seed({q:visible.q,parent:visible.r,created:'2026-02-01'});
 const fork=await seed();await seed({q:fork.q,created:'2026-03-01'});
 await seed({visibility:'private'});await seed({visibility:'shared_pending'});await seed({committed:false});await seed({archived:true});await seed({grade:'중3'});await seed({school:'다른중'});
 // A newer revision changing grade must not resurrect the previous grade.
 const moved=await seed();await seed({q:moved.q,parent:moved.r,grade:'중3',created:'2026-03-01'});
 await db.query("select set_config('request.headers','{\"x-exam-grade\":\"m2\"}',false)");
 const read=async()=>{const result=[];for(const u of [A,B])for(const schools of [null,['검증중'],['없는중']]){const v=await rpc(u,'bank_mock_candidates',{s:S,current_exam:null,schools});delete v.id;delete v.at;result.push(v);}return result;};
 const optimized=await read();assert(optimized[0].candidates.some(c=>c.question_id===fork.q&&c.revision_conflict));assert(!optimized[0].candidates.some(c=>c.question_id===moved.q));assert(optimized[0].candidates.length>optimized[3].candidates.length);
 await assert.rejects(()=>rpc(X,'bank_mock_candidates',{s:S,current_exam:null,schools:null}));
 await db.exec('reset role');const legacy=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261012154552_grade_workspaces.sql'),'utf8');
 for(const name of ['bank_mock_snapshot','bank_mock_recommendation_snapshot']){const start=legacy.indexOf('CREATE OR REPLACE FUNCTION public.'+name+'('),end=legacy.indexOf('end $function$',start)+'end $function$'.length;assert(start>=0&&end>start);await db.exec(legacy.slice(start,end).replace('FUNCTION public.','FUNCTION bank_ops.')+';');}
 assert.deepEqual(await read(),optimized);
});
