'use strict';
// First prerequisite of stored-response replay: every previously approved target
// must resolve to an input-issued target. Never infer a target from a model score.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const C=require('../app/difficulty-v122/canonical.cjs'),Input=require('../app/difficulty-v122/input.cjs');
const Legacy=require('../app/difficulty-v122/legacy-resolver.cjs');
const out=path.resolve(__dirname,'../artifacts/difficulty-v122-rc1');
const parent=path.join(out,'baseline/shindong-m2-three-stage-20261020');
const manifest=JSON.parse(fs.readFileSync(path.join(parent,'manifest.json')));
const checks=[];
let failure=null;
for(const item of manifest){
 const contextFile=path.join(parent,item.contextFile),contextBytes=fs.readFileSync(contextFile);
 const context=JSON.parse(contextBytes);
 const finalFile=path.join(parent,'run-three-stage',item.id,'final.json'),finalBytes=fs.readFileSync(finalFile);
 const final=JSON.parse(finalBytes);
 const responseFile=path.join(parent,'run-three-stage',item.id,'stage-'+final.finalStage,'result.json');
 const responseBytes=fs.readFileSync(responseFile),response=JSON.parse(responseBytes);
 const evidence={number:item.number,question_id:item.id,revision_id:item.revisionId,
  context_sha256:C.bytesHash(contextBytes),response_sha256:C.bytesHash(responseBytes),final_sha256:C.bytesHash(finalBytes)};
 try{
  assert.equal(C.bytesHash(contextBytes),item.contextHash,'stored context hash changed');
  assert.equal(final.status,'complete','reference final must be complete');
  assert.equal(response.status,'complete','reference stage must be complete');
  const prepared=Input.prepare({question_id:item.id,revision_id:item.revisionId,question:context.question,
   scope:context.scope_context,difficulty_basis:context.difficulty_basis,difficulty_basis_hash:context.difficulty_basis_hash,
   difficulty_basis_source:context.difficulty_basis_source,approved_routes:context.approved_routes,images:[]});
  for(const route of response.raw.viable_routes){
   const approved=prepared.registry.approved_routes.find(r=>r.original_route_id===route.approved_route_id);
   assert(approved,'stored approved route missing');
   for(const target of route.targets){
    const mapping=Legacy.resolve(target.source_quote,prepared.registry.targets,{label:target.target_statement_id});
    if(mapping.status!=='resolved'){
     failure={...evidence,error:'saved_target_reference_unresolved',approved_route:route.approved_route_id,
      target_statement_id:target.target_statement_id,source_quote:target.source_quote,mapping,
      generated_targets:prepared.registry.targets.map(t=>({id:t.id,label:t.label,text:t.text})),
      original_score:final.computed.score,original_tier:final.computed.problem_tier};
     break;
    }
   }
   if(failure)break;
  }
  if(failure)break;
  checks.push({...evidence,pass:true});
 }catch(e){failure={...evidence,error:e.message};break;}
}
const report={at:new Date().toISOString(),gate:'stored_accepted_response_target_identity_replay',
 total:manifest.length,passed:checks.length,failed:failure?1:0,
 untested:manifest.length-checks.length-(failure?1:0),first_failure:failure,checks,
 score_replay_completed:false,actualAIcalls:0,productionWrites:0,computerUse:0};
fs.writeFileSync(path.join(out,'saved-target-preflight.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,checks:undefined},null,2));
if(failure)process.exitCode=1;
