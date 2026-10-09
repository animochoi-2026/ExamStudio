'use strict';
const crypto=require('node:crypto'),C=require('../app/curriculum.js');
async function seed(server){
 const call=(u,n,args)=>server.auth(u).request('/rest/v1/rpc/'+n,{method:'POST',body:args});
 await call(server.A,'bank_join',{s:server.S});await call(server.A,'bank_invite',{s:server.S,email_address:'teacher-b@example.test',enabled_value:true});await call(server.B,'bank_join',{s:server.S});
 const records=[];
 for(let i=0;i<10;i++){
  const q=crypto.randomUUID(),r=crypto.randomUUID(),f=crypto.randomUUID(),school=i%2?'학교A':'학교B',score=i<5?5:8.5;
  const metadata={source:{documentId:school+'-paper',kind:'학교기출',school,academicYear:'2026',grade:'중2',semester:'2학기',exam:'중간고사',originalNumber:String(i+1),originalPoints:'4'},content:{responseType:'single_choice'},classification:{taxonomyVersion:C.version,primaryUnit:{id:'m2-6.3',name:'삼각형의 외심'}},difficulty:{aiScore:score,aiBand:score>=8?'아주어려움':'보통',criteriaVersion:require('../app/difficulty-assessment.cjs').version},management:{review:'approved'}};
  const content={body:`합성 문항 ${i+1}. 삼각형의 외심에서 꼭짓점까지의 거리를 구하시오.`,solution:'세 꼭짓점까지의 거리가 같다. 주어진 조건을 대입하여 답을 구한다.',answer:'4',choices:['2','4','6']};
  await server.db.exec('reset role');
  await server.db.query("insert into bank_questions(id,space_id,owner_id,owner_email) values($1,$2,$3,'animochoi@gmail.com')",[q,server.S,server.A]);
  await server.db.query("insert into bank_revisions(id,question_id,actor_id,committed,visibility) values($1,$2,$3,true,'approved')",[r,q,server.A]);
  await server.db.query("insert into bank_entries(id,space_id,name,kind,owner_id,props) values($1,$2,'commit','file',$3,$4)",[f,server.S,server.A,{sourceId:school+'-paper'}]);
  await server.db.query("insert into bank_catalog(revision_id,space_id,question_id,commit_id,metadata,content,files) values($1,$2,$3,$4,$5,$6,'[]')",[r,server.S,q,f,metadata,content]);
  const dataId=crypto.randomUUID(),nativeId=crypto.randomUUID(),bundle={schemaVersion:1,questionId:q,revisionId:r,files:[],native:{targetQuestionId:nativeId,project:{problems:[{id:crypto.randomUUID(),original:{id:nativeId,kind:'original',...content},variants:[],regions:[],cropPaths:[]}]}}};
  const bytes=Buffer.from(JSON.stringify(bundle)),sha=crypto.createHash('sha256').update(bytes).digest('hex'),objectName=`${server.S}/${dataId}/000`;
  await server.db.query("insert into bank_entries(id,space_id,name,kind,owner_id,verified,size,sha256,chunks,props) values($1,$2,'native.json','file',$3,true,$4,$5,1,$6)",[dataId,server.S,server.A,bytes.length,sha,{role:'data',questionId:q}]);
  await server.db.query('insert into bank_revision_files values($1,$2)',[r,dataId]);
  await server.db.query("insert into storage.objects(bucket_id,name) values('question-bank',$1)",[objectName]);server.bytes.set(objectName,bytes);
  await server.db.query('update bank_catalog set files=$2 where revision_id=$1',[r,[{id:dataId,role:'data',sha256:sha}]]);
  await call(server.B,'bank_scope_confirm',{r,e:{confirmed:true,taxonomyVersion:C.version,conditionUnitIds:['m2-6.3'],solutions:[{id:'checked',label:'기존 풀이',verified:true,complete:true,unitIds:['m2-6.3'],dependencyUnitIds:[],text:content.solution}]}});
  records.push({q,r,metadata});
 }
 await server.db.exec('reset role');await server.db.query("insert into bank_taxonomy(space_id,id,label,kind) values($1,$2,'기존 보존 분류','unit')",[server.S,crypto.randomUUID()]);
 return {records,call};
}
module.exports={seed};
