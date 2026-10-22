'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),C=require('../app/difficulty-v122/canonical.cjs'),I=require('../app/difficulty-v122/input.cjs'),B=require('../app/difficulty-v122/response-contract.cjs'),V=require('../app/difficulty-v122/validate.cjs'),E=require('../app/difficulty-v122/evidence.cjs');
const read=f=>JSON.parse(fs.readFileSync(f)),sha=f=>C.bytesHash(fs.readFileSync(f)),base='C:/Users/reals/.codex/worktrees/difficulty-v122-contract-r2/문제생성기/artifacts/full-rollout-contract-r2-20261021',dir=path.resolve(__dirname,'../artifacts/max-recovery-v123-20261022');
const protectedFiles={};function protect(f,h){const actual=sha(f);if(h)assert.equal(actual,h,f);protectedFiles[f]=actual;return read(f);}
const snapshot=protect(base+'/target-snapshot.json','a1d4622d9ecca5b7bc37039a82c63dc39b69f277800858ebf4207fcc2b5c336b'),targets=new Map(snapshot.targets.map(t=>[t.identity.question_id,t]));
function prepare(q){const t=targets.get(q);assert(t,'snapshot target missing');return I.prepare(protect(path.resolve(base,t.source_file),t.source_sha256));}
function normalized(record,p){let r=record;if(r.selected?.record_path)r=protect(r.selected.record_path,r.selected.record_sha256);let raw=r.normalized||r.system_evidence_relations?.raw,computed=r.computed||r.envelope?.computed;
 if(!raw&&r.call?.raw){const checked=V.evaluateResponse(r.call.raw,p.payload,B.bind(p,r.request_id),r.request_id);assert(checked.validation.valid,checked.validation.detail);raw=checked.system_evidence_relations.raw;}
 if(!raw&&(r.repair||r.review)){const original=protect(r.original_record_path||path.resolve(base,r.original_record_file),r.original_record_sha256);assert.equal(C.hash(original.call.raw),r.raw_response_hash);raw=B.normalize(original.call.raw,p.payload,B.bind(p,original.request_id),original.request_id);const review=r.repair||r.review;
  if(review.subrelations){for(const route of raw.viable_routes)route.critical_discoveries=route.critical_discoveries.map(d=>E.normalize({...raw,viable_routes:[{...route,critical_discoveries:[d]}]},p.payload).raw.viable_routes[0].critical_discoveries[0]);delete raw.evidence_contract_version;}
  else raw=E.normalize(raw,p.payload).raw;
  for(const c of review.changes||[]){const route=raw.viable_routes.find(x=>x.approved_route_id===c.route_id),target=route.targets.find(x=>x.target_statement_id===c.target_statement_id);assert.deepEqual(target.conclusion_ids,c.before);target.conclusion_ids=c.after;}
 }
 assert(raw,'normalized evidence missing');assert(computed,'computed missing');return {raw,computed,stored:r};
}
function identity(a,b){a={...require('../app/difficulty-v122/candidate-versions.json').versions,...a};const fields=['question_id','revision_id','question_content_hash','image_asset_hash','difficulty_basis_hash','approved_route_manifest_hash','source_manifest_hash','curriculum_scope_hash','scorer_hash','projection_hash'];for(const k of fields)assert.equal(a[k],b[k],'identity '+k);}
module.exports={fs,path,assert,C,I,B,V,E,read,sha,base,dir,snapshot,targets,protect,protectedFiles,prepare,normalized,identity};
