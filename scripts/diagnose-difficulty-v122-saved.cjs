'use strict';
// Offline diagnostics only. Continue independent items and references; never
// fill missing mathematical roles, work counts, dependencies, or evidence.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const C=require('../app/difficulty-v122/canonical.cjs'),Input=require('../app/difficulty-v122/input.cjs');
const Legacy=require('../app/difficulty-v122/legacy-resolver.cjs'),Shared=require('../app/difficulty-v122/legacy-shared-targets.cjs');
const Aggregation=require('../app/difficulty-v122/legacy-aggregation-targets.cjs');
const V=require('../app/difficulty-v122/validate.cjs'),Schema=require('../app/difficulty-v122/schema.cjs');
const root=path.resolve(__dirname,'..'),base=path.join(root,'artifacts/difficulty-v122-rc1');
const authority=JSON.parse(fs.readFileSync('C:/Users/reals/Desktop/문제생성기/.git/examstudio-current.json'));
const original=path.join(authority.checkout,'artifacts/difficulty-v121');
function json(f){return JSON.parse(fs.readFileSync(f));}
function compare(c){return {score:c.score,problem_tier:c.problem_tier,base_tier:c.base_tier,promotions:c.promotions,
 assembly_mode:c.assembly_mode,assembly_triggered:c.assembly_triggered,route_floor_applied:c.route_floor_applied,moves:c.moves};}
function inspect(item,context,stage,final){
 const issues=[],mappings=[],raw=structuredClone(stage.raw);
 const add=(error,detail)=>issues.push({error,detail});
 const prepared=Input.prepare({question_id:item.id,revision_id:item.revisionId,question:context.question,scope:context.scope_context,
  difficulty_basis:typeof context.difficulty_basis==='string'?context.difficulty_basis:context.difficulty_basis.solution,difficulty_basis_hash:context.difficulty_basis_hash,
  difficulty_basis_source:context.difficulty_basis_source,approved_routes:context.approved_routes,images:[]});
 const registry=prepared.registry;
 function unique(quote,pool,where){
  const mapping=Legacy.resolve(quote,pool);
  if(mapping.status!=='resolved'){add('legacy_reference_unresolved',{where,quote,mapping});return null;}
  return pool.find(e=>e.id===mapping.matched_id);
 }
 const targetCheck=[];
 raw.spec_revision=Schema.schema.properties.spec_revision.enum[0];raw.source_manifest_hash=registry.source_manifest_hash;
 raw.approved_route_ids=prepared.payload.approved_route_ids;
 for(const route of raw.viable_routes){
  const approved=registry.approved_routes.find(r=>r.original_route_id===route.approved_route_id);
  if(!approved){add('approved_route_missing',{route:route.approved_route_id});continue;}
  route.approved_route_id=approved.id;
  if(!Array.isArray(route.targets)){
   add('legacy_required_projection_fields_missing',{route:route.route_id,missing:['targets','role','target_statement_id','premise_source_id','work'],
    existingFields:Object.keys(route),action:'No inferred roles, targets, or work quantities were inserted.'});continue;
  }
  const targets=new Map();
  for(const target of route.targets){
   const entry=unique(target.source_quote,registry.targets,'target '+target.target_statement_id);
   targetCheck.push({legacy:target.target_statement_id,pass:!!entry});
   if(entry){targets.set(target.target_statement_id,entry);target.target_statement_id=entry.id;target.source_span_id=entry.source_span_id;}
  }
  for(const node of route.critical_discoveries){
   const pool=registry.basis_steps.filter(b=>b.approved_route_id===approved.id);
   // An existing source role disambiguates overlapping annotated spans; it does
   // not grant that role to a span which never had it.
   const rolePool=pool.filter(b=>b.allowed_roles.includes(node.role));
   const roleMatch=Legacy.resolve(node.basis_quote,rolePool);
   const entry=unique(node.basis_quote,roleMatch.status==='resolved'?rolePool:pool,'node '+node.id);
   if(!entry)continue;
   let target=targets.get(node.target_statement_id);
   if(!target&&node.role==='shared_premise'&&node.target_statement_id==='main'){
    try{const mapped=Shared.resolve(route,node,registry,entry);target=mapped.target;mappings.push(mapped.provenance);}
    catch(e){add(e.message,{node:node.id,detail:e.detail});}
   }
   if(!target&&node.role==='answer_aggregation'&&node.target_statement_id==='main'){
    try{const mapped=Aggregation.resolve(route,node,registry,entry);target=mapped.target;mappings.push(mapped.provenance);}
    catch(e){add(e.message,{node:node.id,detail:e.detail});}
   }
   if(!target){add('legacy_target_reference_unresolved',{node:node.id,target:node.target_statement_id,role:node.role});continue;}
   if(!entry.allowed_roles.includes(node.role)||!entry.allowed_target_ids.includes(target.id))
    add('source_role_target_mismatch',{node:node.id,role:node.role,quote:node.basis_quote,basis_text:entry.text,
     allowed_roles:entry.allowed_roles,target:target.id,allowed_target_ids:entry.allowed_target_ids});
   node.target_statement_id=target.id;node.basis_step_ids=[entry.id];node.source_span_ids=[entry.source_span_id];
   for(const [field,namespace,role]of [['shared_premise_ids','shared_premise_id','shared_premise'],
    ['optional_explanation_ids','optional_explanation_id','optional_illustration'],['answer_aggregation_ids','answer_aggregation_id','answer_aggregation']])
    node[field]=node.role===role?registry.entries.filter(e=>e.namespace===namespace&&e.basis_step_id===entry.id).map(e=>e.id):[];
  }
  const ex=route.execution_audit;
  const compression=ex.compression_is_approved_in_basis?unique(ex.compression_basis_quote,registry.basis_steps.filter(b=>b.approved_route_id===approved.id),'compression'):null;
  ex.compression_basis_step_ids=compression?[compression.id]:[];
 }
 let evaluated=null,scoreComparison='blocked_by_dependency';
 if(!issues.length){
  evaluated=V.evaluate(raw,prepared.payload);
  if(!evaluated.validation.valid)add(evaluated.validation.reason,{detail:evaluated.validation.detail});
  else{
   try{assert.deepEqual(compare(evaluated.computed),compare(final.computed));scoreComparison='passed';}
   catch{scoreComparison='failed';add('accepted_score_gate_replay_mismatch',{before:compare(final.computed),after:compare(evaluated.computed)});}
  }
 }
 return {status:issues.length?'failed':'passed',issues,scoreComparison,targetCheck,sharedMappings:mappings,prepared,migrated_response:raw,evaluated};
}
function main(output){
 fs.mkdirSync(output,{recursive:true});
 const rows=[];
 const sets=[
  {school:'shindong',dir:path.join(base,'baseline/shindong-m2-three-stage-20261020')},
  {school:'shingu',dir:path.join(original,'shingu-direct-routing-fixed-20261020')}];
 const snapshotFiles={};
 for(const set of sets)for(const item of json(path.join(set.dir,'manifest.json'))){
  const row={school:set.school,number:item.number,question_id:item.id,revision_id:item.revisionId};
  try{
   const contextFile=path.join(set.dir,item.contextFile),finalFile=path.join(set.dir,'run-three-stage',item.id,'final.json');
   const final=json(finalFile),context=json(contextFile);
   for(const f of [contextFile,finalFile])snapshotFiles[f]=C.bytesHash(fs.readFileSync(f));
   assert.equal(C.bytesHash(fs.readFileSync(contextFile)),item.contextHash,'protected context hash mismatch');
   row.original_score=final.computed?.score;row.original_tier=final.computed?.problem_tier;
   if(final.status!=='complete'){
    row.status='blocked_by_dependency';row.issues=[{error:'accepted_final_missing',detail:{status:final.status,
     note:'Approved M2 reviewed projection must be linked separately; old failed or superseded output is not a final reference.'}}];
   }else{
    const stageFile=path.join(set.dir,'run-three-stage',item.id,'stage-'+final.finalStage,'result.json');
    snapshotFiles[stageFile]=C.bytesHash(fs.readFileSync(stageFile));
    const result=inspect(item,context,json(stageFile),final);
    fs.writeFileSync(path.join(output,item.id+'.json'),JSON.stringify(result,null,2)+'\n');
    Object.assign(row,{...result,prepared:undefined,migrated_response:undefined,evaluated:undefined});
   }
  }catch(e){row.status='failed';row.issues=[{error:e.message,detail:e.detail||null}];}
  rows.push(row);
 }
 const grouped={};
 for(const r of rows)for(const i of r.issues||[]){
  const g=grouped[i.error]||={occurrences:0,items:[]};g.occurrences++;
  if(!g.items.some(x=>x.question_id===r.question_id))g.items.push({school:r.school,number:r.number,question_id:r.question_id});
 }
 const report={at:new Date().toISOString(),total:rows.length,passed:rows.filter(r=>r.status==='passed').length,
  failed:rows.filter(r=>r.status==='failed').length,blocked:rows.filter(r=>r.status==='blocked_by_dependency').length,
  untested:0,scoreReplayBlocked:rows.filter(r=>r.scoreComparison==='blocked_by_dependency').length,
  grouped,rows,snapshotFiles,actualAIcalls:0,productionWrites:0};
 fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({...report,rows:undefined,snapshotFiles:undefined},null,2));
 return report;
}
module.exports={inspect,main};
if(require.main===module)main(path.resolve(process.argv[2]||path.join(base,'batch-preflight-20261020/diagnosis-0')));
