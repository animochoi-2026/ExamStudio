'use strict';
// A transport codec only. The original source registry, validator and scorer
// remain authoritative; no mathematical fact is inferred from an old score.
const C=require('./canonical.cjs'),S=require('./schema.cjs'),E=require('./evidence.cjs');
const version='difficulty-compact-relations-r1',clone=x=>JSON.parse(JSON.stringify(x));
const obj=p=>({type:'object',additionalProperties:false,properties:p,required:Object.keys(p)}),arr=x=>({type:'array',items:x});
const nodeFields=['id','step_kind','C','R','B','H','depends_on','dependency_semantics','is_non_obvious','relation_kind','structure_key','clue_in_text','must_construct','hint_effect','structure_audit','work'];
const routeFields=['uses_powerful_tool','powerful_tool_reason','execution_load','execution_audit','route_floor_audit','assembly_audit'];
const globalFields=['reference_student_match','source_warning','pre_solution_cues','diagnostic_unapproved_routes','literacy_audit','confidence','short_reason'];
function manifest(context){
 E.verify(context.evidence_relations,context.source_registry);
 const reviewed=require('./compact-reviewed-relations.json').rows.find(r=>r.question_id===context.source_registry.question_id&&r.revision_id===context.source_registry.revision_id&&r.source_manifest_hash===context.source_manifest_hash);
 const allowed=context.projection_role_overlay?context.evidence_relations.relations.filter(r=>r.role==='required_derivation'&&context.projection_role_overlay.required_relations.some(x=>x.evidence_relation_id===r.evidence_relation_id)):context.evidence_relations.relations;
 const entries=allowed.flatMap(r=>{
  const subs=reviewed?.subrelations.filter(s=>s.parent_evidence_relation_id===r.evidence_relation_id)||[];
  for(const s of subs){const b=context.source_registry.basis_steps.find(b=>b.id===s.basis_step_id);if(!b||b.text.slice(s.start,s.end)!==s.quote||s.role!==r.role)throw Error('reviewed subrelation identity mismatch');}
  return (subs.length?subs:[null]).flatMap(sub=>r.allowed_branch_ids.map(target=>({...r,target_statement_id:target,reviewed_subrelation:sub})));
 });
 const relations=entries.map((r,i)=>({...r,alias:'e'+(i+1)}));
 return {version,source_manifest_hash:context.source_manifest_hash,relations,hash:C.hash({version,relations})};
}
function schema(context){
 const m=manifest(context),base=S.schema.properties,rt=base.viable_routes.items.properties,nd=rt.critical_discoveries.items.properties;
 const routes={};for(const [i,a]of context.approved_routes.entries()){
  const d=obj(Object.fromEntries(nodeFields.map(k=>[k,clone(nd[k])])));
  d.properties.evidence_relation_id={type:'string',enum:m.relations.filter(r=>r.route_id===a.route_id).map(r=>r.alias)};
  d.properties.additional_evidence_relation_ids=arr(clone(d.properties.evidence_relation_id));d.required=Object.keys(d.properties);
  const p=Object.fromEntries(routeFields.map(k=>[k,clone(rt[k]) ]));
  // Compression evidence uses the same short, source-bound relation references.
  delete p.execution_audit.properties.compression_basis_step_ids;
  p.execution_audit.properties.compression_relations=arr(clone(d.properties.evidence_relation_id));
  p.execution_audit.required=Object.keys(p.execution_audit.properties);
  p.discoveries={...arr(d),minItems:3};p.conclusions={...arr({type:'string'}),minItems:1};routes['r'+(i+1)]=obj(p);
 }
 const p=Object.fromEntries(globalFields.map(k=>[k,clone(base[k])]));p.routes=obj(routes);return obj(p);
}
function encode(raw,context){
 const m=manifest(context),out=Object.fromEntries(globalFields.map(k=>[k,clone(raw[k])]));out.routes={};const routeIds=new Map();
 for(const [i,a]of context.approved_routes.entries()){
  const r=raw.viable_routes.find(r=>r.approved_route_id===a.route_id&&r.route_is_official);if(!r)throw Error('compact approved route missing');
  const alias='r'+(i+1);routeIds.set(r.route_id,alias);
  const p=Object.fromEntries(routeFields.map(k=>[k,clone(r[k])]));
  p.execution_audit.compression_relations=p.execution_audit.compression_basis_step_ids.map(id=>{const e=m.relations.find(e=>e.basis_step_id===id&&e.route_id===a.route_id);if(!e)throw Error('compact compression relation missing');return e.alias;});
  delete p.execution_audit.compression_basis_step_ids;delete p.execution_audit.compression_source_verified;
  p.discoveries=r.critical_discoveries.map(d=>{
   const refs=d.basis_step_ids.map(id=>{const matches=m.relations.filter(e=>e.basis_step_id===id&&e.role===d.role&&e.route_id===a.route_id&&e.target_statement_id===d.target_statement_id&&(!e.reviewed_subrelation||e.reviewed_subrelation.node_id===d.id));if(matches.length!==1)throw Error('compact relation not unique');return matches[0].alias;});
   return {...Object.fromEntries(nodeFields.map(k=>[k,clone(d[k])])),evidence_relation_id:refs[0],additional_evidence_relation_ids:refs.slice(1)};
  });
  p.conclusions=r.targets.flatMap(t=>t.conclusion_ids);out.routes[alias]=p;
 }
 for(const condition of out.literacy_audit.c.condition_evidence)condition.reused_stage_refs=condition.reused_stage_refs.map(ref=>{for(const [id,alias]of routeIds)if(ref.startsWith(id+':'))return alias+ref.slice(id.length);throw Error('compact literacy stage missing');});
 return out;
}
function decode(wire,context){
 require('./validate.cjs').structural(wire,schema(context));
 const m=manifest(context),byId=new Map(m.relations.map(e=>[e.alias,e])),registry=context.source_registry;
 const out={...Object.fromEntries(globalFields.map(k=>[k,clone(wire[k])])),construct:'insight_bottleneck_difficulty',spec_version:'1.2',spec_revision:S.revision,curriculum_scope:context.curriculum_scope,difficulty_basis_source:context.difficulty_basis_source,difficulty_basis_hash:context.difficulty_basis_hash,source_manifest_hash:context.source_manifest_hash,approved_route_ids:context.approved_route_ids,viable_routes:[]};
 for(const [i,a]of context.approved_routes.entries()){
  const alias='r'+(i+1),p=wire.routes[alias],owners=new Map(),resolved=[];
  const ds=p.discoveries.map(d=>{
   const ids=[d.evidence_relation_id,...d.additional_evidence_relation_ids];if(new Set(ids).size!==ids.length)throw Error('compact duplicate relation');
   const refs=ids.map(id=>{const e=byId.get(id);if(!e||e.route_id!==a.route_id)throw Error('compact foreign relation');return e;}),first=refs[0];
   if(refs.some(e=>e.role!==first.role||e.target_statement_id!==first.target_statement_id))throw Error('compact mixed role/target relation');
   const b=registry.basis_steps.filter(b=>refs.some(e=>e.basis_step_id===b.id));
   const quote=b.map(b=>b.text||b.source_quote||registry.entries.find(e=>e.id===b.source_span_id)?.text||b.id).join('\n');
   const value={...Object.fromEntries(nodeFields.map(k=>[k,clone(d[k])])),summary:quote,basis_quote:quote,role:first.role,role_reason:'Source-bound role: '+first.role,target_statement_id:first.target_statement_id,premise_source_id:null,basis_step_ids:[...new Set(refs.map(e=>e.basis_step_id))],source_span_ids:[...new Set(refs.flatMap(e=>e.source_span_ids))],shared_premise_ids:[],optional_explanation_ids:[],answer_aggregation_ids:[]};
   const roleField={shared_premise:'shared_premise_ids',optional_illustration:'optional_explanation_ids',answer_aggregation:'answer_aggregation_ids'}[first.role];if(roleField)value[roleField]=[...new Set(refs.flatMap(e=>e.role_source_ids))];
   if(first.role==='shared_premise'){
    const key=C.hash(refs.map(e=>e.reviewed_subrelation?.reviewed_subrelation_hash||e.basis_step_id).sort());if(owners.has(key))throw Error('compact shared relation repeated without explicit approved alias mapping');else owners.set(key,d.id);
   }
   resolved.push({route_id:a.route_id,discovery_id:d.id,target_statement_id:first.target_statement_id,evidence_relation_ids:refs.map(e=>e.evidence_relation_id),binding:'compact_source_bound'});
   return value;
  });
  const nodes=new Map(ds.map(d=>[d.id,d]));if(nodes.size!==ds.length)throw Error('compact duplicate discovery');
  const grouped=new Map();for(const id of p.conclusions){const d=nodes.get(id);if(!d||['optional_illustration','answer_aggregation'].includes(d.role))throw Error('compact conclusion missing/excluded');if(!grouped.has(d.target_statement_id))grouped.set(d.target_statement_id,[]);grouped.get(d.target_statement_id).push(id);}
  const targets=[...grouped].map(([id,conclusion_ids])=>{const t=registry.targets.find(t=>t.id===id);return {target_statement_id:id,source_span_id:t.source_span_id,source_quote:t.text||t.source_quote||id,conclusion_ids};});
  const route={...Object.fromEntries(routeFields.map(k=>[k,clone(p[k])])),route_id:alias,approved_route_id:a.route_id,approved_route_source:a.source,route_is_official:true,route_summary:a.solution_excerpt||a.route_id,critical_discoveries:ds,targets,conclusion_ids:[...p.conclusions],excluded_explanation_ids:ds.filter(d=>d.role==='optional_illustration').map(d=>d.id)};
  route.execution_audit.compression_basis_step_ids=[...new Set(route.execution_audit.compression_relations.map(id=>{const e=byId.get(id);if(!e||e.route_id!==a.route_id)throw Error('compact compression foreign relation');return e.basis_step_id;}))];delete route.execution_audit.compression_relations;
  out.viable_routes.push(route);
 }
 return out;
}
function render(prepared){
 const context=prepared.payload,m=manifest(context),entries=new Map(context.source_registry.entries.map(e=>[e.id,e]));
 const input={question:context.question,curriculum_scope:context.curriculum_scope,scope_context:context.scope_context,solution_restrictions:context.solution_restrictions,difficulty_basis:context.difficulty_basis,approved_interpretation:context.approved_interpretation,source_warning:context.source_warning,
  routes:context.approved_routes.map((a,i)=>({slot:'r'+(i+1),source:a.source,solution_excerpt:a.solution_excerpt,relations:m.relations.filter(e=>e.route_id===a.route_id).map(e=>({evidence_relation_id:e.alias,role:e.role,basis:e.reviewed_subrelation?.quote||entries.get(e.basis_step_id)?.text,target:entries.get(e.target_statement_id)?.text}))}))};
 const instructions=require('./prompt.json').instructions+'\n\n# Compact transport contract (system metadata only)\n출력은 제공된 compact schema를 따른다. 기존 수학 기준과 축·승급 사실은 그대로 평가한다. routes의 r1,r2 슬롯은 입력의 승인 풀이 순서다. discovery마다 evidence_relation_id를 선택하고 여러 근거가 실제 필요하면 additional_evidence_relation_ids에 모두 포함한다. 관계의 출처 역할을 바꾸지 않는다. route/target/basis/source/hash/summary를 반복 출력하지 않는다. 시스템이 해당 관계에서 복원한다. conclusions에는 각 실제 필수 수학 목표를 완성한 discovery ID를 빠짐없이 기록한다. 다른 목표의 결과나 답 번호 모음으로 대신하지 않는다. 모든 depends_on은 실제 앞선 discovery ID다. literacy의 reused_stage_refs는 r1:d1 형식이다. compression_relations는 승인된 압축 근거 관계 ID다. 감사의 적용/비적용 근거와 실제 수학 판단을 생략하지 않는다. 글자 수나 발견 수 상한은 없다. approved route 전부를 확인하고 각 슬롯을 채운다.\n';
 return {text:instructions+'\n'+C.json(input),rendered_payload_hash:C.hash({instructions,input}),compact_manifest_hash:m.hash};
}
module.exports={version,manifest,schema,encode,decode,render,nodeFields,routeFields,globalFields};
