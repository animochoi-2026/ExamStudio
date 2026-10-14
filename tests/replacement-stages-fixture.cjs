const {groupFixture}=require('./group-operations-fixture.cjs'),{randomUUID:id}=require('crypto');
async function replacementFixture({mixedFormats=false}={}){
 const x=await groupFixture(),{db,A,B,S,rpc}=x;
 const g=await rpc(A,'bank_group_save',{s:S,g:null,group_name:'후보 검증 그룹'}),other=await rpc(A,'bank_group_save',{s:S,g:null,group_name:'다른 후보 그룹'});
 await rpc(A,'bank_group_assign',{s:S,target_user:A,g});await rpc(A,'bank_group_assign',{s:S,target_user:B,g});
 const C=id();await db.exec('reset role');await db.query("insert into auth.users values($1,'replacement-c@example.test',now())",[C]);await db.query("insert into bank_members(space_id,email,user_id,role,enabled,group_id) values($1,'replacement-c@example.test',$2,'teacher',true,$3)",[S,C,other]);
 await db.query('insert into bank_member_profiles values($1,$2,$3)',[C,'합성 교사','합성 학원']);
 const questions=[];
 for(let n=1;n<=99;n++){
  const q=id(),r=id(),f=id(),school=n>=50&&n<=96?'다른중':'지정중',unit=n===95?'m2-9.1':n<50&&n%2===0?'m2-8.6':'m2-8.7';
  const metadata={source:{kind:'학교기출',school,schoolId:school==='지정중'?'school-preferred':'school-other',region:'테스트지역',grade:n===96?'중1':'중2',semester:'2학기',academicYear:'2026',originalNumber:String(n)},content:{responseType:'single_choice'},classification:{primaryUnit:{id:unit},types:[{id:n%2?'length':'angle',name:n%2?'길이':'각도'}]}};
  if(mixedFormats&&(n===1||n>=3&&n<=30||n>=50&&n<=80))metadata.content.responseType=['서술형','단답형','서논술형','논술형','proof'][n%5];
  if(n===97)metadata.relations={originalQuestionId:questions[0].q};
  if(n===99){metadata.source.documentId='replacement-set';}
  await db.query("insert into bank_questions(id,space_id,owner_id,owner_email,archived) values($1,$2,$3,'fixture@example.test',$4)",[q,S,A,n===98]);
  await db.query("insert into bank_revisions(id,question_id,actor_id,committed,visibility) values($1,$2,$3,true,'shared_pending')",[r,q,A]);
  await db.query("insert into bank_entries(id,space_id,name,kind,owner_id) values($1,$2,'replacement fixture','file',$3)",[f,S,A]);
  const score=n===94?null:n%10;
  await db.query("insert into bank_catalog(revision_id,space_id,question_id,commit_id,metadata,confirmed,content,files) values($1,$2,$3,$4,$5,$6,$7,'[]')",[r,S,q,f,metadata,{difficulty:score},{body:'합성 후보 '+n,answer:'PRIVATE ANSWER',solution:'PRIVATE SOLUTION'}]);
  questions.push({n,q,r,metadata,score});
 }
 await db.query("insert into bank_question_sets(space_id,source_document,original_numbers,common,owner_id) values($1,'replacement-set',array['99','100'],'{}',$2)",[S,A]);
 const rules={schools:['지정중'],units:['m2-8.7','m2-8.6'],type:'unused-type',unit:'ignored-single-filter'},selected=questions.slice(0,2).map(q=>q.q);
 const get=(extra={},actor=A)=>rpc(actor,'bank_replacement_candidates',{s:S,current_revision:questions[0].r,rules,selected,...extra});
 const makeDoc=ns=>({schema:1,id:id(),title:'합성 보관 회차',version:0,variants:[{id:id(),kind:'A',paper:{items:ns.map(n=>({questionId:questions[n-1].q,revisionId:questions[n-1].r}))}}]});
 return {...x,g,other,C,questions,rules,selected,get,makeDoc};
}
module.exports={replacementFixture};
