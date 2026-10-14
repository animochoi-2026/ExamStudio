const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID:id}=require('crypto');
const {groupFixture}=require('./group-operations-fixture.cjs');
test('PDF slots replace atomically, isolate owners, preserve originals and collect expired files',async t=>{
 const x=await groupFixture();t.after(()=>x.close());const {db,A,B,S,rpc}=x,q=id(),r=id(),f=id(),e=id();await db.exec('reset role');
 await db.query("insert into bank_questions(id,space_id,owner_id,owner_email) values($1,$2,$3,'animochoi@gmail.com')",[q,S,A]);
 await db.query("insert into bank_revisions(id,question_id,actor_id,committed,visibility) values($1,$2,$3,true,'approved')",[r,q,A]);
 await db.query("insert into bank_entries(id,space_id,name,kind,owner_id) values($1,$2,'test','file',$3)",[f,S,A]);
 await db.query("insert into bank_catalog(revision_id,space_id,question_id,commit_id,metadata,content,files) values($1,$2,$3,$4,$5,'{}','[]')",[r,S,q,f,{source:{documentId:'source',academicYear:2025,school:'검증중',grade:'중2'}}]);
 let doc={id:e,title:'PDF 검증',kind:'past-paper-print',status:'completed',answerMode:'quick',rules:{units:['m2-6.1']},pastPrint:{from:2025,to:2025,sourceIds:['source'],schoolNames:['검증중']},items:[{questionId:q,revisionId:r,sourceId:'source',year:2025,index:0}]};
 let version=(await rpc(A,'bank_exam_save',{s:S,e,expected:0,doc})).version;
 const ticket=async()=>{const requestId=id();await rpc(A,'bank_download_begin',{s:S,request_id:requestId,fmt:'pdf',revisions:[r],request_kind:'exam',paper_id:e});return requestId;};
 let requestId=await ticket();
 const service=async(operation,extra={},actor=A)=>{await db.exec('reset role;set role service_role');return (await db.query('select bank_native_pdf_service($1,$2) v',[actor,{operation,spaceId:S,paperId:e,kind:'exam',engine:'chromium-vector-v2-noto-1',part:'questions',version,requestId,...extra}])).rows[0].v;};
 await x.actor(A);await assert.rejects(()=>db.query('select bank_native_pdf_service($1,$2)',[A,{}]),/permission denied/);
 await db.exec('reset role;set role anon');await assert.rejects(()=>db.query('select bank_native_pdf_service($1,$2)',[A,{}]),/permission denied/);
 await assert.rejects(()=>service('claim',{},B));
 const first=await service('claim');assert.equal(first.hit,false);assert(first.key.includes('/native-pdf/'));assert.equal((await service('claim')).busy,true);
 await service('upload',{key:first.key});await service('commit',{key:first.key,sha256:'a'.repeat(64),bytes:123});assert.equal((await service('read')).key,first.key);
 doc={...doc,answerMode:'detailed'};version=(await rpc(A,'bank_exam_save',{s:S,e,expected:version,doc})).version;requestId=await ticket();assert.equal((await service('claim')).key,first.key);
 const answer=await service('claim',{part:'answers'});await service('commit',{part:'answers',key:answer.key,sha256:'b'.repeat(64),bytes:145});
 doc={...doc,title:'수정 PDF'};version=(await rpc(A,'bank_exam_save',{s:S,e,expected:version,doc})).version;requestId=await ticket();const failed=await service('claim');assert.equal(failed.hit,false);await service('abort',{key:failed.key});await db.exec('reset role');assert.equal((await db.query('select active_key from bank_ops.native_pdf_slots where parent_id=$1 and part=$2',[e,'questions'])).rows[0].active_key,first.key);
 const next=await service('claim');const oldVersion=version;doc={...doc,bodyFontSize:11};version=(await rpc(A,'bank_exam_save',{s:S,e,expected:version,doc})).version;
 await assert.rejects(()=>service('commit',{key:next.key,version:oldVersion,sha256:'c'.repeat(64),bytes:100}),/수정/);await service('abort',{key:next.key});requestId=await ticket();
 const final=await service('claim');assert.equal((await service('commit',{key:final.key,sha256:'d'.repeat(64),bytes:200})).obsolete,first.key);
 await db.exec('reset role');const secret=(await db.query('select secret from bank_ops.pdf_cleanup_config')).rows[0].secret;
 const garbage=await service('gc',{secret});assert(garbage.includes(first.key));assert(!garbage.includes(final.key));await service('gc_done',{key:first.key});await service('gc_done',{key:first.key});
 await db.exec('reset role');await db.query("update bank_catalog set content=$2 where revision_id=$1",[r,{body:'원본 보정'}]);assert.equal((await service('claim')).hit,false);
 await db.exec('reset role');await db.exec('alter table bank_exam_drafts disable trigger paper_lifetime');await db.query("update bank_exam_drafts set expires_at=now()-interval '1 second' where id=$1",[e]);await db.query('select bank_ops.expire_papers()');
 assert((await service('gc',{secret})).includes(final.key));await service('gc_done',{key:final.key});await assert.rejects(()=>service('claim'));
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from bank_questions where id=$1',[q])).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int n from bank_ops.native_pdf_slots where parent_id=$1',[e])).rows[0].n,0);
});

test('group PDF access rechecks membership, separates user watermarks and releases deleted parents',async t=>{
 const x=await groupFixture();t.after(()=>x.close());const {db,A,B,S,rpc}=x,call=(u,n,a={})=>rpc(u,n,{s:S,...a});
 const g=await call(A,'bank_group_save',{g:null,group_name:'출력 그룹'}),other=await call(A,'bank_group_save',{g:null,group_name:'다른 그룹'});
 await call(A,'bank_group_assign',{target_user:A,g});await call(A,'bank_group_assign',{target_user:B,g});
 const q=id(),r=id(),f=id();await db.exec('reset role');
 await db.query("insert into bank_questions(id,space_id,owner_id,owner_email) values($1,$2,$3,'animochoi@gmail.com')",[q,S,A]);
 await db.query("insert into bank_revisions(id,question_id,actor_id,committed,visibility) values($1,$2,$3,true,'approved')",[r,q,A]);
 await db.query("insert into bank_entries(id,space_id,name,kind,owner_id) values($1,$2,'test','file',$3)",[f,S,A]);
 await db.query("insert into bank_catalog(revision_id,space_id,question_id,commit_id,metadata,content,files) values($1,$2,$3,$4,$5,'{}','[]')",[r,S,q,f,{source:{school:'검증중',grade:'중2'}}]);
 const e=id(),v=id(),doc={schema:1,id:e,title:'공유 출력 검증',version:0,variants:[{id:v,kind:'A',paper:{title:'공유 시험지',items:[{questionId:q,revisionId:r}]}}]};
 await call(A,'bank_mock_save',{e,expected:0,doc});
 const ticket=async u=>{const requestId=id();await call(u,'bank_download_begin',{request_id:requestId,fmt:'pdf',revisions:[r],request_kind:'mock',paper_id:e});return requestId;};
 const service=async(u,requestId,operation,extra={})=>{await db.exec('reset role;set role service_role');return (await db.query('select bank_native_pdf_service($1,$2) v',[u,{engine:'chromium-vector-v2-noto-1',spaceId:S,paperId:e,version:1,variant:v,part:'questions',kind:'mock',operation,requestId,...extra}])).rows[0].v;};
 const ta=await ticket(A),tb=await ticket(B),a=await service(A,ta,'claim'),b=await service(B,tb,'claim');assert.notEqual(a.key,b.key);
 const ra=await service(A,ta,'render',{key:a.key}),rb=await service(B,tb,'render',{key:b.key});assert.notEqual(ra.identity,rb.identity);
 await assert.rejects(()=>service(B,tb,'render',{key:b.key}),/생성 중/);
 await service(A,ta,'commit',{key:a.key,sha256:'a'.repeat(64),bytes:100});await service(B,tb,'commit',{key:b.key,sha256:'b'.repeat(64),bytes:100});
 await call(A,'bank_group_assign',{target_user:B,g:other});await assert.rejects(()=>service(B,tb,'read'));
 await call(A,'bank_group_assign',{target_user:B,g});assert.equal((await service(B,tb,'read')).key,b.key);
 await call(A,'bank_mock_delete',{e,expected:1,title_confirmation:doc.title});await assert.rejects(()=>service(B,tb,'read'));
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from bank_ops.native_pdf_slots where parent_id=$1',[e])).rows[0].n,0);assert.equal((await db.query("select count(*)::int n from bank_ops.native_pdf_objects where key=any($1) and state='garbage'",[[a.key,b.key]])).rows[0].n,2);
});


