const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID:id}=require('crypto');
const {groupFixture}=require('./group-operations-fixture.cjs');
// These are newly inserted catalog rows. Supply the current writer contract;
// the filter, teacher-score and group/privacy assertions below stay unchanged.
function evaluatedDifficulty(score=null){return {v121Latest:{record:{...require('../app/difficulty-v121/desktop-policy.cjs').versions,
 final_status:score===null?'failed':'complete',final_stage:3,final_model:'gpt-6.1-sol',final_reasoning_effort:'high',final_score:score,final_tier:score===null?null:'T2',stage3_validation_result:{valid:true,solution_validated:true}}}};}
test('actual paged search maps composition codes to final scores, including empty bands',async t=>{
 const x=await groupFixture();t.after(()=>x.close());const {db,rpc,A,S}=x;
 const check=async(band,n)=>{const v=await rpc(A,'bank_search_page',{s:S,filters:{compositionBand:band}});assert.equal(v.total,n);return v;};
 await check('low',0);
 const scores=[null,1,3,3.5,7.5,8,8.5,9,10];await db.exec('reset role');
 for(const score of scores){const q=id(),r=id(),f=id();await db.query("insert into bank_questions(id,space_id,owner_id,owner_email) values($1,$2,$3,'animochoi@gmail.com')",[q,S,A]);await db.query("insert into bank_revisions(id,question_id,actor_id,committed,visibility) values($1,$2,$3,true,'approved')",[r,q,A]);await db.query("insert into bank_entries(id,space_id,name,kind,owner_id) values($1,$2,'filter','file',$3)",[f,S,A]);await db.query("insert into bank_catalog(revision_id,space_id,question_id,commit_id,metadata,confirmed,content,files) values($1,$2,$3,$4,$5,$6,'{}','[]')",[r,S,q,f,{difficulty:evaluatedDifficulty(score),source:{kind:'학교기출',school:'검증중',grade:'중2'}},{difficulty:score}]);}
 for(const [band,expected]of [['low',[1,3]],['middle',[3.5,7.5]],['high',[8,8.5,9,10]],['killer',[9,10]],['unknown',[null]]]){const v=await check(band,expected.length);assert.deepEqual(v.items.map(c=>c.summaryDifficulty.score).sort((a,b)=>a-b),expected);}
});
test('groups, profiles, invitation boundaries, retained mock duplicates, deletes and six calendar months',async t=>{
 const x=await groupFixture();t.after(()=>x.close());const {db,rpc,A,B,X,S}=x;
 const call=(u,n,args={})=>rpc(u,n,{s:S,...args});
 await call(A,'bank_invite',{email_address:'teacher-b@example.test',enabled_value:true});await call(B,'bank_join');
 // A legacy profile may be empty, but login is still allowed.
 assert.deepEqual(await rpc(B,'bank_profile_get'),{});
 await assert.rejects(()=>rpc(X,'bank_profile_set',{full_name:' ',academy:'학원'}),/이름/);
 await assert.rejects(()=>call(X,'bank_signup_request',{submit:true}),/이름과 학원명/);
 await rpc(X,'bank_profile_set',{full_name:' 새 회원 ',academy:' 파인만 학원 '});
 assert.deepEqual(await rpc(X,'bank_profile_get'),{display_name:'새 회원',academy_name:'파인만 학원'});
 const g=await call(A,'bank_group_save',{g:null,group_name:'파인만'}),other=await call(A,'bank_group_save',{g:null,group_name:'다른 그룹'});
 await call(A,'bank_group_assign',{target_user:A,g});await call(A,'bank_group_assign',{target_user:B,g});
 const bm=(await call(A,'bank_members_manage')).find(m=>m.userId===B);
 await call(A,'bank_change_member_role',{email_address:bm.email,new_role:'admin',expected_version:bm.roleVersion,confirmation_email:bm.email});
 await assert.rejects(()=>call(B,'bank_group_save',{g:null,group_name:'금지'}));
 await assert.rejects(()=>call(B,'bank_group_invite_create',{g:other,token_digest:'1'.repeat(64),email_address:'outsider@example.test'}));
 const invite=await call(B,'bank_group_invite_create',{g,token_digest:'2'.repeat(64),email_address:'outsider@example.test'});
 await assert.rejects(()=>call(B,'bank_group_invite_create',{g,token_digest:'3'.repeat(64),email_address:'outsider@example.test'}),/유효한 초대/);
 assert.equal((await rpc(X,'bank_invite_accept',{token_digest:'2'.repeat(64)})).status,'joined');
 assert.equal((await call(X,'bank_access_context')).groupId,g);
 await assert.rejects(()=>call(X,'bank_group_invite_create',{g,token_digest:'4'.repeat(64),email_address:'someone@example.test'}));
 await assert.rejects(()=>call(B,'bank_security_overview'));await x.actor(B);await assert.rejects(()=>db.query('select * from bank_security.downloads'));assert.equal((await db.query('select * from bank_audit')).rows.length,0);
 // Another group member and an unassigned member; no production accounts are created.
 const C=id(),U=id();await db.exec('reset role');for(const [u,email]of [[C,'group-c@example.test'],[U,'ungrouped@example.test']])await db.query('insert into auth.users values($1,$2,now())',[u,email]);
 for(const [u,email]of [[C,'group-c@example.test'],[U,'ungrouped@example.test']]){await call(A,'bank_invite',{email_address:email,enabled_value:true});await rpc(u,'bank_profile_set',{full_name:'검증 회원',academy:'검증 학원'});await call(u,'bank_join');}
 await call(A,'bank_group_assign',{target_user:C,g:other});
 assert.deepEqual((await call(B,'bank_members_manage')).map(m=>m.userId).sort(),[A,B,X].sort());
 await assert.rejects(()=>call(B,'bank_member_revoke',{target_user:C,expected_version:1}));
 const q=id(),r=id(),f=id();await db.exec('reset role');
 await db.query("insert into bank_questions(id,space_id,owner_id,owner_email) values($1,$2,$3,'animochoi@gmail.com')",[q,S,A]);await db.query("insert into bank_revisions(id,question_id,actor_id,committed,visibility) values($1,$2,$3,true,'approved')",[r,q,A]);await db.query("insert into bank_entries(id,space_id,name,kind,owner_id) values($1,$2,'commit','file',$3)",[f,S,A]);await db.query("insert into bank_catalog(revision_id,space_id,question_id,commit_id,metadata,content,files) values($1,$2,$3,$4,$5,'{}','[]')",[r,S,q,f,{difficulty:evaluatedDifficulty(),source:{kind:'학교기출',school:'검증중',grade:'중2'},content:{responseType:'선택형'}}]);
 const make=()=>{const e=id();return {schema:1,id:e,title:'검증 회차',version:0,variants:[{id:id(),kind:'A',paper:{items:[{questionId:q,revisionId:r}]}}]};};
 const doc=make();await call(X,'bank_mock_save',{e:doc.id,expected:0,doc});
 // NULL group membership must deny permissions in PL/pgSQL as well as RLS.
 await assert.rejects(()=>call(U,'bank_mock_get',{e:doc.id}));
 await assert.rejects(()=>call(U,'bank_mock_delete',{e:doc.id,expected:1,title_confirmation:doc.title}));
 await call(A,'bank_group_assign',{target_user:B,g:null});
 await assert.rejects(()=>call(B,'bank_group_invite_create',{g,token_digest:'5'.repeat(64),email_address:'unassigned-denied@example.test'}));
 await assert.rejects(()=>call(B,'bank_mock_get',{e:doc.id}));
 await assert.rejects(()=>call(B,'bank_mock_delete',{e:doc.id,expected:1,title_confirmation:doc.title}));
 await assert.rejects(()=>call(B,'bank_member_revoke',{target_user:X,expected_version:1}));
 await call(A,'bank_group_assign',{target_user:B,g});
 const list=await call(B,'bank_mock_list');assert.equal(list.length,1);assert.equal(list[0].can_delete,true);assert.equal(list[0].creator_name,'새 회원');assert.equal(list[0].can_edit,false);assert.equal((await call(B,'bank_mock_get',{e:doc.id})).can_edit,false);
 assert.deepEqual(await call(C,'bank_mock_list'),[]);await assert.rejects(()=>call(C,'bank_mock_get',{e:doc.id}));
 await x.actor(C);assert.equal((await db.query('select * from bank_mock_exams')).rows.length,0);
 const second=make();await assert.rejects(()=>call(B,'bank_mock_save',{e:second.id,expected:0,doc:second}),e=>e.code==='PT409'&&JSON.parse(e.detail)[0].examId===doc.id);
 assert.deepEqual((await call(B,'bank_mock_candidates',{current_exam:null,schools:['검증중']})).candidates,[]);
 assert.equal((await call(C,'bank_mock_candidates',{current_exam:null,schools:['검증중']})).candidates.length,1);
 // A copied record with a different ID still resolves to the same original question.
 const cq=id(),cr=id(),cf=id();await db.exec('reset role');await db.query("insert into bank_questions(id,space_id,owner_id,owner_email) values($1,$2,$3,'animochoi@gmail.com')",[cq,S,A]);await db.query("insert into bank_revisions(id,question_id,actor_id,committed,visibility) values($1,$2,$3,true,'approved')",[cr,cq,A]);await db.query("insert into bank_entries(id,space_id,name,kind,owner_id) values($1,$2,'copy','file',$3)",[cf,S,A]);await db.query("insert into bank_catalog(revision_id,space_id,question_id,commit_id,metadata,content,files) values($1,$2,$3,$4,$5,'{}','[]')",[cr,S,cq,cf,{difficulty:evaluatedDifficulty(),source:{kind:'학교기출',school:'검증중',grade:'중2'},relations:{originalQuestionId:q}}]);
 const copied=make();copied.variants[0].paper.items=[{questionId:cq,revisionId:cr}];await assert.rejects(()=>call(B,'bank_mock_save',{e:copied.id,expected:0,doc:copied}),/이미 보관/);
 assert.equal((await call(B,'bank_mock_candidates',{current_exam:null,schools:null})).candidates.length,0);
 const third=make();await call(C,'bank_mock_save',{e:third.id,expected:0,doc:third});
 const single=make();await call(U,'bank_mock_save',{e:single.id,expected:0,doc:single});const single2=make();await assert.rejects(()=>call(U,'bank_mock_save',{e:single2.id,expected:0,doc:single2}),/이미 보관/);
 // Historical common-use rounds remain editable; new automatic rounds are unique.
 const own=structuredClone(doc);own.variants.push({...structuredClone(own.variants[0]),id:id()});
 // New rounds now prohibit intra-round duplicate assignment. Import a historical
 // shared round through the legacy writer only in this isolated fixture, then
 // verify the public endpoint still preserves pre-policy shared documents.
 await assert.rejects(()=>call(X,'bank_mock_save',{e:doc.id,expected:1,doc:own}),/같은 원본/);
 await db.exec('reset role');await db.query('select bank_ops.bank_mock_save($1,$2,1,$3)',[S,doc.id,own]);
 await call(X,'bank_mock_save',{e:doc.id,expected:2,doc:own});
 await assert.rejects(()=>call(C,'bank_mock_delete',{e:doc.id,expected:2,title_confirmation:doc.title}));
 await assert.rejects(()=>call(B,'bank_mock_save',{e:doc.id,expected:2,doc:own}));
 await call(B,'bank_mock_delete',{e:doc.id,expected:2,title_confirmation:doc.title});
 assert.equal((await call(B,'bank_mock_candidates',{current_exam:null,schools:['검증중']})).candidates.length,1);
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from bank_mock_items where exam_id=$1',[doc.id])).rows[0].n,0);
 await call(B,'bank_mock_save',{e:second.id,expected:0,doc:second});await assert.rejects(()=>call(X,'bank_mock_delete',{e:second.id,expected:1,title_confirmation:second.title}));const before=await call(B,'bank_mock_get',{e:second.id});second.title='제목만 수정';await call(B,'bank_mock_save',{e:second.id,expected:1,doc:second});assert.equal((await call(B,'bank_mock_get',{e:second.id})).expires_at,before.expires_at);
 // Moving the author cannot move or reveal their old group's papers.
 await call(A,'bank_group_assign',{target_user:B,g:other});await assert.rejects(()=>call(B,'bank_mock_get',{e:second.id}));assert.equal((await call(X,'bank_mock_get',{e:second.id})).group_id,g);
 await assert.rejects(()=>call(A,'bank_group_delete',{g}),/회원 재배정/);
 const exam={id:id(),title:'개인 시험지',items:[{questionId:q,revisionId:r}],rules:{}};await call(X,'bank_exam_save',{e:exam.id,expected:0,doc:exam});assert.deepEqual(await call(B,'bank_exam_list'),[]);
 // Expiry fixtures only: alter timestamps with the lifecycle trigger disabled in isolated DB.
 await db.exec("reset role;insert into storage.objects(bucket_id,name,metadata) values('question-bank','original-do-not-delete','{}');");await db.exec('reset role;alter table bank_mock_exams disable trigger paper_lifetime;alter table bank_exam_drafts disable trigger paper_lifetime;');
 await db.query("update bank_mock_exams set created_at=now()-interval '6 months',expires_at=now()-interval '1 second' where id=$1",[second.id]);await db.query("update bank_exam_drafts set expires_at=now()-interval '1 second' where id=$1",[exam.id]);
 await db.exec('alter table bank_mock_exams enable trigger paper_lifetime;alter table bank_exam_drafts enable trigger paper_lifetime;');
 await assert.rejects(()=>call(X,'bank_exam_save',{e:exam.id,expected:1,doc:exam}),/만료/);
 await db.exec('reset role');const clean=(await db.query('select bank_ops.expire_papers() v')).rows[0].v;assert.deepEqual(clean,{exams:1,mocks:1});assert.deepEqual((await db.query('select bank_ops.expire_papers() v')).rows[0].v,{exams:0,mocks:0});
 assert.equal((await db.query("select count(*)::int n from storage.objects where name='original-do-not-delete'")).rows[0].n,1);assert.equal((await db.query('select count(*)::int n from bank_questions where id=$1',[q])).rows[0].n,1);assert.equal((await db.query('select count(*)::int n from bank_mock_exams')).rows[0].n,2);assert.equal((await db.query('select count(*)::int n from bank_exam_history where exam_id=$1',[exam.id])).rows[0].n,0);
 assert.equal((await call(X,'bank_mock_candidates',{current_exam:null,schools:['검증중']})).candidates.length,1);
 await x.actor(B);await assert.rejects(()=>db.query('select bank_ops.expire_papers()'));await assert.rejects(()=>db.query('select bank_ops.bank_mock_save($1,$2,0,$3)',[S,id(),second]));
 console.log('Verified isolated PostgreSQL semantics: signup/profile, invitation group, cross-group RLS, security denial, duplicate conflict, common variants, admin deletion/release, frozen group, personal privacy, expiry + idempotence + original preservation.');
});
