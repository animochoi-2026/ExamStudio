'use strict';
const S=require('./scorer.cjs');
const str={type:'string'},bool={type:'boolean'},int={type:'integer',minimum:0,maximum:4};
const arr=items=>({type:'array',items}),obj=properties=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)});
const discovery=obj({id:str,summary:str,C:int,R:int,B:int,H:int,depends_on:arr(str),is_non_obvious:bool,clue_in_text:str,must_construct:str,hint_effect:str});
const branch=obj({branch_id:str,critical_discoveries:arr(discovery),execution_load:{anyOf:[int,{type:'null'}]}});
const route=obj({route_id:str,route_summary:str,uses_powerful_tool:bool,execution_load:int,execution_extreme:bool,execution_evidence:str,parallel_branch_count:{type:'integer',minimum:1},independent_branches:arr(branch),critical_discoveries:arr(discovery)});
const schema=obj({construct:{type:'string',enum:['insight_bottleneck_difficulty']},spec_version:{type:'string',enum:['1.2']},reference_student_match:bool,curriculum_scope:str,literacy_high:bool,literacy_evidence:str,pre_solution_cues:obj({explicitly_cued_methods:arr(str),likely_initial_approaches:arr(str),likely_impasse:str}),viable_routes:arr(route),alternative_viable_routes_checked:{type:'integer',minimum:0},key_hint:str,estimated_post_hint_tier:{type:'string',enum:['T0','T1','T2','T3','T4','T5']},multiple_choice_execution_only:bool,confidence:{type:'number',minimum:0,maximum:1},short_reason:str});
// Pick only schema fields. Extraneous AI-derived scores are intentionally discarded.
function validate(value,node=schema,at='$'){
 if(node.anyOf){if(value===null&&node.anyOf.some(n=>n.type==='null'))return null;return validate(value,node.anyOf[0],at);}
 if(node.type==='object'){if(!value||typeof value!=='object'||Array.isArray(value))throw Error(at+' 객체 누락');const out={};for(const [key,n] of Object.entries(node.properties)){if(!(key in value))throw Error(at+'.'+key+' 누락');out[key]=validate(value[key],n,at+'.'+key);}return out;}
 if(node.type==='array'){if(!Array.isArray(value))throw Error(at+' 배열 필요');return value.map((v,i)=>validate(v,node.items,at+'['+i+']'));}
 if(node.type==='integer'?!Number.isInteger(value):typeof value!==node.type)throw Error(at+' 형식 오류');
 if(typeof value==='number'&&(!Number.isFinite(value)||value<(node.minimum??-Infinity)||value>(node.maximum??Infinity)))throw Error(at+' 범위 오류');if(node.enum&&!node.enum.includes(value))throw Error(at+' 허용값 오류');return value;
}
function raw(value){const v=validate(value);if(!v.reference_student_match||!v.curriculum_scope.trim())throw Error('기준 학생/교과 범위 불일치');if(v.literacy_high&&!v.literacy_evidence.trim())throw Error('문해력 근거 누락');const ids=new Set();for(const r of v.viable_routes){if(!r.route_id.trim()||ids.has(r.route_id))throw Error('경로 ID 중복/누락');ids.add(r.route_id);if(r.execution_extreme&&!r.execution_evidence.trim())throw Error('실행 부하 근거 누락');if(r.independent_branches.length&&r.critical_discoveries.length)throw Error('가지와 경로 발견 중복');if(r.parallel_branch_count!==Math.max(1,r.independent_branches.length))throw Error('병렬 가지 수 불일치');const bids=new Set();for(const b of r.independent_branches){if(!b.branch_id.trim()||bids.has(b.branch_id))throw Error('가지 ID 중복/누락');bids.add(b.branch_id);S.graph(b.critical_discoveries);}S.graph(r.critical_discoveries);}return v;}
function evaluate(value,scorer=S){try{const input=raw(value);return {raw:input,computed:{...scorer.scoreProblem(input.viable_routes,input.literacy_high),scorer_version:scorer.version}};}catch(e){return {raw:null,computed:{status:'failed',score:null,problem_tier:null,confidence:0,reason:'invalid_input',detail:e.message,scorer_version:scorer.version}};}}
module.exports={schema,raw,evaluate};
