'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite'),I=require('../app/difficulty-v12/input.cjs'),P=require('../app/difficulty-v121/desktop-policy.cjs');
test('1266 atomic reviewed activation, deployed-policy gate, conflict rollback, teacher edit and recovery',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema bank_summary;create schema auth;
 create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
 create function bank_member(uuid,boolean) returns boolean language sql as $$ select false $$;
 create table bank_spaces(id uuid primary key);create table bank_questions(id uuid primary key,archived boolean default false);
 create table bank_revisions(id uuid primary key,question_id uuid,parent_id uuid,review_version int,committed boolean);
 create table bank_catalog(question_id uuid,revision_id uuid primary key,space_id uuid,metadata jsonb,confirmed jsonb,content jsonb,files jsonb);
 create function bank_difficulty_number(jsonb,jsonb) returns numeric language sql as $$ select 9::numeric $$;
 create function bank_summary.row_difficulty(uuid,jsonb,jsonb) returns jsonb language sql as $$ select '{}'::jsonb $$;`);
 await db.exec(fs.readFileSync('supabase/migrations/20261018164719_difficulty_v121_activation.sql','utf8'));
 const space=crypto.randomUUID(),batch=crypto.randomUUID();await db.query('insert into bank_spaces values($1)',[space]);
 const snapshots=[],results=[];
 for(let n=0;n<1266;n++){
  const id=crypto.randomUUID(),rid=crypto.randomUUID(),snapshot={metadata:{source:{school:'검증'},difficulty:{aiScore:9,userScore:8},review:{status:'unreviewed'}},confirmed:{difficulty:8,keep:true},content:{body:'한글 x',answer:'54',solution:'보존'},files:[]};
  snapshots.push({id,rid,snapshot});
  results.push({...P.versions,question_id:id,question_revision_id:rid,evaluation_id:'test:'+id,activation_batch_id:batch,
   source_content_hash:I.hash(snapshot.content),source_image_asset_hash:I.hash(snapshot.files),reviewed_evaluation_input_hash:'a'.repeat(64),
   final_status:'complete',final_score:4.6,final_tier:'T2',final_stage:1,final_model:'gpt-6-luna',final_reasoning_effort:'medium',stage1_validation_result:{valid:true,solution_validated:true},
   production_review_envelope:n<14?{authorization:'user-approved-exception-preservation-20261019',historical_runner_record:{final_status:'failed',final_score:null}}:null});
 }
 await db.exec('begin');for(const {id,rid,snapshot:s}of snapshots){await db.query('insert into bank_questions values($1,false)',[id]);await db.query('insert into bank_revisions values($1,$2,null,0,true)',[rid,id]);await db.query('insert into bank_catalog values($1,$2,$3,$4,$5,$6,$7)',[id,rid,space,s.metadata,s.confirmed,s.content,s.files]);}await db.exec('commit');
 await db.exec(fs.readFileSync('supabase/migrations/20261019144047_difficulty_v121_review_activation.sql','utf8'));
 assert.equal((await db.query('select bank_v121.hash($1) h',[snapshots[0].snapshot.content])).rows[0].h,I.hash(snapshots[0].snapshot.content));
 const policy={allowedPrompts:[P.versions.prompt_hash],allowedNormalizers:[P.versions.normalizer_version],schemaHash:P.versions.json_schema_hash,scorerCodeHash:P.versions.scorer_code_hash};
 await db.query('insert into bank_v121.activation_batches(id,space_id,policy,expected_count) values($1,$2,$3,1266)',[batch,space,policy]);
 await db.exec('begin');for(let n=0;n<1266;n++){const x=snapshots[n],r=results[n];await db.query('insert into bank_v121.activation_results values($1,$2,$3,0,$4,$5,$6,$7,null,null)',[batch,x.id,x.rid,x.snapshot,r,I.hash(r),r.evaluation_id]);}await db.exec('commit');
 const activate=()=>db.query('select bank_v121.activate_reviewed($1)',[batch]);
 await assert.rejects(activate(),/deployment gate/);
 await db.query("update bank_v121.release_policy set deployment_evidence=$1",[{verified:true,version:'0.4.54',sourceCommit:'test',installedAssetsHash:'test'}]);
 await db.query("update bank_catalog set confirmed=confirmed||'{\"difficulty\":7}' where revision_id=$1",[snapshots[0].rid]);
 await assert.rejects(activate(),/Concurrent/);
 assert.equal((await db.query("select count(*)::int n from bank_catalog where metadata#>'{difficulty,v121Active}' is not null")).rows[0].n,0);
 await db.query('update bank_catalog set confirmed=$1 where revision_id=$2',[snapshots[0].snapshot.confirmed,snapshots[0].rid]);
 await db.exec('begin');await activate();await db.exec('rollback');
 assert.equal((await db.query("select count(*)::int n from bank_catalog where metadata#>'{difficulty,v121Active}' is not null")).rows[0].n,0);
 await activate();
 assert.equal((await db.query("select count(*)::int n from bank_catalog where metadata#>>'{difficulty,effective_score_source}'='auto' and confirmed->>'difficulty' is null")).rows[0].n,1266);
 let c=(await db.query('select * from bank_catalog where revision_id=$1',[snapshots[0].rid])).rows[0];
 assert.deepEqual(c.content,snapshots[0].snapshot.content);assert.deepEqual(c.metadata.review,{status:'unreviewed'});
 assert.equal(c.metadata.difficulty.v121Active.production_review_envelope.historical_runner_record.final_status,'failed');
 await assert.rejects(db.query("update bank_catalog set metadata=jsonb_set(metadata,'{difficulty}', '{\"aiScore\":9}') where revision_id=$1",[snapshots[0].rid]),/upgrade_required/);
 await db.query("update bank_catalog set confirmed=confirmed||'{\"difficulty\":6}' where revision_id=$1",[snapshots[0].rid]);
 assert.equal((await db.query('select bank_difficulty_number(metadata,confirmed) n from bank_catalog where revision_id=$1',[snapshots[0].rid])).rows[0].n,'6');
 await assert.rejects(db.query('select bank_v121.rollback_reviewed($1)',[batch]),/Post-activation/);
 await db.query("update bank_catalog set confirmed=confirmed-'difficulty' where revision_id=$1",[snapshots[0].rid]);
 await db.query('select bank_v121.rollback_reviewed($1)',[batch]);
 c=(await db.query('select * from bank_catalog where revision_id=$1',[snapshots[0].rid])).rows[0];assert.deepEqual(c.metadata,snapshots[0].snapshot.metadata);assert.deepEqual(c.confirmed,snapshots[0].snapshot.confirmed);
 await db.exec('set role authenticated');await assert.rejects(db.query('select bank_v121.activate_reviewed($1)',[batch]),/permission/);await assert.rejects(db.query('select * from bank_v121.activation_results'),/permission/);await db.exec('reset role');
 }finally{await db.close();}
});
