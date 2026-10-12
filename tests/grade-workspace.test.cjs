const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
const title=require('../web-bank/automatic-exam-title.cjs');
test('automatic titles identify source exams and preserve deliberate names',()=>{
 const rows=[{metadata:{source:{school:'경원중',academicYear:'2025',grade:'중2',semester:'2학기',exam:'중간고사'}}}];
 const draft={title:'',autoTitle:true};assert.equal(title.applyAutomaticTitle(draft,rows),'경원중 2025학년도 중2 2학기 중간고사 수학');
 draft.title='특강 3회';draft.autoTitle=false;assert.equal(title.applyAutomaticTitle(draft,rows),'특강 3회');
 draft.title=' ';assert.equal(title.applyAutomaticTitle(draft,rows),'경원중 2025학년도 중2 2학기 중간고사 수학');
});
test('grade changes isolate draft keys and reject in-flight network responses',async()=>{
 const G=await import('../web-bank/grade-workspace.js');G.setGrade('m2');let finish;
 const fetch=G.gradeFetch(async(_,init)=>{assert.equal(init.headers.get('x-exam-grade'),'m2');return new Promise(r=>finish=r);});
 const request=fetch('https://example.test/rest/v1/rpc/test');const key=G.workspaceKey('draft');G.setGrade('m1');assert.notEqual(G.workspaceKey('draft'),key);finish(new Response('{}'));await assert.rejects(request,/학년이 변경/);
 for(const path of ['/functions/v1/bank-storage','/auth/v1/token','/storage/v1/object/test'])await G.gradeFetch(async(_,init)=>{assert.equal(init.headers.has('x-exam-grade'),false);return new Response('{}');})('https://example.test'+path);
 G.setGrade('');assert.equal(G.workspaceKey('draft'),'draft');
});
test('candidate requests are restricted to explicit schools, never full-bank pages',async()=>{
 const {loadCompositionCandidates}=await import('../web-bank/composition-summary.js');let calls=0;
 const rpc=async(name,args)=>{calls++;assert.equal(name,'bank_exam_candidates');assert.deepEqual(args.schools,['학교A']);return [1,2];};
 assert.deepEqual(await loadCompositionCandidates(rpc,'s'),[]);assert.equal(calls,0);
 assert.deepEqual(await loadCompositionCandidates(rpc,'s',{schools:['학교A']}),[1,2]);assert.equal(calls,1);
});
test('legacy drafts copy only to their matching grade without losing originals',async()=>{
 const G=await import('../web-bank/grade-workspace.js'),values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
 const original=JSON.stringify({rules:{units:['m2-1.1','m2-2.1']}});storage.setItem('draft',original);
 G.setGrade('m1');assert.equal(G.workspaceStored(storage,'draft'),null);
 G.setGrade('m2');assert.equal(G.workspaceStored(storage,'draft'),original);assert.equal(storage.getItem('draft'),original);
 storage.setItem(G.workspaceKey('draft'),'saved');assert.equal(G.workspaceStored(storage,'draft'),'saved');G.setGrade('');
});
test('server scopes search, candidates, home, sources, review and saved documents without affecting global summary',async()=>{
 const db=new PGlite(),id=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`,space=id(99);
 try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema bank_query;create schema bank_summary;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function bank_member(s uuid) returns boolean language sql as $$select auth.uid() is not null$$;
 create function bank_read_revision(r uuid) returns boolean language sql as $$select auth.uid() is not null and r<>'${id(999)}'::uuid$$;
 create function bank_type_matches(m jsonb,f jsonb,t text) returns boolean language sql as $$select true$$;
 create table bank_questions(id uuid,archived boolean,owner_email text);
 create table bank_revisions(id uuid,question_id uuid,parent_id uuid,committed boolean,visibility text,review_version int);
 create table bank_entries(id uuid,props jsonb);
 create table bank_catalog(revision_id uuid,question_id uuid,space_id uuid,commit_id uuid,metadata jsonb,confirmed jsonb,content jsonb,files jsonb,created_at timestamptz);
 create table bank_exam_drafts(id uuid,title text,space_id uuid,owner_id uuid,document jsonb,version int,created_at timestamptz,updated_at timestamptz,archived_at timestamptz);
 create table bank_mock_exams(like bank_exam_drafts);
 create table bank_summary.source_fixture(space_id uuid,source_id text,value jsonb,updated_at timestamptz);
 create table bank_summary.originals(space_id uuid,audience uuid,question_id uuid,fact jsonb);
 create table bank_summary.statistics(space_id uuid,audience uuid,kind text,key jsonb,value jsonb);
 create table bank_summary.buckets(space_id uuid,audience uuid,kind text,key jsonb,n int);
 create function bank_summary.assert_ready(s uuid) returns void language plpgsql as $$begin if public.bank_member(s) is not true then raise insufficient_privilege;end if;end$$;
 create function bank_summary.effective_sources(s uuid,u uuid) returns setof bank_summary.source_fixture language sql as $$select * from bank_summary.source_fixture where space_id=s$$;
 create function bank_summary.source_value(s uuid,v jsonb) returns jsonb language sql as $$select v$$;
 create function bank_summary.home_value(s uuid,u uuid) returns jsonb language sql as $$select '{"dashboard":{"questions":8},"recentSources":[]}'::jsonb$$;
 create function bank_summary.row_difficulty(r uuid,m jsonb,f jsonb) returns jsonb language sql as $$select jsonb_build_object('score',coalesce(f->'difficulty',m#>'{difficulty,userScore}'),'band','보통')$$;`);
 await db.exec(fs.readFileSync('supabase/migrations/20261012154552_grade_workspaces.sql','utf8'));
 for(let n=1;n<=8;n++){
 const grade=n<=3?'중1':'중2',school=n%2?'학교A':'학교B',meta={source:{school,grade,documentId:'source'+grade,kind:'학교기출'},difficulty:{userScore:5}};
 await db.query('insert into bank_questions values($1,$2,$3)',[id(n),n===7,'teacher']);await db.query('insert into bank_revisions values($1,$2,null,$3,$4,1)',[n===8?id(999):id(n+100),id(n),n!==6,n===1?'shared_pending':'approved']);
 await db.query('insert into bank_catalog values($1,$2,$3,$4,$5,$6,$7,$8,now())',[n===8?id(999):id(n+100),id(n),space,id(n+200),meta,n===3?{difficulty:9}:{},{body:'question',solution:'PRIVATE'},[]]);
 await db.query('insert into bank_entries values($1,$2)',[id(n+200),{}]);
 }
 for(const [grade,num]of [['중1',1],['중2',2]])await db.query('insert into bank_summary.source_fixture values($1,$2,$3,now())',[space,'source'+grade,{source_id:'source'+grade,source:{grade,school:'학교A'},question_count:num}]);
 await db.exec(`select set_config('request.jwt.claim.sub','${id(1)}',false);select set_config('request.headers','{"x-exam-grade":"m1"}',false);set role authenticated;`);
 const call=async(sql,args=[space])=>(await db.query(sql,args)).rows[0].v;
 const a=await call("select bank_exam_candidates($1,'[\"학교A\"]') v");assert.equal(a.length,2);assert(a.every(c=>c.metadata.source.grade==='중1'));assert(!JSON.stringify(a).includes('PRIVATE'));
 const home=await call('select bank_home_summary($1) v');assert.equal(home.dashboard.questions,3);assert.equal(home.dashboard.pending,1);assert.equal(home.dashboard.difficulty.killerCount,1);assert.equal(home.dashboard.difficulty.counts.middle,2);assert.equal(home.dashboard.sourceExams,1);
 assert.equal((await call("select bank_search_current($1,'{}',0) v")).length,3);assert.equal((await call('select bank_source_exams($1,0) v')).length,1);assert.equal((await call('select bank_school_sources($1) v')).length,1);
 await db.exec("select set_config('request.headers','{\"x-exam-grade\":\"m2\"}',false)");assert.equal((await call('select bank_home_summary($1) v')).dashboard.questions,2);
 await db.exec("select set_config('request.headers','{\"x-exam-grade\":\"h3\"}',false)");assert.equal((await call('select bank_home_summary($1) v')).dashboard.questions,0);
 await db.exec("select set_config('request.headers','{}',false)");assert.equal((await call('select bank_home_summary($1) v')).dashboard.questions,8);
 await db.exec('reset role');await db.query('insert into bank_exam_drafts values($1,$2,$3,$4,$5,1,now(),now(),null)',[id(501),'old paper',space,id(1),{items:[{revisionId:id(101)}]}]);
 await db.query('insert into bank_exam_drafts values($1,$2,$3,$4,$5,1,now(),now(),null)',[id(502),'new paper',space,id(1),{workspaceGrade:'m2',items:[]}]);
 await db.exec("set role authenticated;select set_config('request.headers','{\"x-exam-grade\":\"m1\"}',false)");assert.equal((await call('select bank_exam_list($1,0) v'))[0].title,'old paper');
 assert.equal((await call('select bank_exam_get($1,$2) v',[space,id(501)])).title,'old paper');
 await assert.rejects(call('select bank_exam_get($1,$2) v',[space,id(502)]));
 await db.exec("select set_config('request.headers','{\"x-exam-grade\":\"m2\"}',false)");assert.equal((await call('select bank_exam_list($1,0) v'))[0].title,'new paper');
 await assert.rejects(call('select bank_exam_get($1,$2) v',[space,id(501)]));
 // Changing a current revision's grade must not resurrect an older revision.
 await db.exec('reset role');
 await db.query('insert into bank_revisions values($1,$2,$3,true,$4,1)',[id(301),id(1),id(101),'approved']);
 await db.query("insert into bank_catalog select $1,question_id,space_id,commit_id,jsonb_set(metadata,'{source,grade}','\"중2\"'),confirmed,content,files,created_at+interval '1 day' from bank_catalog where revision_id=$2",[id(301),id(101)]);
 await db.exec("set role authenticated;select set_config('request.headers','{\"x-exam-grade\":\"m1\"}',false)");
 assert.equal((await call('select bank_search_current($1) v')).length,2);
 await db.exec("select set_config('request.headers','{\"x-exam-grade\":\"INVALID\"}',false)");await assert.rejects(call('select bank_home_summary($1) v'));
 await db.exec('reset role;set role anon');await assert.rejects(call("select bank_exam_candidates($1,'[\"학교A\"]') v"));
 }finally{await db.close();}
});
