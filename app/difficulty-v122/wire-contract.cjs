'use strict';
// Generation constraints only. Never repair responses, assign source roles, or score.
const version='difficulty-wire-selection-r1';
function selectionPolicy(registry){
 const relations=require('./evidence.cjs').build(registry).relations,groups=new Map();
 for(const r of relations){
  const key=JSON.stringify([r.basis_step_id,r.role,r.route_id]);
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(r);
 }
 // Match evidence.normalize's existing unique-candidate rule exactly. In
 // particular, do not turn a branch-scoped match into a new auto-binding rule.
 const explicit=relations.filter(r=>groups.get(JSON.stringify([r.basis_step_id,r.role,r.route_id])).length>1);
 return {version,explicit_relation_ids:explicit.map(r=>r.evidence_relation_id),unique_groups:[...groups.values()].filter(g=>g.length===1).length};
}
function constrain(discovery,registry){
 const policy=selectionPolicy(registry),ids=discovery.properties.evidence_relation_ids;
 ids.description='Use [] for unique basis/role/route relations. Select IDs only for ambiguous relations; every selected relation must match this discovery basis, role, route and target.';
 if(policy.explicit_relation_ids.length)ids.items.enum=policy.explicit_relation_ids;
 else{delete ids.items.enum;ids.maxItems=0;}
 // Encode the frozen audit rule at generation time. This neither waives
 // negative evidence nor changes any trigger, axis floor or scoring rule.
 for(const [key,fact]of Object.entries(discovery.properties.structure_audit.properties)){
  const alternatives=[true,false].map(applies=>{
   const branch=JSON.parse(JSON.stringify(fact));
   branch.properties.applies.enum=[applies];
   for(const field of applies?['evidence']:['non_trigger_reason','direct_clue_quote'])
    Object.assign(branch.properties[field],{minLength:1,pattern:'\\S'});
   return branch;
  });
  discovery.properties.structure_audit.properties[key]={anyOf:alternatives};
 }
 return policy;
}
const instructions='\n\n# 생성 단계의 근거 선택 계약\n'+
 '현재 approved_route_id와 discovery role에 대해 basis_step_id의 제공 관계가 유일하면 그 관계 ID를 다시 선택하지 않는다. 해당 근거는 시스템이 연결한다. 모든 근거가 유일한 발견의 evidence_relation_ids는 반드시 []이다. 여러 관계가 있는 근거에 대해서만 현재 target_statement_id를 허용하는 관계 ID를 선택한다. 선택한 각 관계의 basis_step_id는 이 발견의 basis_step_ids에 있어야 하며 role과 route도 정확히 일치해야 한다. 여러 근거를 사용하는 발견은 그대로 보존한다. 관계가 없는 역할을 만들거나 다른 풀이 단계의 ID를 대신 쓰지 않는다.\n'+
 '기존 structure_audit 규칙을 그대로 지킨다. applies=true이면 evidence를, false이면 non_trigger_reason와 direct_clue_quote를 공백이 아닌 실제 근거로 채운다. 없는 단서를 만들거나 인용을 채우기 위해 applies 또는 C/R/B/H를 바꾸지 않는다. 이 계약은 수학적 평가 기준과 출처 역할을 변경하지 않는다.\n';
module.exports={version,selectionPolicy,constrain,instructions};
