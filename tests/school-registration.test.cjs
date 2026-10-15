const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID:id}=require('crypto');
const {groupFixture}=require('./group-operations-fixture.cjs');
test('registration lookup is service-only, bound to a committed uploader and single-use with CAS',async t=>{
 const x=await groupFixture();t.after(()=>x.close());const {db,A,B,S}=x,q=id(),r=id(),f=id();await db.exec('reset role');
 await db.query("insert into bank_questions(id,space_id,owner_id,owner_email) values($1,$2,$3,'fixture@example.test')",[q,S,A]);
 await db.query("insert into bank_revisions(id,question_id,actor_id,committed,visibility) values($1,$2,$3,true,'approved')",[r,q,A]);
 await db.query("insert into bank_entries(id,space_id,name,kind,owner_id) values($1,$2,'fixture','file',$3)",[f,S,A]);
 await db.query("insert into bank_catalog(revision_id,space_id,question_id,commit_id,metadata,content,files) values($1,$2,$3,$4,$5,'{}','[]')",[r,S,q,f,{source:{school:'등록검증중',grade:'중2'}}]);
 const call=(actor=A,expected=null,value=null)=>db.query('select bank_school_region_registration($1,$2,$3,$4) result',[r,actor,expected,value]).then(v=>v.rows[0].result);
 for(const role of ['anon','authenticated']){await db.exec('reset role;set role '+role);await assert.rejects(call(),/permission denied/);}
 // Match the existing Supabase service role attribute, not an application grant.
 await db.exec('reset role;alter role service_role bypassrls;set role service_role');await assert.rejects(call(B));const first=await call();assert(first.claimed);assert.equal((await call()).busy,true);
 const value={status:'verified',province:'검증시',district:'검증구',address:'검증주소',place_id:'fixture',candidates:[]};assert.equal((await call(A,first.school.version+1,value)).superseded,true);assert.equal((await call(A,first.school.version,value)).saved,true);assert.equal((await call()).reused,true);assert.equal((await call(A,first.school.version,{...value,address:'wrong'})).superseded,true);
 await db.exec('reset role');assert.equal((await db.query('select address from bank_school_regions where space_id=$1',[S])).rows[0].address,'검증주소');
});
test('registration job skips completed/claimed work and stores a failure once without throwing upload failure',async()=>{
 const {registerSchoolRegion}=await import('../supabase/functions/_shared/school-registration.mjs');let calls=0,google=0,saved;
 const options={revision:id(),actor:id(),url:'https://fixture.test',service:'fixture-service',key:'fixture-key'};
 assert.deepEqual(await registerSchoolRegion({...options,key:null,fetchImpl:()=>{throw Error('unexpected');}}),{pending:true});
 assert.deepEqual(await registerSchoolRegion({...options,fetchImpl:async()=>Response.json({reused:true})}),{reused:true});
 const result=await registerSchoolRegion({...options,fetchImpl:async(url,opt)=>{if(url.includes('googleapis')){google++;return new Response('',{status:503});}calls++;if(calls===1)return Response.json({claimed:true,school:{name:'검증중',version:1,address:''}});saved=JSON.parse(opt.body);return Response.json({saved:true});}});
 assert.equal(google,1);assert.equal(saved.value.status,'failed');assert.equal(result.saved,true);
});
