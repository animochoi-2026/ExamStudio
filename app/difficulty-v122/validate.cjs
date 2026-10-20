'use strict';
const {schema}=require('./schema.cjs'),S=require('./scorer.cjs');
const ignored=new Set(['move_class','base_tier','final_tier','problem_tier','score','final_score','selected_route_id','promotions']);
function sanitized(v){if(Array.isArray(v))return v.map(sanitized);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([k])=>!ignored.has(k)).map(([k,x])=>[k,sanitized(x)]));return v;}
function structural(v,n=schema,p='$'){
 if(n.anyOf){if(v===null&&n.anyOf.some(x=>x.type==='null'))return;return structural(v,n.anyOf[0],p);}
 if(n.type==='object'){if(!v||typeof v!=='object'||Array.isArray(v))throw Error(p+' object required');for(const k of n.required)if(!Object.hasOwn(v,k))throw Error(p+'.'+k+' missing');if(n.additionalProperties===false)for(const k of Object.keys(v))if(!Object.hasOwn(n.properties,k))throw Error(p+'.'+k+' unexpected');for(const [k,s]of Object.entries(n.properties))if(Object.hasOwn(v,k))structural(v[k],s,p+'.'+k);return;}
 if(n.type==='array'){if(!Array.isArray(v)||v.length<(n.minItems||0))throw Error(p+' array minItems');v.forEach((x,i)=>structural(x,n.items,p+'['+i+']'));return;}
 if(n.type==='integer'?!Number.isInteger(v):typeof v!==n.type)throw Error(p+' type invalid');if(typeof v==='number'&&(!Number.isFinite(v)||v<(n.minimum??-Infinity)||v>(n.maximum??Infinity)))throw Error(p+' range invalid');if(n.enum&&!n.enum.includes(v))throw Error(p+' enum invalid');
}
function text(s,name){if(!s.trim())throw Error(name+' evidence/reason missing');}
function audit(v,context){
 if(v.difficulty_basis_hash!==context.difficulty_basis_hash)throw Error('basis hash mismatch');
 if(JSON.stringify([...v.approved_route_ids].sort())!==JSON.stringify(context.approved_routes.map(x=>x.route_id).sort()))throw Error('approved route manifest mismatch');
 const approved=new Map(context.approved_routes.map(x=>[x.route_id,x])),ids=new Set(),represented=new Set();
 for(const r of v.viable_routes){
  if(ids.has(r.route_id))throw Error('duplicate route ID');ids.add(r.route_id);text(r.route_summary,'route');
  const a=approved.get(r.approved_route_id);
  if(a&&r.route_is_official){if(represented.has(a.route_id))throw Error('approved route duplicated');represented.add(a.route_id);if(r.approved_route_source!==a.source)throw Error('route source mismatch');}
  for(const d of r.critical_discoveries){
   text(d.summary,'step');text(d.role_reason,'role');text(d.work.evidence,'work');text(d.relation_kind,'relation kind');
   if(d.depends_on.length===0&&d.dependency_semantics!=='none'||d.depends_on.length>0&&d.dependency_semantics==='none')throw Error('dependency semantics mismatch');
   for(const [k,x]of Object.entries(d.structure_audit)){text(x.applies?x.evidence:x.non_trigger_reason,'structure '+k);if(!x.applies)text(x.direct_clue_quote,'structure direct source clue');}
  }
  const ex=r.execution_audit;text(ex.execution_evidence,'execution quantities');if(!ex.execution_extreme)text(ex.execution_non_trigger_reason,'execution non-trigger');text(r.route_floor_audit.evidence,'route floor');
  text(r.assembly_audit.triggered?r.assembly_audit.evidence:r.assembly_audit.non_trigger_reason,'assembly');S.groups(r);
 }
 // Every fixed approved alternative must be considered; an invented route cannot replace it.
 for(const id of approved.keys())if(!represented.has(id))throw Error('approved route omitted '+id);
 const stageIds=new Set(v.viable_routes.flatMap(r=>r.critical_discoveries.map(d=>r.route_id+':'+d.id)));
 for(const [k,a]of Object.entries(v.literacy_audit)){if(!a.problem_level)throw Error('literacy must be problem level');text(a.applies?a.evidence:a.non_trigger_reason,'literacy '+k);}
 const c=v.literacy_audit.c,conditionIds=new Set();
 for(const d of c.condition_evidence){if(conditionIds.has(d.condition_id))throw Error('duplicate condition');conditionIds.add(d.condition_id);text(d.source_quote,'condition source');for(const ref of d.reused_stage_refs)if(!stageIds.has(ref))throw Error('condition reuse stage missing');}
 if(c.localizable_to_single_relation)text(c.localization_reason,'localization reason');
}
function evaluate(raw,context){
 try{const v=sanitized(raw);structural(v);require('./references.cjs').audit(v,context);audit(v,context);}catch(e){return {validation:{valid:false,reason:'difficulty_structure_invalid',detail:e.message},computed:{status:'failed',score:null,problem_tier:null,reason:'difficulty_structure_invalid',detail:e.message}};}
 try{
  const v=sanitized(raw);
  for(const r of v.viable_routes)r.execution_audit.compression_source_verified=r.execution_audit.compression_is_approved_in_basis&&r.execution_audit.compression_basis_step_ids.length>0;
  const computed=S.score(v,context);return {validation:{valid:computed.status==='complete',reason:computed.reason||'difficulty_structure_valid'},computed};
 }catch(e){return {systemicFailure:true,validation:{valid:false,reason:'common_scorer_error',detail:e.message},computed:{status:'failed',score:null,problem_tier:null,reason:'common_scorer_error',detail:e.message}};}
}
const structuralReasons=new Set(['difficulty_structure_invalid','invalid_response','no_curriculum_compliant_routes','no_approved_routes']);
function confirmedFailure(r){
 const e=r.evidence;
 return r.computed?.reason==='subscription_execution_failed'&&e&&e.completed===false&&e.usage===null&&Number.isInteger(e.exitCode)&&e.exitCode!==0&&r.raw===null&&!r.rawResponseHash&&Array.isArray(e.errors)&&e.errors.some(x=>x.type==='turn.failed')&&e.errors.every(x=>['turn.failed','error'].includes(x.type)&&!/timeout|timed[\s_-]*out|result_unknown|outcome_unknown|unknown outcome|response.*lost|lost.*response|stream.*disconnect|connection|network|transport|request.*send|send.*request/i.test(x.message||''));
}
function nextStage(stage,r){
 if(r.status==='unresolved'||r.systemicFailure||stage>=3)return null;
 if(r.status==='complete')return stage===1&&Number(r.computed.problem_tier.slice(1))>=3?2:null;
 return r.status==='failed'&&(structuralReasons.has(r.computed?.reason)||confirmedFailure(r))?stage+1:null;
}

// Live adapters use this strict wire boundary. evaluate() remains the original
// canonical validator for versioned, already-stored internal responses.
function evaluateResponse(raw,context,binding,requestId){
 try{
  structural(sanitized(raw),require('./schema.cjs').forRegistry(context.source_registry));
  const normalized=require('./response-contract.cjs').normalize(raw,context,binding,requestId);
  return {...evaluate(normalized,context),system_fields:binding};
 }catch(e){return {validation:{valid:false,reason:'difficulty_structure_invalid',detail:e.message},
  computed:{status:'failed',score:null,problem_tier:null,reason:'difficulty_structure_invalid',detail:e.message}};}
}
module.exports={schema,structural,audit,evaluate,evaluateResponse,nextStage,confirmedFailure,sanitized};
