const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {localServer}=require('./shared-bank-local-server.cjs');

test('approved teacher confirms scope and completes shared review without widening administration',async t=>{
 const x=await localServer();t.after(()=>x.close());const call=(u,n,args)=>x.auth(u).request('/rest/v1/rpc/'+n,{method:'POST',body:args});
 await call(x.A,'bank_join',{s:x.S});await call(x.A,'bank_invite',{s:x.S,email_address:'teacher-b@example.test',enabled_value:true});await call(x.B,'bank_join',{s:x.S});
 const q=crypto.randomUUID(),r=crypto.randomUUID(),f=crypto.randomUUID();await x.db.exec('reset role');
 await x.db.query("insert into bank_questions(id,space_id,owner_id,owner_email) values($1,$2,$3,'animochoi@gmail.com')",[q,x.S,x.A]);
 await x.db.query("insert into bank_revisions(id,question_id,actor_id,committed,visibility) values($1,$2,$3,true,'shared_pending')",[r,q,x.A]);
 await x.db.query("insert into bank_entries(id,space_id,name,kind,owner_id) values($1,$2,'commit','file',$3)",[f,x.S,x.A]);
 await x.db.query("insert into bank_catalog(revision_id,space_id,question_id,commit_id,metadata,content,files) values($1,$2,$3,$4,$5,$6,'[]')",[r,x.S,q,f,{source:{school:'광희중',originalNumber:'16',originalPoints:'4'},difficulty:{aiScore:'4.7'}},{body:'문제',solution:'풀이'}]);
 assert.equal((await call(x.B,'bank_search_current',{s:x.S,filters:{status:'shared_pending'}})).length,1);
 const evidence={taxonomyVersion:'middle-school-2022-v1',conditionUnitIds:[],confirmed:true,solutions:[{id:'solution-1',text:'풀이',unitIds:[],dependencyUnitIds:[],verified:true,complete:true}]};
 await call(x.B,'bank_scope_confirm',{r,e:evidence});
 assert.equal((await x.sql(x.B,'select confirmed from bank_catalog where revision_id=$1',[r])).rows[0].confirmed.scopeEvidence.confirmed,true);
 await assert.rejects(call(x.X,'bank_teacher_complete',{r,expected:0,score:5.0,sharing_confirmed:true}));
 await assert.rejects(call(x.B,'bank_teacher_complete',{r,expected:0,score:5.0,sharing_confirmed:false}));
 await call(x.B,'bank_teacher_complete',{r,expected:0,score:5.0,sharing_confirmed:true});
 const review=(await x.sql(x.A,'select visibility,reviewer_id,review_version from bank_revisions where id=$1',[r])).rows[0];assert.equal(review.visibility,'approved');assert.equal(review.reviewer_id,x.B);assert.equal(review.review_version,1);
 assert.equal((await x.sql(x.A,'select confirmed from bank_catalog where revision_id=$1',[r])).rows[0].confirmed.difficulty,'5.0');
 assert.equal(await call(x.A,'bank_review_identity',{r}),'teacher-b@example.test');
 await assert.rejects(call(x.B,'bank_taxonomy_save',{s:x.S,item:crypto.randomUUID(),label_value:'무단 단원',kind_value:'unit',parent_value:null,expected:0,retired_value:false}));
 assert.equal((await call(x.A,'bank_search_current',{s:x.S,filters:{status:'approved'}})).length,1);
 const exam=crypto.randomUUID(),doc={title:'고정 문항 버전',items:[{questionId:q,revisionId:r,workspaceMm:0}]};await call(x.B,'bank_exam_save',{s:x.S,e:exam,expected:0,doc});
 await call(x.A,'bank_archive',{q,archived_value:true,reason_text:'검증용 보관'});
 assert.equal((await call(x.B,'bank_search_current',{s:x.S,filters:{}})).length,0);
 assert.equal((await call(x.B,'bank_exam_get',{s:x.S,e:exam})).document.items[0].revisionId,r);
 assert.equal((await x.sql(x.B,'select revision_id from bank_catalog where revision_id=$1',[r])).rows.length,1);
});
