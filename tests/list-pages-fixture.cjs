const {groupFixture}=require('./group-operations-fixture.cjs'),{randomUUID:id}=require('crypto');
async function listFixture(){
 const x=await groupFixture(),{db,A,B,S,rpc}=x;
 const g=await rpc(A,'bank_group_save',{s:S,g:null,group_name:'파인만'}),other=await rpc(A,'bank_group_save',{s:S,g:null,group_name:'다른 그룹'});
 await rpc(A,'bank_group_assign',{s:S,target_user:B,g});await rpc(A,'bank_change_member_role',{s:S,email_address:'teacher-b@example.test',new_role:'admin',expected_version:(await rpc(A,'bank_members_manage',{s:S})).find(m=>m.userId===B).roleVersion,confirmation_email:'teacher-b@example.test'});
 await db.exec('reset role');const users=[];
 for(let n=0;n<43;n++){const u=id(),email='page'+String(n).padStart(2,'0')+'@example.test',group=n<4?g:n===42?other:null;await db.query('insert into auth.users values($1,$2,now())',[u,email]);await db.query("insert into bank_members(space_id,email,user_id,role,enabled,group_id) values($1,$2,$3,'teacher',true,$4)",[S,email,u,group]);await db.query('insert into bank_member_profiles values($1,$2,$3)',[u,'회원'+String(n).padStart(2,'0'),'검증학원']);users.push({userId:u,email,groupId:group,name:'회원'+String(n).padStart(2,'0')});}
 const questions=[];for(const [band,score]of [['low',2],['middle',5],['high',9]])for(let n=0;n<43;n++){const q=id(),r=id(),f=id();await db.query("insert into bank_questions(id,space_id,owner_id,owner_email) values($1,$2,$3,'animochoi@gmail.com')",[q,S,A]);await db.query("insert into bank_revisions(id,question_id,actor_id,committed,visibility) values($1,$2,$3,true,'shared_pending')",[r,q,A]);await db.query("insert into bank_entries(id,space_id,name,kind,owner_id) values($1,$2,'page fixture','file',$3)",[f,S,A]);await db.query("insert into bank_catalog(revision_id,space_id,question_id,commit_id,metadata,confirmed,content,files,created_at) values($1,$2,$3,$4,$5,$6,$7,'[]','2026-01-01')",[r,S,q,f,{source:{kind:'학교기출',school:'페이지검증중',grade:'중2',semester:'2학기',originalNumber:String(n+1)},content:{responseType:'선택형'}},{difficulty:score},{body:band+' 검증 문항 '+n}]);questions.push({q,r,band});}
 return {...x,g,other,users,questions};
}
module.exports={listFixture};
