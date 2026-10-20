'use strict';
const P=require('./projection.cjs');
const version='m2-required-projection-r2',bands=[[1,2],[2.1,3.8],[3.9,5.8],[5.9,7.7],[7.8,9.4],[9.5,10]];
const cmp=(a,b)=>a<b?-1:a>b?1:0,nonArithmetic=new Set(['critical_discovery','theorem_application','relation_transfer','algebraic_transformation']);
const floorMap={uncued_auxiliary_or_intermediate_structure:['R',2],multiple_plausible_constructions:['B',2],direct_clue_absent:['C',2],hint_makes_remaining_route_routine:['H',3]};
function effective(d){const raw=Object.fromEntries(['C','R','B','H'].map(k=>[k,d[k]])),e={...raw},applied=[];for(const [k,[a,min]]of Object.entries(floorMap))if(d.structure_audit[k].applies&&e[a]<min){e[a]=min;applied.push({audit:k,axis:a,from:raw[a],to:min});}return {...d,...e,raw_axes:raw,effective_axes:e,axis_floor_applied:applied};}
function move(d){const {C:c,R:r,B:b,H:h}=d;return c<=1&&r<=1&&b<=1&&!d.is_non_obvious?0:r>=3&&c>=3&&b>=2&&h>=3?5:c+r+b>=8?4:c+r+b>=6?3:c+r+b>=4?2:1;}
const severity=d=>(.40*d.C+.35*d.R+.25*d.B)/4;
function graph(ds){
 const map=new Map(),edges=[];for(const raw of ds){if(!raw.id||map.has(raw.id))throw Error('duplicate/missing discovery ID');if(new Set(raw.depends_on).size!==raw.depends_on.length)throw Error('duplicate dependency');for(const dep of raw.depends_on){if(dep===raw.id)throw Error('self dependency');if(!map.has(dep))throw Error('dependency must reference existing earlier node (missing/forward/cycle)');edges.push({from:dep,to:raw.id});}const d=effective(raw);map.set(d.id,{...d,move:move(d)});}
 const next=new Map([...map.keys()].map(id=>[id,[]]));for(const e of edges)next.get(e.from).push(e.to);
 const ancestors=new Map(),requiredAncestors=new Map();
 for(const d of map.values()){const all=new Set(),req=new Set();for(const dep of d.depends_on){all.add(dep);for(const x of ancestors.get(dep))all.add(x);if(d.dependency_semantics==='all_required'){req.add(dep);for(const x of requiredAncestors.get(dep))req.add(x);}}ancestors.set(d.id,all);requiredAncestors.set(d.id,req);}
 return {map,next,edges,ancestors,requiredAncestors};
}
function chain(g,predicate){const memo=new Map(),sum=ids=>ids.reduce((s,id)=>s+severity(g.map.get(id)),0),order=(a,b)=>b.length-a.length||sum(b)-sum(a)||cmp(a.join('\0'),b.join('\0'));for(const d of g.map.values()){const prev=(d.dependency_semantics==='all_required'?d.depends_on:[]).map(x=>memo.get(x)).sort(order)[0]||[];memo.set(d.id,predicate(d)?[...prev,d.id]:prev);}return [...memo.values()].sort(order)[0]||[];}
function round1(x){const b=new DataView(new ArrayBuffer(8));b.setFloat64(0,x);const bits=b.getBigUint64(0),exp=Number((bits>>52n)&2047n)-1023-52;let num=((bits&((1n<<52n)-1n))+(1n<<52n))*10n,den=1n;if(exp>=0)num<<=BigInt(exp);else den<<=BigInt(-exp);let n=num/den;const r=num%den;if(r*2n>den||(r*2n===den&&n%2n))n++;return Number(n)/10;}
function decimal(t,s,e,avg=null){const [lo,hi]=bands[t];return round1(t===0?Math.min(2,1+.6*s+.1*e):t===5?Math.min(10,9.5+.4*(avg??s)+(avg===null?0:.1)):Math.max(lo,Math.min(hi,lo+(hi-lo)*(.85*s+.15*e/4))));}
function routeFloor(g,conclusions,audit){
 // Count an actual dependency path, never a sum of independent branches.
 const candidates=[];function walk(id,tail){const d=g.map.get(id),p=[id,...tail];if(d.dependency_semantics==='all_required'&&d.depends_on.length)for(const dep of d.depends_on)walk(dep,p);else candidates.push(p);}
 for(const id of conclusions)walk(id,[]);
 let selected=[];for(const p of candidates){const math=p.filter(id=>nonArithmetic.has(g.map.get(id).step_kind));const kinds=new Set(math.map(id=>g.map.get(id).relation_kind));if(p.length>=3&&math.length>=3&&kinds.size>=2){selected=p;break;}}
 const diagnostic=(selected.length?selected:candidates.sort((a,b)=>b.length-a.length)[0])||[],math=diagnostic.filter(id=>nonArithmetic.has(g.map.get(id).step_kind)),distinct=new Set(math.map(id=>g.map.get(id).relation_kind)).size;
 const qualifies=selected.length>0&&!audit.pure_formula_substitution_and_arithmetic&&!audit.same_relation_repetition_only&&!audit.independent_choice_checks_only;
 return {qualifies,dependency_depth:diagnostic.length,dependent_non_arithmetic_step_count:math.length,distinct_relation_count:distinct,route_floor_path_ids:diagnostic,route_floor_reason:qualifies?'Dependent non-arithmetic chain with distinct relations':'No qualifying dependent mathematical chain, or excluded formula/arithmetic/repetition/independent checks'};
}
function assembly(g,conclusions){
 const members=chain(g,d=>d.is_non_obvious&&d.move>=2);
 if(members.length>=3)return {assembly_mode:'chain',assembly_triggered:true,assembly_member_ids:members,assembly_merge_node_id:null,assembly_evidence:'Required non-obvious M2+ chain '+members.join(' -> '),assembly_non_trigger_reason:''};
 const discoveries=[...g.map.values()].filter(d=>d.is_non_obvious&&d.move>=2&&d.structure_key.trim());
 for(const merge of g.map.values()){
  if(!conclusions.some(c=>c===merge.id||g.requiredAncestors.get(c).has(merge.id)))continue;
  const needed=discoveries.filter(d=>g.requiredAncestors.get(merge.id).has(d.id));
  for(let i=0;i<needed.length;i++)for(let j=i+1;j<needed.length;j++){const a=needed[i],b=needed[j];if(a.structure_key===b.structure_key||g.ancestors.get(a.id).has(b.id)||g.ancestors.get(b.id).has(a.id))continue;
   return {assembly_mode:'convergence',assembly_triggered:true,assembly_member_ids:[a.id,b.id],assembly_merge_node_id:merge.id,assembly_evidence:'Distinct independent structures are both mandatory AND ancestors of '+merge.id+' and an official conclusion',assembly_non_trigger_reason:''};
  }
 }
 return {assembly_mode:'none',assembly_triggered:false,assembly_member_ids:[],assembly_merge_node_id:null,assembly_evidence:'',assembly_non_trigger_reason:'No 3-member required chain or 2 distinct independent mandatory structures converging into an official conclusion'};
}
const quoteNorm=s=>String(s).normalize('NFC').replace(/\s+/g,' ').trim();
function execution(a,approved){
 const review=a.raw_case_count>15||a.raw_sequential_step_count>4||(a.compressed_case_count??0)>15||(a.compressed_sequential_step_count??0)>4,strong=a.raw_case_count>20||a.raw_sequential_step_count>5;
 const quote=quoteNorm(a.compression_basis_quote),method=quoteNorm(a.compression_method);
 const approvedCompression=a.compression_is_approved_in_basis&&a.compression_source_verified===true;
 const waiver=strong&&approvedCompression&&method.length>0&&a.compressed_case_count!==null&&a.compressed_sequential_step_count!==null&&a.compressed_case_count<=15&&a.compressed_sequential_step_count<=4&&!a.requires_table_or_systematic_listing&&!a.requires_restart_or_recount&&!a.requires_repeated_substitution;
 // Non-strong qualitative signals must be concrete work facts, not the model's extreme summary.
 const qualitative=a.requires_table_or_systematic_listing||a.requires_restart_or_recount||a.requires_repeated_substitution;
 const extreme=strong?!waiver:qualitative;
 return {review_signal:review,strong_signal:strong,extreme,waiver_applied:waiver,waiver_reason:waiver?a.compression_method:'',approved_compression_quote:approvedCompression,code_decision:strong?(waiver?'approved_quantified_compression':'strong_signal_not_waived'):(qualitative?'concrete_execution_burden':'no_extreme_workload'),raw_case_count:a.raw_case_count,raw_sequential_step_count:a.raw_sequential_step_count,compressed_case_count:a.compressed_case_count,compressed_sequential_step_count:a.compressed_sequential_step_count};
}
function literacy(a){
 const conditions=a.c.condition_evidence.filter(x=>new Set(x.reused_stage_refs).size>=2),conditionCount=new Set(conditions.map(x=>x.condition_id)).size,reuseCount=new Set(conditions.flatMap(x=>x.reused_stage_refs)).size;
 const values={a:a.a.nonstandard_rule_translation||a.a.exception_clause_translation,b:a.b.symbolic_answer_requires_nontrivial_transform&&a.b.choice_matching_required,c:conditionCount>=3&&reuseCount>=2&&!a.c.localizable_to_single_relation,d:a.d.proof_blank_count>=2||a.d.numbered_reason_tracking||a.d.corresponding_points_tracking||a.d.conclusion_to_premise_linking||a.d.proof_order_vs_congruence_distinction};
 return {values,high:Object.values(values).some(Boolean),audit_mismatch:Object.keys(values).filter(k=>values[k]!==a[k].applies).map(k=>({gate:'literacy-'+k,model:a[k].applies,code:values[k]}))};
}
function groups(r){return P.project(r).groups;}

function path(ds,conclusions,floorAudit,lit,ex,e){
 const g=graph(ds),top=[...g.map.values()].sort((a,b)=>b.move-a.move||severity(b)-severity(a)||cmp(a.id,b.id))[0];if(!top)throw Error('empty path');
 let base=top.move,trigger='bottleneck',ids=[],avg=null,s=severity(top);
 if(base===5)trigger='single_wall';else{const m4=chain(g,d=>d.move===4),m3=chain(g,d=>d.move>=3&&d.is_non_obvious);ids=m4.length>=2?m4:m3.length>=3?m3:[];if(ids.length){base=5;trigger='dependent_chain';avg=ids.reduce((n,id)=>n+severity(g.map.get(id)),0)/ids.length;s=Math.max(...ids.map(id=>severity(g.map.get(id))));}}
 const floor=routeFloor(g,conclusions,floorAudit),floorApplied=base===0&&floor.qualifies;if(floorApplied){base=1;trigger='route_floor';}
 const ass=assembly(g,conclusions),promotions=[];if(ass.assembly_triggered)promotions.push('assembly');if(lit.high)promotions.push('literacy');if(ex.extreme)promotions.push('execution');
 const tier=Math.min(5,base+promotions.length);
 return {base_tier:'T'+base,final_tier:'T'+tier,problem_tier:'T'+tier,score:decimal(tier,s,e,avg),base_trigger:trigger,promotions,promotion_tier_increase:tier-base,promotion_capped:base+promotions.length>5,dominant_s:s,chain_s_avg:avg,chain_ids:ids,...floor,route_floor_applied:floorApplied,...ass,moves:[...g.map.values()].map(d=>({id:d.id,move_class:'M'+d.move,raw_axes:d.raw_axes,effective_axes:d.effective_axes,axis_floor_applied:d.axis_floor_applied}))};
}
function route(r,lit,approved,sourceRegistry){
 const projection=P.project(r);
 const ex=execution({...r.execution_audit,raw_case_count:projection.work.required_case_count,raw_sequential_step_count:projection.work.required_sequential_calculation_steps},approved);
 // Source order is supplied by the input builder, never by hash spelling or
 // model output order. Direct legacy calls retain their original target array.
 const order=new Map(sourceRegistry?sourceRegistry.targets.map(t=>[t.id,t.source_order]):r.targets.map((t,i)=>[t.target_statement_id,i]));
 for(const b of projection.groups)if(!Number.isInteger(order.get(b.branch_id)))throw Error('source target order missing');
 const bs=projection.groups.map(b=>({...path(b.ds,b.conclusion_ids,r.route_floor_audit,lit,ex,r.execution_load),branch_id:b.branch_id,source_quote:b.source_quote})).sort((a,b)=>cmp(b.final_tier,a.final_tier)||b.score-a.score||order.get(a.branch_id)-order.get(b.branch_id)),selected=bs[0];
 const mismatches=[...lit.audit_mismatch];
 if(r.assembly_audit.triggered!==selected.assembly_triggered)mismatches.push({gate:'assembly',model:r.assembly_audit.triggered,code:selected.assembly_triggered});
 if(r.execution_audit.execution_extreme!==ex.extreme)mismatches.push({gate:'execution',model:r.execution_audit.execution_extreme,code:ex.extreme});
 return {...selected,route_id:r.route_id,approved_route_id:r.approved_route_id,branch_results:bs,execution_audit:ex,literacy_values:lit.values,audit_mismatch:mismatches,projection:{...projection,groups:undefined}};
}

function score(raw,context){
 const approved=new Map(context.approved_routes.map(a=>[a.route_id,a])),lit=literacy(raw.literacy_audit),diagnostic=[...raw.diagnostic_unapproved_routes],eligible=[],excluded=[];
 for(const r of raw.viable_routes){if(!approved.has(r.approved_route_id)||!r.route_is_official){diagnostic.push({route_summary:r.route_summary,reason_unapproved:'Not an approved official route'});continue;}
  const s=route(r,lit,approved.get(r.approved_route_id),context.source_registry);
  // Only trusted approved-route metadata may exclude an actual bypass.
  (approved.get(r.approved_route_id).eligibility==='excluded_core_bypass'?excluded:eligible).push(s);
 }
 eligible.sort((a,b)=>cmp(a.final_tier,b.final_tier)||a.score-b.score||cmp(a.route_id,b.route_id));
 if(!eligible.length)return {status:'failed',score:null,final_tier:null,problem_tier:null,reason:excluded.length?'no_curriculum_compliant_routes':'no_approved_routes',route_results:[],excluded_route_results:excluded,diagnostic_unapproved_routes:diagnostic,scorer_version:version};
 return {status:'complete',...eligible[0],selected_route_id:eligible[0].route_id,literacy_high:lit.high,literacy_audit:raw.literacy_audit,route_results:eligible,excluded_route_results:excluded,diagnostic_unapproved_routes:diagnostic,scorer_version:version};
}
module.exports={version,effective,move,graph,chain,routeFloor,assembly,literacy,execution,groups,path,route,score,decimal,quoteNorm};
