'use strict';
const revision='difficulty-v1.2.2-rc1',policy='luna-medium-sol-medium-structural-high-r3';
const str={type:'string'},bool={type:'boolean'},axis={type:'integer',minimum:0,maximum:4},count={type:'integer',minimum:0};
const arr=(items,minItems=0)=>({type:'array',items,minItems}),obj=p=>({type:'object',additionalProperties:false,properties:p,required:Object.keys(p)}),en=(...values)=>({type:'string',enum:values}),nullable=s=>({anyOf:[s,{type:'null'}]});
const fact=obj({applies:bool,evidence:str,non_trigger_reason:str,direct_clue_quote:str});
const structure=obj(Object.fromEntries(['uncued_auxiliary_or_intermediate_structure','multiple_plausible_constructions','direct_clue_absent','hint_makes_remaining_route_routine'].map(k=>[k,fact])));
const discovery=obj({id:str,step_kind:en('critical_discovery','theorem_application','relation_transfer','algebraic_transformation','arithmetic','choice_check'),summary:str,C:axis,R:axis,B:axis,H:axis,depends_on:arr(str),dependency_semantics:en('all_required','alternative','none'),is_non_obvious:bool,relation_kind:str,structure_key:str,basis_quote:str,clue_in_text:str,must_construct:str,hint_effect:str,structure_audit:structure});
const execution=obj({raw_case_count:count,raw_sequential_step_count:count,compressed_case_count:nullable(count),compressed_sequential_step_count:nullable(count),compression_method:str,compression_basis_quote:str,compression_is_approved_in_basis:bool,requires_table_or_systematic_listing:bool,requires_restart_or_recount:bool,requires_repeated_substitution:bool,execution_extreme:bool,execution_evidence:str,execution_non_trigger_reason:str});
const branch=obj({branch_id:str,discovery_ids:arr(str,1),conclusion_ids:arr(str,1),execution_load:nullable(axis)});
const assembly=obj({triggered:bool,mode:en('none','chain','convergence'),member_ids:arr(str),merge_node_id:nullable(str),evidence:str,non_trigger_reason:str,review_signals:obj(Object.fromEntries([2,12,13,19,20,24,30].map(n=>['signal_'+n,bool])))});
const route=obj({route_id:str,approved_route_id:str,approved_route_source:str,route_is_official:bool,route_summary:str,uses_powerful_tool:bool,powerful_tool_reason:str,execution_load:axis,execution_audit:execution,independent_branches:arr(branch),conclusion_ids:arr(str,1),critical_discoveries:arr(discovery,3),route_floor_audit:obj({pure_formula_substitution_and_arithmetic:bool,same_relation_repetition_only:bool,independent_choice_checks_only:bool,evidence:str}),assembly_audit:assembly});
const common={applies:bool,evidence:str,non_trigger_reason:str,problem_level:bool};
const literacy=obj({
 a:obj({...common,nonstandard_rule_translation:bool,exception_clause_translation:bool}),
 b:obj({...common,symbolic_answer_requires_nontrivial_transform:bool,choice_matching_required:bool}),
 c:obj({...common,interdependent_condition_count:count,condition_reuse_stage_count:count,localizable_to_single_relation:bool,condition_evidence:arr(obj({condition_id:str,source_quote:str,reused_stage_refs:arr(str)})),localization_reason:str}),
 d:obj({...common,proof_blank_count:count,numbered_reason_tracking:bool,corresponding_points_tracking:bool,conclusion_to_premise_linking:bool,proof_order_vs_congruence_distinction:bool})
});

// Analysis slots remain intact; scoring consumes only source-linked required subgraphs.
Object.assign(discovery.properties,{
 target_statement_id:str,role:en('required_judgment','required_derivation','shared_premise','optional_illustration','answer_aggregation'),
 role_reason:str,premise_source_id:nullable(str),
 work:obj({choice_check_count:count,required_case_count:count,calculation_steps:count,calculation_depends_on:arr(str),evidence:str})
});discovery.required=Object.keys(discovery.properties);
delete route.properties.independent_branches;
route.properties.targets=arr(obj({target_statement_id:str,source_quote:str,conclusion_ids:arr(str,1)}),1);
route.properties.excluded_explanation_ids=arr(str);
route.required=Object.keys(route.properties);
// Raw mandatory counts are derived from node work, not supplied sentence counts.
delete execution.properties.raw_case_count;delete execution.properties.raw_sequential_step_count;
execution.required=Object.keys(execution.properties);
const schema=obj({construct:en('insight_bottleneck_difficulty'),spec_version:en('1.2'),spec_revision:en(revision),reference_student_match:bool,curriculum_scope:str,difficulty_basis_source:str,difficulty_basis_hash:str,approved_route_ids:arr(str,1),source_warning:arr(str),pre_solution_cues:obj({explicitly_cued_methods:arr(str),likely_initial_approaches:arr(str),likely_impasse:str,uncued_constructions_likely_needed:arr(str),source_only_evidence:arr(str)}),viable_routes:arr(route),diagnostic_unapproved_routes:arr(obj({route_summary:str,reason_unapproved:str})),literacy_audit:literacy,confidence:{type:'number',minimum:0,maximum:1,description:'Difficulty evidence stability only; no pass threshold.'},short_reason:str});
schema.properties.source_manifest_hash=str;
schema.required.push('source_manifest_hash');
for(const name of ['basis_step_ids','source_span_ids','shared_premise_ids','optional_explanation_ids','answer_aggregation_ids']){
 discovery.properties[name]=arr(str,['basis_step_ids','source_span_ids'].includes(name)?1:0);
 discovery.required.push(name);
}
route.properties.targets.items.properties.source_span_id=str;
route.properties.targets.items.required.push('source_span_id');
execution.properties.compression_basis_step_ids=arr(str);
execution.required.push('compression_basis_step_ids');
function modelSchema({legacy=false}={}){
 const s=JSON.parse(JSON.stringify(schema)),t=s.properties.viable_routes.items.properties.targets.items;
 delete s.properties.source_manifest_hash;s.required=s.required.filter(k=>k!=='source_manifest_hash');
 delete t.properties.conclusion_ids;t.required=t.required.filter(k=>k!=='conclusion_ids');
 t.properties.conclusion_discovery_id={type:'string',description:'Select the id of a discovery actually declared in this route critical_discoveries with the same target_statement_id. Do not create an ID only for this reference.'};t.required.push('conclusion_discovery_id');
 if(!legacy){
  s.properties.evidence_contract_version=en(require('./evidence.cjs').version);s.required.push('evidence_contract_version');
  const d=s.properties.viable_routes.items.properties.critical_discoveries.items;
  for(const f of require('./evidence.cjs').systemFields){delete d.properties[f];d.required=d.required.filter(k=>k!==f);}
  d.properties.evidence_relation_ids=arr({type:'string'});d.required.push('evidence_relation_ids');
 }
 return s;
}
function forRegistry(registry,{legacy=false,withSystemRoles=false}={}){
 const s=modelSchema({legacy}),r=s.properties.viable_routes.items,d=r.properties.critical_discoveries.items;
 const ids=ns=>registry.entries.filter(e=>e.namespace===ns).map(e=>e.id);
 const constrain=(node,values)=>{if(!values.length)throw Error('Required source namespace is empty');node.enum=values;};
 const constrainArray=(node,values)=>{if(values.length)constrain(node.items,values);else if(node.minItems>0)throw Error('Required source namespace is empty');else node.maxItems=0;};
 constrain(r.properties.approved_route_id,ids('approved_route_id'));
 constrainArray(s.properties.approved_route_ids,ids('approved_route_id'));
 constrain(d.properties.target_statement_id,ids('target_statement_id'));
 constrain(r.properties.targets.items.properties.target_statement_id,ids('target_statement_id'));
 constrain(r.properties.targets.items.properties.source_span_id,ids('source_span_id'));
 for(const [field,ns]of [['basis_step_ids','basis_step_id'],['source_span_ids','source_span_id'],['shared_premise_ids','shared_premise_id'],['optional_explanation_ids','optional_explanation_id'],['answer_aggregation_ids','answer_aggregation_id']])if(d.properties[field])constrainArray(d.properties[field],ids(ns));
 if(!legacy)constrainArray(d.properties.evidence_relation_ids,require('./evidence.cjs').build(registry).relations.map(r=>r.evidence_relation_id));
 constrainArray(r.properties.execution_audit.properties.compression_basis_step_ids,ids('basis_step_id'));

 if(!legacy&&!withSystemRoles){
  if(require('./projection-role-overlay.cjs').forRegistry(registry)){
   // Preserve the separately approved, system-owned role contract exactly.
   for(const f of ['role','role_reason','premise_source_id']){delete d.properties[f];d.required=d.required.filter(k=>k!==f);}
  }else{
   const W=require('./wire-contract.cjs');W.constrain(d,registry);
   s.properties.viable_routes.items=W.scopeRoutes(r,registry);
  }
 }
 return s;
}
module.exports={schema,revision,policy,forRegistry,modelSchema};
