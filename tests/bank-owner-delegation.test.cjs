'use strict';
// Real PostgreSQL semantics in disposable PGlite. No production credentials.
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {localServer}=require('./shared-bank-local-server.cjs');
test('administrator delegation enforces identities, CAS, audit and last-owner boundary',async t=>{
 const x=await localServer(),{A,B,X,S}=x;
 const call=(id,name,args)=>x.sql(id,`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args);
 const row=async email=>(await x.sql(A,'select * from bank_members where space_id=$1 and email=$2',[S,email])).rows[0];
 const change=(id,email,role,version,confirmation=email)=>call(id,'bank_change_member_role',[S,email,role,version,confirmation]);
 const denied=promise=>assert.rejects(promise,e=>e.code==='42501');
 try{
  await call(A,'bank_join',[S]);
  await call(A,'bank_invite',[S,'teacher-b@example.test',true]);await call(B,'bank_join',[S]);
  await t.test('teacher and anonymous RPC/self promotion and direct table writes rejected',async()=>{
   const target=await row('teacher-b@example.test');
   await denied(change(B,target.email,'owner',target.role_version));
   await denied(call(B,'bank_set_role',[S,target.email,'owner']));
   await denied(x.sql(B,"update bank_members set role='owner' where email=$1",[target.email]));
   await denied(change(X,target.email,'owner',target.role_version));
   await x.db.exec("reset role;set request.jwt.claim.sub='';set role anon;");
   await denied(x.db.query('select bank_change_member_role($1,$2,$3,$4,$5)',[S,target.email,'owner',target.role_version,target.email]));
  });
  await t.test('explicit target confirmation, known role and completed membership required',async()=>{
   const target=await row('teacher-b@example.test');
   await assert.rejects(change(A,target.email,'owner',target.role_version,'wrong@example.test'));
   await assert.rejects(change(A,target.email,'superuser',target.role_version));
   await assert.rejects(change(A,target.email,null,target.role_version));
   await assert.rejects(change(A,target.email,'owner',null));
   await call(A,'bank_invite',[S,'outsider@example.test',true]);
   await assert.rejects(change(A,'outsider@example.test','owner',(await row('outsider@example.test')).role_version));
   await call(A,'bank_invite',[S,target.email,false]);
   await assert.rejects(change(A,target.email,'owner',(await row(target.email)).role_version));
   await call(A,'bank_invite',[S,target.email,true]);
  });
  await t.test('promoted non-seed email gains real owner RPC rights and audit evidence',async()=>{
   const target=await row('teacher-b@example.test'),stale=target.role_version;
   const result=(await change(A,' Teacher-B@Example.Test ','owner',stale)).rows[0].result;
   assert.equal(result.role,'owner');assert.equal(Number(result.roleVersion),Number(stale)+1);
   assert.equal((await call(B,'bank_join',[S])).rows[0].result.role,'owner');
   assert.equal((await call(B,'bank_member',[S,true])).rows[0].result,true);
   await call(B,'bank_invite',[S,'outsider@example.test',true]);
   await call(B,'bank_set_role',[S,'outsider@example.test','reviewer']);
   await call(B,'bank_maintenance_job',[S,crypto.randomUUID(),{rules:['render']}]);
   const audit=(await x.sql(B,"select * from bank_audit where action='member_role_change' and actor_id=$1 order by id desc limit 1",[A])).rows[0];
   assert.deepEqual(JSON.parse(audit.target),{email:target.email,previousRole:'teacher',newRole:'owner',previousVersion:Number(stale),newVersion:Number(stale)+1,confirmedEmail:target.email});
   await assert.rejects(change(A,target.email,'reviewer',stale),e=>e.code==='PT409');
  });
  await t.test('legacy role/access callers cannot remove an owner; self demotion retains another owner',async()=>{
   await assert.rejects(call(A,'bank_set_role',[S,'teacher-b@example.test','teacher']));
   await assert.rejects(call(A,'bank_invite',[S,'teacher-b@example.test',false]));
   const a=await row('animochoi@gmail.com');await change(A,a.email,'reviewer',a.role_version);
   await denied(change(A,'teacher-b@example.test','reviewer',(await x.sql(B,'select role_version from bank_members where email=$1',['teacher-b@example.test'])).rows[0].role_version));
   const aCurrent=(await x.sql(B,'select * from bank_members where email=$1',[a.email])).rows[0];await change(B,a.email,'owner',aCurrent.role_version);
  });
  await t.test('ABA stale version, last owner demotion/disable/delete are rejected',async()=>{
   const b=await row('teacher-b@example.test');await change(A,b.email,'reviewer',b.role_version);
   const next=await row(b.email);await change(A,b.email,'owner',next.role_version);
   await assert.rejects(change(A,b.email,'reviewer',b.role_version),e=>e.code==='PT409');
   await change(A,b.email,'reviewer',(await row(b.email)).role_version);
   const a=await row('animochoi@gmail.com');
   await assert.rejects(change(A,a.email,'teacher',a.role_version),e=>e.code==='PT409');
   await x.db.exec('reset role;');
   await assert.rejects(x.db.query('update bank_members set enabled=false where email=$1',[a.email]),e=>e.code==='PT409');
   await assert.rejects(x.db.query('delete from bank_members where email=$1',[a.email]),e=>e.code==='PT409');
   assert.equal((await row(a.email)).role,'owner');
  });
 }finally{await x.close();}
});
