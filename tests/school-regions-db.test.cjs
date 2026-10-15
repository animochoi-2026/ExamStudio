const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID:id}=require('crypto');
const {groupFixture}=require('./group-operations-fixture.cjs');
test('school registry preserves catalog, sync is idempotent, writes require owner and version',async t=>{
 const x=await groupFixture();t.after(()=>x.close());const {db,A,B,S,rpc}=x,q=id(),r=id(),f=id();await db.exec('reset role');
 await db.query("insert into bank_questions(id,space_id,owner_id,owner_email) values($1,$2,$3,'animochoi@gmail.com')",[q,S,A]);
 await db.query("insert into bank_revisions(id,question_id,actor_id,committed,visibility) values($1,$2,$3,true,'approved')",[r,q,A]);
 await db.query("insert into bank_entries(id,space_id,name,kind,owner_id) values($1,$2,'fixture','file',$3)",[f,S,A]);
 const metadata={source:{school:'검증중',grade:'중2'}};await db.query("insert into bank_catalog(revision_id,space_id,question_id,commit_id,metadata,content,files) values($1,$2,$3,$4,$5,'{}','[]')",[r,S,q,f,metadata]);
 await rpc(A,'bank_school_regions_sync',{s:S});await rpc(A,'bank_school_regions_sync',{s:S});
 await x.actor(A);const rows=(await db.query('select * from bank_school_regions')).rows;assert.equal(rows.length,1);assert.equal(rows[0].school_key,'|검증중');
 assert.deepEqual(await rpc(A,'bank_school_region_claim',{s:S,k:'|검증중',expected:1}),{claimed:true});assert.deepEqual(await rpc(A,'bank_school_region_claim',{s:S,k:'|검증중',expected:1}),{busy:true});await assert.rejects(rpc(B,'bank_school_region_claim',{s:S,k:'|검증중',expected:1}));
 const args={s:S,k:'|검증중',expected:1,value:{province:'검증시',district:'검증구',address:'검증주소',status:'verified',source:'manual'}};
 await assert.rejects(rpc(B,'bank_school_region_save',args));const saved=await rpc(A,'bank_school_region_save',args);assert.equal(saved.version,2);assert.equal((await rpc(A,'bank_school_region_claim',{s:S,k:'|검증중',expected:2})).reused,true);await assert.rejects(rpc(A,'bank_school_region_save',args));
 await x.actor(B);await assert.rejects(db.query("update bank_school_regions set name='변조'"));
 await db.exec('reset role;set role anon');await assert.rejects(db.query('select * from bank_school_regions'));
 await db.exec('reset role');assert.deepEqual((await db.query('select metadata from bank_catalog where revision_id=$1',[r])).rows[0].metadata,metadata);
});
