'use strict';
// Read-only replay of accepted responses. Only lexical source references and
// schema-version annotations are migrated; model evidence and axes stay intact.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const C=require('../app/difficulty-v122/canonical.cjs'),Input=require('../app/difficulty-v122/input.cjs');
const Legacy=require('../app/difficulty-v122/legacy-resolver.cjs'),V=require('../app/difficulty-v122/validate.cjs');
const Schema=require('../app/difficulty-v122/schema.cjs');
const Shared=require('../app/difficulty-v122/legacy-shared-targets.cjs');
const out=path.resolve(__dirname,'../artifacts/difficulty-v122-rc1');
const parent=path.join(out,'baseline/shindong-m2-three-stage-20261020');
const manifest=JSON.parse(fs.readFileSync(path.join(parent,'manifest.json'))),results=[];
let failure=null;
const replayDir=path.join(out,'saved-response-replay');fs.mkdirSync(replayDir,{recursive:true});
function unique(quote,pool,where){
 const mapping=Legacy.resolve(quote,pool);
 if(mapping.status!=='resolved')throw Object.assign(Error('legacy_reference_unresolved'),{detail:{where,quote,mapping}});
 return pool.find(e=>e.id===mapping.matched_id);
}
for(const item of manifest){
 const contextBytes=fs.readFileSync(path.join(parent,item.contextFile)),context=JSON.parse(contextBytes);
 const finalFile=path.join(parent,'run-three-stage',item.id,'final.json'),finalBytes=fs.readFileSync(finalFile),final=JSON.parse(finalBytes);
 const stageFile=path.join(parent,'run-three-stage',item.id,'stage-'+final.finalStage,'result.json');
 const stageBytes=fs.readFileSync(stageFile),stage=JSON.parse(stageBytes);
 const evidence={number:item.number,question_id:item.id,revision_id:item.revisionId,
  raw_file_sha256:C.bytesHash(stageBytes),raw_hash:C.hash(stage.raw),context_sha256:C.bytesHash(contextBytes),
  final_sha256:C.bytesHash(finalBytes),original_score:final.computed.score,original_tier:final.computed.problem_tier};
 try{
  assert.equal(C.bytesHash(contextBytes),item.contextHash);
  assert.equal(final.status,'complete');assert.equal(stage.status,'complete');
  const prepared=Input.prepare({question_id:item.id,revision_id:item.revisionId,question:context.question,
   scope:context.scope_context,difficulty_basis:context.difficulty_basis,difficulty_basis_hash:context.difficulty_basis_hash,
   difficulty_basis_source:context.difficulty_basis_source,approved_routes:context.approved_routes,images:[]});
  const raw=structuredClone(stage.raw),registry=prepared.registry,sharedMappings=[];
  raw.spec_revision=Schema.schema.properties.spec_revision.enum[0];
  raw.source_manifest_hash=registry.source_manifest_hash;
  raw.approved_route_ids=prepared.payload.approved_route_ids;
  for(const route of raw.viable_routes){
   const approved=registry.approved_routes.find(r=>r.original_route_id===route.approved_route_id);
   assert(approved,'approved route missing');
   route.approved_route_id=approved.id;
   const targets=new Map();
   for(const target of route.targets){
    const entry=unique(target.source_quote,registry.targets,'target '+target.target_statement_id);
    targets.set(target.target_statement_id,entry);
    target.target_statement_id=entry.id;target.source_span_id=entry.source_span_id;
   }
   for(const node of route.critical_discoveries){
    const entry=unique(node.basis_quote,registry.basis_steps.filter(b=>b.approved_route_id===approved.id),'node '+node.id);
    let target=targets.get(node.target_statement_id);
    if(!target&&node.role==='shared_premise'&&node.target_statement_id==='main'){
     const shared=Shared.resolve(route,node,registry,entry);
     target=shared.target;sharedMappings.push(shared.provenance);
    }
    if(!target)throw Object.assign(Error('legacy_target_reference_unresolved'),{detail:{node:node.id,target:node.target_statement_id,role:node.role}});
    node.target_statement_id=target.id;
    node.basis_step_ids=[entry.id];node.source_span_ids=[entry.source_span_id];
    for(const [field,namespace,role]of [['shared_premise_ids','shared_premise_id','shared_premise'],
     ['optional_explanation_ids','optional_explanation_id','optional_illustration'],['answer_aggregation_ids','answer_aggregation_id','answer_aggregation']]){
     node[field]=node.role===role?registry.entries.filter(e=>e.namespace===namespace&&e.basis_step_id===entry.id).map(e=>e.id):[];
    }
   }
   const ex=route.execution_audit;
   ex.compression_basis_step_ids=ex.compression_is_approved_in_basis?
    [unique(ex.compression_basis_quote,registry.basis_steps.filter(b=>b.approved_route_id===approved.id),'compression').id]:[];
  }
  const evaluated=V.evaluate(raw,prepared.payload);
  fs.writeFileSync(path.join(replayDir,item.id+'.json'),JSON.stringify({evidence,sharedMappings,migrated_response:raw,evaluated},null,2)+'\n');
  if(!evaluated.validation.valid)throw Object.assign(Error(evaluated.validation.reason),{detail:evaluated.validation.detail});
  const compare=c=>({score:c.score,problem_tier:c.problem_tier,base_tier:c.base_tier,promotions:c.promotions,
   assembly_mode:c.assembly_mode,assembly_triggered:c.assembly_triggered,
   route_floor_applied:c.route_floor_applied,moves:c.moves});
  assert.deepEqual(compare(evaluated.computed),compare(final.computed),'accepted score/gate replay mismatch');
  results.push({...evidence,pass:true,sharedMappings,computed:evaluated.computed});
 }catch(e){failure={...evidence,error:e.message,detail:e.detail||null};break;}
}
const report={at:new Date().toISOString(),gate:'saved_accepted_response_canonical_replay',total:manifest.length,
 passed:results.length,failed:failure?1:0,untested:manifest.length-results.length-(failure?1:0),
 first_failure:failure,results,actualAIcalls:0,productionWrites:0,computerUse:0};
fs.writeFileSync(path.join(out,'saved-response-preflight.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,results:undefined},null,2));
if(failure)process.exitCode=1;
