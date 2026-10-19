'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {localServer}=require('./shared-bank-local-server.cjs');
test('set-based reference scan preserves freeze, unchanged audits and actual files',async t=>{
 const s=await localServer();t.after(()=>s.close());await s.auth(s.A).membership();await s.db.exec('reset role');
 const q=crypto.randomUUID(),r=crypto.randomUUID(),retired=crypto.randomUUID(),file=crypto.randomUUID(),job=crypto.randomUUID();
 await s.db.query("insert into bank_questions(id,space_id,owner_id,owner_email) values($1,$2,$3,'fixture')",[q,s.S,s.A]);
 for(const id of [r,retired])await s.db.query('insert into bank_revisions(id,question_id,actor_id,committed) values($1,$2,$3,true)',[id,q,s.A]);
 await s.db.query("insert into bank_entries(id,space_id,name,kind,owner_id,verified,size,chunks,sha256,props) values($1,$2,'fixture','file',$3,true,1,1,$4,'{}')",[file,s.S,s.A,'a'.repeat(64)]);
 const old={audit:{revision:retired},nested:{strings:Array.from({length:250},(_,n)=>'old '+n)}};
 await s.db.query("insert into bank_catalog(revision_id,space_id,question_id,commit_id,metadata,content,files) values($1,$2,$3,$4,$5,'{}','[]')",[r,s.S,q,file,old]);
 await s.db.query("insert into bank_revision_prunes(id,space_id,actor_id,token,manifest,plan,completed) values($1,$2,$3,'fixture','{}',$4,true)",[job,s.S,s.A,{files:[{id:file}]}]);
 await s.db.query('insert into bank_revision_prune_marks values($1,$2,$3)',[retired,job,{}]);
 const next={...old,evaluation:{stages:Array.from({length:1500},(_,n)=>({text:'new '+n,n,dup:'same'}))}};
 const timing=[];
 for(const optimized of [false,true]){
  if(optimized)await s.db.exec(fs.readFileSync('supabase/migrations/20261019151508_difficulty_v121_reference_scan.sql','utf8'));
  // Do not reference the frozen commit file in this metadata-only timing case.
  await s.db.query("update bank_revision_prunes set plan='{}' where id=$1",[job]);
  const at=performance.now();await s.db.query('update bank_catalog set metadata=$1 where revision_id=$2',[next,r]);timing.push(performance.now()-at);
  assert.deepEqual((await s.db.query('select metadata from bank_catalog where revision_id=$1',[r])).rows[0].metadata,next);
  await s.db.query('update bank_catalog set metadata=$1 where revision_id=$2',[old,r]);
 }
 // A NEW retired identifier is forbidden, including nested/composite positions.
 const blocked=crypto.randomUUID();await s.db.query('insert into bank_revisions(id,question_id,actor_id,committed) values($1,$2,$3,true)',[blocked,q,s.A]);await s.db.query('insert into bank_revision_prune_marks values($1,$2,$3)',[blocked,job,{}]);
 for(const extra of [{ref:blocked},{nested:[{ref:blocked}]},{ref:blocked,duplicate:[blocked,blocked]}])await assert.rejects(s.db.query('update bank_catalog set metadata=$1 where revision_id=$2',[{...old,extra},r]),/frozen or retired/);
 await s.db.query('update bank_revision_prunes set plan=$1 where id=$2',[{files:[{id:file}]},job]);await assert.rejects(s.db.query("update bank_catalog set metadata=metadata||'{\"safe\":true}' where revision_id=$1",[r]),/frozen or retired/);
 console.log({oldMs:Math.round(timing[0]),newMs:Math.round(timing[1])});
});
