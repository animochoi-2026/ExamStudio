'use strict';
require('../tests/offline-guard.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),previous=path.resolve(root,'../../difficulty-v122-contract-offline/문제생성기');
const parent=path.resolve(root,'../../difficulty-v122-evidence-rc-20261021/문제생성기');
const base=path.join(root,'artifacts/difficulty-v122-contract-r2');
const C=require('../app/difficulty-v122/canonical.cjs'),I=require('../app/difficulty-v122/input.cjs');
const S=require('../app/difficulty-v122/schema.cjs'),V=require('../app/difficulty-v122/validate.cjs');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8')),sha=f=>C.bytesHash(fs.readFileSync(f));
function cases(){
 const folder=previous+'/artifacts/full-rollout-continuation-20261021',snap=read(folder+'/target-snapshot.json');
 return ['imported-calls','batch/calls'].flatMap(d=>fs.readdirSync(folder+'/'+d).map(f=>{
  const file=folder+'/'+d+'/'+f,call=read(file),t=snap.targets.find(t=>t.identity.question_id===call.identity.question_id);
  const sourceFile=path.resolve(folder,t.source_file);assert.equal(sha(sourceFile),t.source_sha256);
  assert.equal(C.hash(call.call.raw),call.envelope.raw_response_hash);
  const source=read(sourceFile);return {file,call,target:t,source,p:I.prepare(source)};
 }));
}
function preserve(){
 const frozen=read(parent+'/release/difficulty-v122-successor-overlay-20261021/release-candidate-frozen.json');
 for(const [f,h]of Object.entries(frozen.code))assert.equal(sha(parent+'/'+f),h);
 const original=read(previous+'/release/difficulty-v122-contract-offline-20261021/candidate-manifest.json');
 for(const [f,h]of Object.entries(original.preservation.protected_files))if(!f.endsWith('/evidence.cjs'))assert.equal(sha(root+'/'+f),h,f);
 const old=require(parent+'/app/difficulty-v122/evidence.cjs'),now=require('../app/difficulty-v122/evidence.cjs');
 for(const name of ['build','verify','wire'])assert.equal(now[name].toString(),old[name].toString(),name+' changed');
 const a=fs.readFileSync(parent+'/app/difficulty-v122/evidence.cjs','utf8');
 const b=fs.readFileSync(root+'/app/difficulty-v122/evidence.cjs','utf8');
 assert.equal(b,a.replace('    const r=chosen[0]||(legacy?scoped.length===1&&scoped[0]:candidates.length===1&&candidates[0]);',
  '    // Resolve only an exact, unique basis/role/route/target tuple. No role,\n    // target, source span or dependency is inferred or repaired.\n    const r=chosen[0]||(scoped.length===1&&scoped[0]);'));
 return {frozen_files:93,math_files_unchanged:true,source_roles_unchanged:true,evidence_change:'unique exact target-scoped binding only'};
}
function main(){
 fs.mkdirSync(base,{recursive:true});
 const preserved=preserve(),rows=[];
 for(const x of cases()){
  const before=C.hash(x.call.call.raw),r=V.evaluateResponse(x.call.call.raw,x.p.payload,x.call.envelope.system_fields,x.call.request_id);
  const old=require(previous+'/app/difficulty-v122/validate.cjs').evaluateResponse(x.call.call.raw,x.p.payload,x.call.envelope.system_fields,x.call.request_id);
  assert.deepEqual(r,old,'saved response outcome changed');assert.equal(C.hash(x.call.call.raw),before);
  const oldS=require(parent+'/app/difficulty-v122/schema.cjs');
  assert.deepEqual(S.forRegistry(x.p.registry,{withSystemRoles:true}),oldS.forRegistry(x.p.registry,{withSystemRoles:true}));
  const schema=S.forRegistry(x.p.registry);
  const out={question_id:x.call.identity.question_id,schema,raw:x.call.call.raw,status:r.computed.status,detail:r.validation.detail||null};
  fs.writeFileSync(base+'/'+x.call.request_id+'.schema-case.json',JSON.stringify(out));
  rows.push({question_id:x.call.identity.question_id,request_id:x.call.request_id,record_hash:C.hash(x.call),raw_hash:before,status:r.computed.status,score:r.computed.score,tier:r.computed.problem_tier||null});
 }
 const report={preserved,cases:rows.length,successes_unchanged:rows.filter(r=>r.status==='complete').length,
  failures_preserved:rows.filter(r=>r.status==='failed').length,original_raws_unchanged:true,new_ai_calls:0,rows};
 fs.writeFileSync(base+'/regression.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,rows:undefined}));
}
if(require.main===module)main();
module.exports={cases,preserve,base,previous,parent};
