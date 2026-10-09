const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {localServer}=require('./shared-bank-local-server.cjs');
test('dashboard respects membership, revision visibility, unique questions and actual source fields',async t=>{
 const x=await localServer();t.after(()=>x.close());await x.auth(x.A).request('/rest/v1/rpc/bank_join',{method:'POST',body:{s:x.S}});
 await x.auth(x.A).request('/rest/v1/rpc/bank_invite',{method:'POST',body:{s:x.S,email_address:'teacher-b@example.test',enabled_value:true}});
 const dash=uid=>x.sql(uid,'select bank_dashboard($1) as d',[x.S]).then(r=>r.rows[0].d);
 assert.equal((await dash(x.B)).questions,0);
 await assert.rejects(dash(x.X),/privilege|permission/i);
 await x.db.exec('reset role;set role anon');await assert.rejects(x.db.query('select bank_dashboard($1)',[x.S]),/permission/i);
 async function add(qid,visibility,source,age=0){await x.db.exec('reset role');const rid=crypto.randomUUID(),fid=crypto.randomUUID();await x.db.query("insert into bank_questions(id,space_id,owner_id,owner_email,created_at) values($1,$2,$3,'animochoi@gmail.com',now()-$4*interval '1 day') on conflict do nothing",[qid,x.S,x.A,age]);await x.db.query('insert into bank_revisions(id,question_id,actor_id,committed,visibility) values($1,$2,$3,true,$4)',[rid,qid,x.A,visibility]);await x.db.query("insert into bank_entries(id,space_id,name,kind,owner_id) values($1,$2,'commit','file',$3)",[fid,x.S,x.A]);await x.db.query("insert into bank_catalog(revision_id,space_id,question_id,commit_id,metadata,content,files) values($1,$2,$3,$4,$5,'{}','[]')",[rid,x.S,qid,fid,{source}]);return rid;}
 const q=crypto.randomUUID();await add(q,'approved',{school:'가중',region:'서울',academicYear:'2026',grade:'중2',semester:'2학기'},20);await add(q,'approved',{school:'가중',region:'서울'});await add(crypto.randomUUID(),'shared_pending',{school:'비공개중'});await add(crypto.randomUUID(),'approved',{school:'가중',region:'부산'});await add(crypto.randomUUID(),'approved',{school:null});
 // Migration 016 already makes shared_pending readable by approved teachers.
 let d=await dash(x.B);assert.deepEqual([d.questions,d.schools,d.reviewed,d.recent],[4,3,3,3]);
 d=await dash(x.A);assert.deepEqual([d.questions,d.schools,d.reviewed,d.recent],[4,3,3,3]);
 await x.auth(x.A).request('/rest/v1/rpc/bank_invite',{method:'POST',body:{s:x.S,email_address:'teacher-b@example.test',enabled_value:false}});await assert.rejects(dash(x.B),/privilege|permission/i);
});
test('presentation uses nested fields and preserves null/zero difficulty and confirmed precedence',async()=>{
 const {sourceInfo,score}=await import('../web-bank/presentation.js');
 const c={metadata:{source:{school:'광희중',academicYear:'2026',grade:'중2',semester:'2학기',originalNumber:'서술형3'},classification:{primaryUnit:{name:'평행사변형'}},difficulty:{aiScore:'4.7',userScore:null,criteriaVersion:require('../app/difficulty-assessment.cjs').version},management:{tags:['기출']}}};
 assert.equal(sourceInfo(c).school,'광희중');assert.equal(sourceInfo(c).number,'서술형3');assert.equal(sourceInfo(c).unit,'평행사변형');assert.equal(score(c),'4.7점 · AI 추천 / 중');assert.equal(score({metadata:{difficulty:{aiScore:null}}}),'미평가 · 미분석·판단보류');assert.equal(score({confirmed:{difficulty:'0'}}),'0.0점 · 교사 검수 / 하');assert.equal(score({...c,confirmed:{difficulty:'8'}}),'8.0점 · 교사 검수 / 상');
});
