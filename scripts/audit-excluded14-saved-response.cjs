'use strict';
require('../tests/offline-guard.cjs');
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),C=require('../app/difficulty-v122/canonical.cjs'),I=require('../app/difficulty-v122/input.cjs'),B=require('../app/difficulty-v122/response-contract.cjs'),X=require('../app/difficulty-v122/explicit-adapter.cjs');
const root=path.resolve(__dirname,'..'),dir=root+'/artifacts/excluded14-evaluation-20261023',read=f=>JSON.parse(fs.readFileSync(f)),plan=read(dir+'/call-plan.json'),cp=read(dir+'/control/checkpoint.json'),checks=[];
for(const r of Object.values(cp.results).filter(r=>r.status==='complete').map(r=>read(r.record))){
 const t=plan.targets.find(t=>t.question_id===r.question_id),p=I.prepare(read(t.source_file)),m=read(dir+'/relations/'+r.question_id+'.json'),roles=new Map(m.relations.map(e=>[e.alias,e.role])),evaluate=raw=>X.evaluateResponse(raw,p.payload,B.bind(p,r.request_id),r.request_id);
 assert.equal(C.hash(evaluate(r.call.raw).computed),C.hash(r.computed));
 function reject(name,mutate,reason){const raw=structuredClone(r.call.raw);mutate(raw);const v=evaluate(raw).validation;assert.equal(v.valid,false,name);if(reason)assert.match(v.detail,reason);checks.push({question_id:r.question_id,stage:r.stage,request_id:r.request_id,name,rejected:true,reason:v.detail,original_raw_hash:C.hash(r.call.raw)});}
 reject('unknown evidence relation',raw=>Object.values(raw.routes)[0].discoveries[0].evidence_relation_id='unknown-relation',/relation/i);
 for(const [alias,route]of Object.entries(r.call.raw.routes)){
  for(const d of route.discoveries.filter(d=>['answer_aggregation','optional_illustration'].includes(roles.get(d.evidence_relation_id))))reject(roles.get(d.evidence_relation_id)+' cannot be a mathematical conclusion',raw=>raw.routes[alias].conclusions.push(d.id),/conclusion missing\/excluded/);
  const shared=route.discoveries.find(d=>roles.get(d.evidence_relation_id)==='shared_premise'&&d.premise_source_id===null);
  if(shared){
   reject('shared premise alias cannot duplicate workload',raw=>{const duplicate=structuredClone(shared);duplicate.id='negative-alias';duplicate.premise_source_id=shared.id;duplicate.depends_on=[];duplicate.dependency_semantics='none';duplicate.work={...duplicate.work,calculation_steps:1,calculation_depends_on:[],required_case_count:0,choice_check_count:0};raw.routes[alias].discoveries.push(duplicate);},/alias.*workload/);
   reject('shared premise alias must bind its source identity',raw=>{raw.routes[alias].discoveries.find(d=>d.id===shared.id).premise_source_id='nonexistent';},/alias source identity mismatch/);
  }
 }
}
assert(checks.some(x=>x.name.includes('optional_illustration')));assert(checks.some(x=>x.name.includes('answer_aggregation')));assert(checks.some(x=>x.name.includes('duplicate workload')));
const out={at:new Date().toISOString(),checked_saved_complete_calls:Object.values(cp.results).filter(r=>r.status==='complete').length,negative_tests:checks.length,failed:0,checks,live_ai_calls:0,mutations_saved_to_originals:false};
fs.writeFileSync(dir+'/saved-response-negative-audit.json',C.json(out),{flag:'wx'});console.log(JSON.stringify({...out,checks:undefined}));
