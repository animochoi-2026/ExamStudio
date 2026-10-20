'use strict';
// Local files only: preserve parent run and prepare a separately hashed batch.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base=path.join(root,'artifacts/full-rollout-continuation-20261021');
const C=require('../app/difficulty-v122/canonical.cjs'),CP=require('../app/difficulty-v122/checkpoint.cjs');
const I=require('../app/difficulty-v122/input.cjs'),K=require('../app/difficulty-v122/contracts.cjs');
const S=require('../app/difficulty-v122/schema.cjs'),P=require('../app/difficulty-v122/prompt.cjs');
const X=require('./difficulty-v122-continuation.cjs');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8')),sha=f=>C.bytesHash(fs.readFileSync(f));
const parentRoot=path.resolve(root,'../../difficulty-v122-evidence-rc-20261021/문제생성기');
const old=path.join(parentRoot,'artifacts/full-rollout-staging-20261021');
const save=(f,v)=>CP.atomic(path.join(base,f),v);
function main(){
 assert(!fs.existsSync(base+'/execution-bundle.json'),'already prepared; use frozen run rather than replacing');
 assert.equal(cp.execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:root,encoding:'utf8'}).trim(),'','commit code before freeze');
 assert.equal(sha(old+'/target-snapshot.json'),'07c3ba57224612af5490044b577348fbada99ed18bf13daaa66c968f17e7ac0d');
 assert.equal(sha(old+'/batch/checkpoint.json'),'9761ed73b9d72ebb78b36d744b26dcebc9abc6292a16c4ae6213774d9727c98e');
 const original=read(old+'/target-snapshot.json');
 const frozen=read(parentRoot+'/release/difficulty-v122-successor-overlay-20261021/release-candidate-frozen.json');
 assert.equal(C.hash(frozen.code),original.bundle_hash);
 for(const [f,h]of Object.entries(frozen.code))assert.equal(sha(parentRoot+'/'+f),h);
 const prior=read(root+'/release/difficulty-v122-contract-offline-20261021/candidate-manifest.json');
 for(const [f,h]of Object.entries(prior.code))assert.equal(sha(root+'/'+f),h);
 const versions=read(root+'/app/difficulty-v122/candidate-versions.json');
 for(const [f,h]of Object.entries(versions.files))assert.equal(sha(root+'/app/difficulty-v122/'+f),h);
 assert.equal(C.hash(versions.files),versions.versions.criteria_payload_hash);
 const sources=[],targets=[];let images=0;
 for(const t of original.targets){
  const file=path.resolve(old,t.source_file);assert.equal(sha(file),t.source_sha256);
  const source=read(file);
  for(const image of source.images){
   const bytes=Buffer.from(image.dataUrl.slice(image.dataUrl.indexOf(',')+1),'base64');
   assert.equal(C.bytesHash(bytes),image.sha256,'image bytes hash mismatch');assert.equal(bytes.length,image.bytes);images++;
  }
  const prepared=I.prepare(source),identity=K.identity(prepared,versions.versions);
  for(const field of K.required)if(!['schema_hash','prompt_hash','criteria_payload_hash'].includes(field))assert.equal(identity[field],t.identity[field],'source/math identity changed: '+field);
  const rendered=P.render(prepared),key=K.evaluationKey(identity);
  targets.push({...t,identity,evaluation_key:key,stage_request_ids:[1,2,3].map(s=>K.stageKey(key,s)),
   schema_hash:C.hash(S.forRegistry(prepared.registry)),rendered_input_hash:C.bytesHash(Buffer.from(rendered.text)),
   rendered_payload_hash:rendered.rendered_payload_hash,source_file:path.relative(base,file).replaceAll('\\','/')});
  source.images=source.images.map(({dataUrl,...small},index)=>{
   Object.defineProperty(small,'dataUrl',{enumerable:true,get(){return read(file).images[index].dataUrl;}});return small;
  });sources.push(source);
 }
 const calls=fs.readdirSync(old+'/batch/calls').filter(f=>f.endsWith('.json')).map(f=>read(old+'/batch/calls/'+f));
 assert.equal(calls.length,4);
 const planned=X.plan(sources,versions.versions,calls);
 const inventory=read(base+'/existing-intent-inventory.json');
 assert.equal(inventory.locks.filter(l=>l.alive||l.unexpired).length,0,'existing active lease');
 const keys=new Set(targets.flatMap(t=>[t.evaluation_key,...t.stage_request_ids]));
 for(const file of inventory.intent_paths){
  const name=path.basename(file).replace(/\.intent\.json$/,'');
  assert(!keys.has(name),'existing candidate evaluation intent: '+name);
 }
 const additions=['scripts/difficulty-v122-continuation.cjs','scripts/prepare-difficulty-v122-continuation.cjs',
  'scripts/run-difficulty-v122-continuation.cjs','tests/difficulty-v122-continuation.test.cjs'];
 const code=Object.fromEntries([...new Set([...Object.keys(prior.code),...additions])].sort().map(f=>[f,sha(root+'/'+f)]));
 const bundleHash=C.hash(code),commit=cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
 const snapshot={...original,created_at:new Date().toISOString(),successor_commit:commit,bundle_hash:bundleHash,
  criteria_payload_hash:versions.versions.criteria_payload_hash,identities_hash:C.hash(targets.map(t=>t.identity)),targets,
  parent_snapshot:{path:old+'/target-snapshot.json',sha256:sha(old+'/target-snapshot.json')},
  contract_candidate:true,batch_manifest_hash:planned.snap.hash,continuation_hash:planned.continuation_hash};
 save('target-snapshot.json',snapshot);
 for(const r of calls)save('imported-calls/'+r.request_id+'.json',r);
 save('continuation-plan.json',planned.continuation);
 save('preflight.json',{at:new Date().toISOString(),frozen_parent_verified:true,source_files_verified:targets.length,
  images_verified:images,source_math_identities_preserved:true,staging_write_verified:true,
  current_catalog_read_only_check:{latest_count:1266,eligible:targets.length,excluded:14,matched:true,
   core_hash:'a681501cf1ef864d6f19a0de94544d2d2adaf4a57b0c92cf378683cf2748aae5',
   approved_review_hash:'a164081a90a5796f7715db1ba68f5cec746755f521181214020cdf1d99fa84bc'},
  authentication_check:{account_type:'chatgpt',plan:'pro',ordinaryUsageAllowed:true,
   exact_bindings:[{model:'gpt-6-luna',effort:'medium'},{model:'gpt-6.1-sol',effort:'medium'},{model:'gpt-6.1-sol',effort:'high'}],
   checked_in_current_turn:true,token_material_saved:false},
  production_write_protection:'Local-only file ledger and checkpoint; subscription process read-only sandbox, no deployment or database writer.',
  approved_for_full_rollout:false,productionWrites:0,deployments:0,computerUse:0});
 save('execution-bundle.json',{source_commit:commit,parent_commit:original.successor_commit,
  parent_bundle_hash:original.bundle_hash,parent_criteria_payload_hash:original.criteria_payload_hash,
  bundle_hash:bundleHash,criteria_payload_hash:snapshot.criteria_payload_hash,code,
  snapshot_sha256:sha(base+'/target-snapshot.json'),batch_manifest_hash:planned.snap.hash,continuation_hash:planned.continuation_hash,
  adopted_records:planned.continuation.adopted.map(a=>({request_id:a.prior_request_id,hash:a.prior_record_hash})),
  user_authorization:'2026-10-21: minimal contract fix then resume original staging-only evaluation plan.',
  source_role_change:false,mathematical_criteria_change:false,automatic_retries:0,
  approved_for_full_rollout:false,productionWrites:0,deployments:0});
 console.log(JSON.stringify({targets:targets.length,images,adopted:calls.length,bundleHash,commit,
  batch:planned.snap.hash,criteria:snapshot.criteria_payload_hash,base}));
}
if(require.main===module)main();
