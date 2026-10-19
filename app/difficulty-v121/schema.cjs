'use strict';
const Legacy=require('../difficulty-v12/schema.cjs'),Scorer=require('./scorer.cjs'),Answer=require('./answer.cjs');
const {hash}=require('../difficulty-v12/input.cjs');
const schema=structuredClone(Legacy.schema),str={type:'string'},prob={type:'number',minimum:0,maximum:1};
const additions={spec_revision:{type:'string',enum:['1.2.1']},derived_answer:str,
 answer_type:{type:'string',enum:['multiple_choice','numeric','expression','proof','descriptive','unknown']},
 solution_summary:str,solution_validated:{type:'boolean'},answer_confidence:prob,
 literacy_evidence_type:{type:'string',enum:['','a','b','c','d'],description:'a parsing; b expression matching; c working memory overload; d proof/proof blanks formal literacy burden; never automatic'},
 image_evidence_status:{type:'string',enum:['sufficient','not_required','unclear']},
 assessment_uncertainty:{type:'array',items:{type:'string',enum:['gate_ambiguity','solution_unresolved','source_ambiguity','scope_ambiguity']}}};
Object.assign(schema.properties,additions);schema.required.push(...Object.keys(additions));
// Route E is shared, so a branch cannot quietly replace it with a smaller E.
delete schema.properties.viable_routes.items.properties.independent_branches.items.properties.execution_load;
schema.properties.viable_routes.items.properties.independent_branches.items.required=['branch_id','critical_discoveries'];
function structural(v,node=schema,at='$'){
 if(node.type==='object'){if(!v||typeof v!=='object'||Array.isArray(v))throw Error(at+' object required');for(const k of node.required)if(!Object.hasOwn(v,k))throw Error(at+'.'+k+' missing');const out={};for(const [k,n]of Object.entries(node.properties))out[k]=structural(v[k],n,at+'.'+k);return out;}
 if(node.type==='array'){if(!Array.isArray(v))throw Error(at+' array required');return v.map((x,i)=>structural(x,node.items,at+'['+i+']'));}
 if(node.type==='integer'?!Number.isInteger(v):typeof v!==node.type)throw Error(at+' type invalid');
 if(typeof v==='number'&&(!Number.isFinite(v)||v<(node.minimum??-Infinity)||v>(node.maximum??Infinity)))throw Error(at+' range invalid');
 if(node.enum&&!node.enum.includes(v))throw Error(at+' enum invalid');return v;
}
function evaluate(raw,context={},options={}){
 const fail=(reason,detail)=>({raw:structuredClone(raw??null),validation:{valid:false,solution_validated:false,reason,detail},computed:{status:'failed',score:null,problem_tier:null,confidence:0,reason,detail,scorer_version:Scorer.version}});
 let v;try{v=structural(raw);}catch(e){return fail('schema_invalid',e.message);}
 if(!v.reference_student_match)return fail('reference_student_mismatch');
 if(!v.curriculum_scope.trim()||!context.scope||!Answer.scopeCompatible(v.curriculum_scope,context.scope))return fail('curriculum_scope_mismatch');
 if(v.confidence<.7||v.answer_confidence<.7)return fail('confidence_below_0.7');
 if(!v.solution_summary.trim()||!v.short_reason.trim())return fail('solution_evidence_missing');
 if(v.assessment_uncertainty.length)return fail('assessment_uncertain',v.assessment_uncertainty.join(','));
 // An attached source image and an image-dependent solution are different facts.
 // not_required is allowed when the independent solution needs only the text;
 // missing required attachments and explicitly unclear evidence still fail.
 if(v.image_evidence_status==='unclear'||context.requiresImage&&!context.imageCount)return fail('image_evidence_missing');
 if(v.literacy_high&&(!v.literacy_evidence.trim()||!v.literacy_evidence_type))return fail('literacy_evidence_missing');
 try{
  const routes=v.viable_routes.map(r=>({...r,independent_branches:r.independent_branches.map(b=>({...b,execution_load:null}))}));
  Legacy.raw({...v,viable_routes:routes});
  for(const r of v.viable_routes){if(!r.route_summary.trim())throw Error('route summary missing');for(const d of [...r.critical_discoveries,...r.independent_branches.flatMap(b=>b.critical_discoveries)])if(!d.summary.trim())throw Error('discovery summary missing');}
  const computed=Scorer.scoreProblem(v.viable_routes,v.literacy_high);if(computed.status!=='complete')return fail(computed.reason);
  const answer=Answer.verify(v.derived_answer,context.storedAnswer,{answerType:v.answer_type,choices:context.choices});
  if(!answer.valid){
   // Free-form proof equivalence cannot be established by fuzzy string matching.
   // The local audit may supply a separately reviewed, immutable evidence record.
   // It cannot override a different scalar/option, uncertainty, image/graph error,
   // confidence or scope checks. The model's raw JSON cannot authorize itself.
   const review=options.answerReview;
   if(answer.reason!=='answer_equivalence_unverified'||review?.method!=='local_mathematical_equivalence_review'||review.decision!=='equivalent'||review.rawHash!==hash(raw)||review.contextHash!==hash(context)||!review.rationale?.trim())return fail(answer.reason);
   return {raw:structuredClone(raw),validation:{valid:true,solution_validated:true,reason:'reviewed_answer_equivalence',answerReviewHash:hash(review)},computed};
  }
  return {raw:structuredClone(raw),validation:{valid:true,solution_validated:true,reason:answer.reason},computed};
 }catch(e){return fail('graph_or_scorer_invalid',e.message);}
}
module.exports={schema,structural,evaluate};
