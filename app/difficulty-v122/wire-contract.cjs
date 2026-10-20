'use strict';
// Generation constraints only. Never repair responses, assign source roles, or score.
const version='difficulty-wire-selection-r2';
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
 ids.description='Always []. The system binds only the exact unique basis/role/approved-route/target relation already present in frozen evidence.';
 delete ids.items.enum;ids.maxItems=0;
 discovery.properties.id.description='Use a unique d1, d2, ... ID in topological order. Every dependency must be an actual earlier discovery ID; never invent d5a or refer forward.';
 discovery.properties.id.pattern='^d[1-9][0-9]*$';
 discovery.properties.depends_on.items.pattern='^d[1-9][0-9]*$';
 discovery.properties.work.properties.calculation_depends_on.items.pattern='^d[1-9][0-9]*$';
 discovery.properties.depends_on.description='Only IDs actually declared earlier in this route. Keep every real dependency; order its declaration earlier instead of deleting the edge.';
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
function scopeRoutes(route,registry){
 const relations=require('./evidence.cjs').build(registry).relations;
 const routes=[...new Set(relations.map(r=>r.route_id))];
 const alternatives=routes.map(routeId=>{
  const r=JSON.parse(JSON.stringify(route)),groups=new Map();
  r.properties.approved_route_id.enum=[routeId];
  for(const node of [r.properties.conclusion_ids.items,r.properties.excluded_explanation_ids.items,
   r.properties.targets.items.properties.conclusion_discovery_id,r.properties.assembly_audit.properties.member_ids.items])
   node.pattern='^d[1-9][0-9]*$';
  for(const e of relations.filter(e=>e.route_id===routeId))for(const target of e.allowed_branch_ids){
   const key=JSON.stringify([e.role,target]);
   if(!groups.has(key))groups.set(key,{role:e.role,target,basis:[]});
   groups.get(key).basis.push(e.basis_step_id);
  }
  const d=r.properties.critical_discoveries.items;
  r.properties.critical_discoveries.items={anyOf:[...groups.values()].map(g=>{
   const s=JSON.parse(JSON.stringify(d));
   s.properties.role.enum=[g.role];s.properties.target_statement_id.enum=[g.target];
   s.properties.basis_step_ids.items.enum=[...new Set(g.basis)];
   return s;
  })};
  return r;
 });
 if(!alternatives.length)throw Error('empty source binding scopes');
 return alternatives.length===1?alternatives[0]:{anyOf:alternatives};
}
const instructions='\n\n# 생성 단계의 근거 선택 계약\n'+
 'evidence_relation_ids는 항상 []이다. 시스템은 모델이 선택한 basis_step_ids, role, approved_route_id, target_statement_id에 모두 일치하는 기존 관계가 정확히 하나일 때만 연결한다. 여러 basis를 사용하는 발견도 유지한다. 제공된 관계에 없는 역할을 만들거나 다른 풀이 단계로 바꾸지 않는다. 해당 역할의 근거가 없는 단순 정답 번호 모음/부연 예시를 required 역할로 바꾸어 넣지 말고 critical_discoveries에서 제외하고 필요시 source_warning에 적는다. 실제 필수 수학적 판단이나 계산을 생략해서는 안 되며 합법적인 근거 연결이 불가능하면 경고에 명시한다. 결론은 실제 필수 수학적 결과의 discovery를 참조한다.\n'+
 'critical_discoveries는 의존 관계의 위상 순서로 선언한다. depends_on, work.calculation_depends_on 및 결론 참조의 모든 ID는 이 경로에서 실제 선언한 ID와 정확히 같아야 한다. depends_on은 앞서 선언한 발견만 참조한다. 앞서야 할 발견이 뒤에 있으면 선언 순서를 고치되 의존 edge나 수학적 역할은 바꾸지 않는다. 선언하지 않은 d5a 같은 ID를 만들지 않는다.\n'+
 '기존 structure_audit 규칙을 그대로 지킨다. applies=true이면 evidence를, false이면 non_trigger_reason와 direct_clue_quote를 공백이 아닌 실제 근거로 채운다. 없는 단서를 만들거나 인용을 채우기 위해 applies 또는 C/R/B/H를 바꾸지 않는다. 이 계약은 수학적 평가 기준과 출처 역할을 변경하지 않는다.\n';
module.exports={version,selectionPolicy,constrain,scopeRoutes,instructions};
