'use strict';
// v1.2.1 only. Historical pilot scorers and their hashes are not rewritten.
const S=require('../difficulty-v12/scorer.cjs');
const version='insight-v1.2.1-scorer-1';
function scoreProblem(routes,literacy){
 if(typeof literacy!=='boolean')throw Error('literacy_high boolean required');
 if(!Array.isArray(routes))throw Error('viable_routes required');
 const ids=new Set();
 for(const r of routes){
  if(!r.route_id||ids.has(r.route_id))throw Error('route_id missing/duplicate');ids.add(r.route_id);
  if(typeof r.uses_powerful_tool!=='boolean'||typeof r.execution_extreme!=='boolean')throw Error('route boolean required');
  S.axis(r.execution_load);
  if(!Array.isArray(r.independent_branches)||!Array.isArray(r.critical_discoveries))throw Error('discoveries/branches required');
  const discoveries=[r.critical_discoveries,...r.independent_branches.map(b=>b.critical_discoveries)];
  const discoveryIds=new Set();for(const ds of discoveries){S.graph(ds);for(const d of ds){if(discoveryIds.has(d.id))throw Error('discovery id must be unique across route');discoveryIds.add(d.id);}}
 }
 // The whole route execution load applies to every independent branch (§15).
 const prepared=routes.map(r=>({...r,independent_branches:r.independent_branches.map(b=>({...b,execution_load:r.execution_load}))}));
 const out=S.scoreProblem(prepared,literacy,1);
 if(out.status!=='complete')return {...out,scorer_version:version};
 const base=Number(out.base_tier.slice(1)),tier=Number(out.problem_tier.slice(1));
 return {...out,base_trigger:base===5?(out.chain_ids.length?'dependent_chain':'single_wall'):'bottleneck',
  promotion_tier_increase:tier-base,promotion_capped:base+out.promotions.length>5,scorer_version:version};
}
module.exports={version,scoreProblem};
