'use strict';
// Source metadata only. Never infer a span from text or change mathematical axes.
const C=require('./canonical.cjs'),Source=require('./source.cjs');
const version='atomic-evidence-relations-r1';
const roleFields={shared_premise:'shared_premise_ids',optional_illustration:'optional_explanation_ids',answer_aggregation:'answer_aggregation_ids'};
const roleNamespaces={shared_premise:'shared_premise_id',optional_illustration:'optional_explanation_id',answer_aggregation:'answer_aggregation_id'};
const systemFields=['source_span_ids',...Object.values(roleFields)];
function build(registry){
 Source.verify(registry);
 const scope=Object.fromEntries(['question_id','revision_id','difficulty_basis_hash','source_manifest_hash'].map(k=>[k,registry[k]]));
 const relations=[];
 for(const b of registry.basis_steps){
  for(const role of b.allowed_roles){
   // A shared source has one canonical relation, independent of branch count.
   const branches=role==='shared_premise'?[null]:b.allowed_target_ids;
   for(const branch of branches){
    const value={...scope,basis_step_id:b.id,source_span_ids:[b.source_span_id],role,route_id:b.approved_route_id,
     branch_id:branch,allowed_branch_ids:branch?[branch]:[...b.allowed_target_ids],
     role_source_ids:roleNamespaces[role]?registry.entries.filter(e=>e.namespace===roleNamespaces[role]&&e.basis_step_id===b.id).map(e=>e.id):[]};
    relations.push({evidence_relation_id:'evidence_relation_id:'+C.hash({version,...value}),...value});
   }
  }
 }
 const value={version,...scope,relations};
 return {...value,evidence_manifest_hash:C.hash(value)};
}
function verify(manifest,registry){
 if(C.hash(manifest)!==C.hash(build(registry)))throw Error('evidence relation manifest mismatch');
 return true;
}
function wire(raw){
 const v=JSON.parse(JSON.stringify(raw));
 if(v.evidence_contract_version===version)for(const r of v.viable_routes||[])for(const d of r.critical_discoveries||[])
  for(const field of systemFields)delete d[field]; // Optional display data is never authority.
 return v;
}
function normalize(raw,context,{legacy=false}={}){
 const manifest=context.evidence_relations;verify(manifest,context.source_registry);
 const v=JSON.parse(JSON.stringify(raw)),resolved=[];
 if(!legacy&&v.evidence_contract_version!==version)throw Error('evidence contract version missing');
 delete v.evidence_contract_version;
 const byId=new Map(manifest.relations.map(r=>[r.evidence_relation_id,r]));
 for(const route of v.viable_routes){
  const sharedOwners=new Map();
  for(const d of route.critical_discoveries){
   const selected=d.evidence_relation_ids||[];
   if(new Set(selected).size!==selected.length)throw Error('duplicate evidence relation');
   const explicit=selected.map(id=>{const r=byId.get(id);if(!r)throw Error('unknown or foreign evidence relation');return r;});
   for(const r of explicit){
    if(!d.basis_step_ids.includes(r.basis_step_id)||r.role!==d.role||r.route_id!==route.approved_route_id||
     !r.allowed_branch_ids.includes(d.target_statement_id))throw Error('evidence relation route/branch/role mismatch');
   }
   const bound=d.basis_step_ids.map(id=>{
    const candidates=manifest.relations.filter(r=>r.basis_step_id===id&&r.role===d.role&&r.route_id===route.approved_route_id);
    const chosen=explicit.filter(r=>r.basis_step_id===id);
    if(chosen.length>1)throw Error('multiple evidence relations for one basis step');
    const scoped=candidates.filter(r=>r.allowed_branch_ids.includes(d.target_statement_id));
    // Legacy combinations have already passed the unchanged strict source audit.
    // Resolve only an exact, unique basis/role/route/target tuple. No role,
    // target, source span or dependency is inferred or repaired.
    const r=chosen[0]||(scoped.length===1&&scoped[0]);
    if(!r||!r.allowed_branch_ids.includes(d.target_statement_id))throw Error(candidates.length>1?'explicit evidence relation required':'basis evidence unavailable for branch');
    return r;
   });
   if(!bound.length)throw Error('basis evidence missing');
   const spans=[...new Set(bound.flatMap(r=>r.source_span_ids))];
   if(legacy&&C.hash([...d.source_span_ids].sort())!==C.hash([...spans].sort()))throw Error('legacy basis/source combination mismatch');
   d.source_span_ids=spans;
   for(const f of Object.values(roleFields))d[f]=[];
   if(roleFields[d.role])d[roleFields[d.role]]=[...new Set(bound.flatMap(r=>r.role_source_ids))];
   if(d.role==='shared_premise'){
    if(!legacy&&d.premise_source_id!==null)throw Error('new shared premise must reference canonical discovery directly');
    for(const r of bound){
     if(d.premise_source_id===null){
      if(sharedOwners.has(r.evidence_relation_id))throw Error('duplicate canonical shared premise discovery');
      sharedOwners.set(r.evidence_relation_id,d.id);
     }else if(sharedOwners.get(r.evidence_relation_id)!==d.premise_source_id)throw Error('shared premise alias is not canonical owner');
    }
   }
   resolved.push({route_id:route.approved_route_id,discovery_id:d.id,target_statement_id:d.target_statement_id,
    evidence_relation_ids:bound.map(r=>r.evidence_relation_id),binding:legacy?'strict_legacy_normalization':explicit.length?'explicit_relation':'unique_system_binding'});
   delete d.evidence_relation_ids;
  }
 }
 return {raw:v,resolved,manifest_hash:manifest.evidence_manifest_hash};
}
module.exports={version,build,verify,wire,normalize,systemFields};
