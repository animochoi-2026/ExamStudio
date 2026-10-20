'use strict';
// Pure projection: raw analysis is immutable and numeric scoring lives in scorer.cjs.
function project(r){
 const raw=r.critical_discoveries,map=new Map(),aliases=new Map(),excluded=new Set();
 for(const d of raw){
  if(!d.id||map.has(d.id))throw Error('duplicate/missing analysis ID');
  if(new Set(d.depends_on).size!==d.depends_on.length)throw Error('duplicate dependency');
  for(const dep of d.depends_on)if(!map.has(dep))throw Error('missing/forward/cycle dependency');
  if(d.premise_source_id!==null){
   if(d.role!=='shared_premise'||!map.has(d.premise_source_id)||d.depends_on.length)throw Error('invalid premise alias');
   if(d.work.choice_check_count||d.work.required_case_count||d.work.calculation_steps||d.work.calculation_depends_on.length)throw Error('alias duplicates workload');
   aliases.set(d.id,aliases.get(d.premise_source_id)||d.premise_source_id);
  }
  if(['optional_illustration','answer_aggregation'].includes(d.role))excluded.add(d.id);
  map.set(d.id,d);
 }
 const opts=raw.filter(d=>d.role==='optional_illustration').map(d=>d.id).sort();
 if(JSON.stringify([...r.excluded_explanation_ids].sort())!==JSON.stringify(opts))throw Error('excluded explanation identity mismatch');
 const canonical=id=>aliases.get(id)||id,kept=new Map();
 for(const d of raw.filter(d=>!excluded.has(d.id)&&!aliases.has(d.id))){
  const deps=[...new Set(d.depends_on.map(canonical))];
  if(deps.some(id=>excluded.has(id)))throw Error('needs_evidence: required node depends on excluded illustration/aggregation');
  kept.set(d.id,{...d,depends_on:deps,work:{...d.work,calculation_depends_on:[...new Set(d.work.calculation_depends_on.map(canonical))]}});
 }
 const targets=new Set(),used=new Set(),groups=[];
 function visit(id,ids){id=canonical(id);if(!kept.has(id))throw Error('missing/excluded target prerequisite');if(ids.has(id))return;ids.add(id);for(const p of kept.get(id).depends_on)visit(p,ids);}
 for(const t of r.targets){
  if(!t.target_statement_id||targets.has(t.target_statement_id))throw Error('duplicate target');
  targets.add(t.target_statement_id);const ids=new Set();for(const id of t.conclusion_ids)visit(id,ids);
  for(const id of t.conclusion_ids)if(map.get(id)?.target_statement_id!==t.target_statement_id)throw Error('target conclusion identity mismatch');
  for(const id of ids)used.add(id);
  groups.push({branch_id:t.target_statement_id,source_quote:t.source_quote,ds:[...kept.values()].filter(d=>ids.has(d.id)),conclusion_ids:[...new Set(t.conclusion_ids.map(canonical))]});
 }
 if(!groups.length)throw Error('no mathematical target');
 for(const d of kept.values())if(!used.has(d.id))throw Error('unused required analysis node');
 const lengths=new Map(),ancestors=new Map();
 let cases=0,choices=0,reasoning=0;
 for(const d of kept.values()){
  const anc=new Set();for(const p of d.depends_on){anc.add(p);for(const a of ancestors.get(p)||[])anc.add(a);}ancestors.set(d.id,anc);
  if(d.work.calculation_depends_on.some(p=>!anc.has(p)||!lengths.has(p)))throw Error('calculation prerequisite not an existing mathematical ancestor');
  const calc=d.work.calculation_steps+Math.max(0,...d.work.calculation_depends_on.map(p=>lengths.get(p)));
  lengths.set(d.id,calc);cases+=d.work.required_case_count;choices+=d.work.choice_check_count;
  if(['critical_discovery','theorem_application','relation_transfer','algebraic_transformation'].includes(d.step_kind))reasoning++;
 }
 return {groups,retained_node_ids:[...kept.keys()],excluded_explanation_ids:opts,excluded_aggregation_ids:raw.filter(d=>d.role==='answer_aggregation').map(d=>d.id),shared_aliases:Object.fromEntries(aliases),shared_premise_ids:raw.filter(d=>d.role==='shared_premise').map(d=>d.id),work:{choice_check_count:choices,required_case_count:cases,required_sequential_calculation_steps:Math.max(0,...lengths.values()),reasoning_node_count:reasoning,optional_explanation_steps:opts.length}};
}
module.exports={project,version:'m2-required-projection-r2'};
