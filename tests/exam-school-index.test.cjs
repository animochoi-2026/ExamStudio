const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
test('school index coalesces reads, caches success, retries rejection and preserves grouping',async()=>{
 const {schoolIndexLoader}=await import('../web-bank/exam-scope-schools.js');let calls=0,fail=true;
 const load=schoolIndexLoader(async(name,args)=>{assert.equal(name,'bank_exam_school_index');assert.equal(args.s,'space');calls++;await new Promise(r=>setTimeout(r,10));if(fail)throw Error('TimeoutError');return [{source_id:'a',question_id:1},{source_id:'b',question_id:2},{source_id:'a',question_id:3}];},'space');
 await assert.rejects(Promise.all([load(),load()]),/TimeoutError/);assert.equal(calls,1);fail=false;
 const [a,b]=await Promise.all([load(),load()]);assert.equal(a,b);assert.equal(calls,2);assert.deepEqual(a.get('a').map(x=>x.question_id),[1,3]);assert.equal(await load(),a);assert.equal(calls,2);
});
test('school index preserves latest visible originals and scope evidence without bodies or set calls',async()=>{
 const db=new PGlite(),id=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`,space=id(999);
 try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema bank_query;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function bank_member(s uuid) returns boolean language sql as $$select auth.uid()='${id(1)}'::uuid and s='${space}'::uuid$$;
 create table bank_entries(id uuid primary key,props jsonb);
 create table bank_catalog(question_id uuid,revision_id uuid,commit_id uuid,space_id uuid,metadata jsonb,confirmed jsonb,files jsonb,content jsonb,created_at int,readable boolean,archived boolean,committed boolean);
 create function bank_query.latest(s uuid) returns setof bank_catalog language sql as $$select distinct on(question_id) * from public.bank_catalog where space_id=s and readable and not archived and committed order by question_id,created_at desc$$;`);
 await db.exec(fs.readFileSync('supabase/migrations/20261012141842_exam_school_index.sql','utf8'));
 const unit={id:'m2-6.3'},metadata={source:{grade:'중2',documentId:'doc'},classification:{primaryUnit:unit,confirmed:{primaryUnit:unit},suggested:{primaryUnit:unit},privateAnalysis:'PRIVATE'}};
 for(let n=1;n<=7;n++){
  const m=structuredClone(metadata);if(n===2||n===3)delete m.source.documentId;if(n===4)m.relations={originalQuestionId:id(1)};
  await db.query('insert into bank_entries values($1,$2)',[id(n),{sourceId:n===2?'entry':null}]);
  await db.query('insert into bank_catalog values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[id(n),id(100+n),id(n),space,m,{primaryUnit:unit,scopeEvidence:{solutions:[{unitIds:['m2-6.3']}]}},[{role:'source',sourceId:'legacy',path:'PRIVATE'}],{body:'PRIVATE'},2,n!==5,n===6,n!==7]);
 }
 await db.exec(`insert into bank_catalog select question_id,'${id(200)}',commit_id,space_id,jsonb_set(metadata,'{source,documentId}','"old"'),confirmed,files,content,1,true,false,true from bank_catalog where question_id='${id(1)}';select set_config('request.jwt.claim.sub','${id(1)}',false);set role authenticated;`);
 const rows=(await db.query('select bank_exam_school_index($1) v',[space])).rows[0].v;
 assert.equal(rows.length,3);assert.deepEqual(rows.map(x=>x.source_id),['doc','entry','legacy']);assert(!JSON.stringify(rows).includes('PRIVATE'));assert(rows.every(x=>!x.files&&!x.content&&!x.revision_id));
 const {matchingSourceSchools}=await import('../web-bank/exam-scope-schools.js');const grouped=new Map(rows.map(x=>[x.source_id,[x]]));
 assert.equal(matchingSourceSchools(rows.map(x=>({source_id:x.source_id,source:{school:'검증중'}})),grouped,new Set(['m2-6.3']))[0].questionCount,3);
 await assert.rejects(db.query('select bank_exam_school_index($1)',[id(888)]));
 await db.exec("select set_config('request.jwt.claim.sub','',false)");await assert.rejects(db.query('select bank_exam_school_index($1)',[space]));
 await db.exec('reset role;set role anon');await assert.rejects(db.query('select bank_exam_school_index($1)',[space]));
 }finally{await db.close();}
});
