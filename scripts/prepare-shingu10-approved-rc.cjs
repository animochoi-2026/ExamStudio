'use strict';
// One explicitly approved review artifact. Never imported by the evaluator.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const C=require('../app/difficulty-v122/canonical.cjs'),I=require('../app/difficulty-v122/input.cjs');
const V=require('../app/difficulty-v122/validate.cjs'),Schema=require('../app/difficulty-v122/schema.cjs'),K=require('../app/difficulty-v122/contracts.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/difficulty-v122-rc1/rc-close-20261020');
const approval='C:/Users/reals/Desktop/문제생성기/.codex-remote-attachments/01a11544-ba5d-7892-b742-a2b4aba07662/9061c764-bc36-4374-8ebe-8e78c0b2a5ee/1-문제공방-난이도RC마감-최소검증-일괄보완-3문항스모크-최종동결-요청서.md';
function defaults(s){if(s.anyOf)return null;if(s.type==='object')return Object.fromEntries(Object.entries(s.properties).map(([k,v])=>[k,defaults(v)]));
 if(s.type==='array')return [];if(s.enum)return s.enum[0];return s.type==='string'?'Approved review: no additional trigger.':s.type==='boolean'?false:0;}
function conform(old,s){if(s.type==='object')return Object.fromEntries(Object.entries(s.properties).map(([k,v])=>[k,Object.hasOwn(old||{},k)?conform(old[k],v):defaults(v)]));
 if(s.type==='array')return (old||[]).map(x=>conform(x,s.items));return old;}
function build(){
 const authority=JSON.parse(fs.readFileSync('C:/Users/reals/Desktop/문제생성기/.git/examstudio-current.json'));
 const parent=path.join(authority.checkout,'artifacts/difficulty-v121/shingu-direct-routing-fixed-20261020');
 const id='8c83dbf4-e5c9-44a2-856d-8ba54e4410da',revision='dfca50e7-13a6-4ee6-b216-6e8c4414db20',basis='5caaf1eaecc7378a208cbe9bc0931483f68b3f5b76d0eaa22bee18d18eeccef4';
 const m=JSON.parse(fs.readFileSync(path.join(parent,'manifest.json'))).find(x=>x.id===id);
 assert.equal(m.revisionId,revision);assert.equal(m.basisHash,basis);
 const contextFile=path.join(parent,m.contextFile),ctx=JSON.parse(fs.readFileSync(contextFile));
 assert.equal(C.bytesHash(fs.readFileSync(contextFile)),m.contextHash);
 const parentFile=path.join(parent,'run-three-stage',id,'stage-2/result.json'),parentHash=C.bytesHash(fs.readFileSync(parentFile));
 assert.equal(parentHash,'b7e2a9eda3276894c6a36527150c57284b897c16bd4d693bec1eef73bca8bf4b');
 const original=JSON.parse(fs.readFileSync(parentFile)),raw=conform(original.raw,Schema.schema);
 raw.spec_revision=Schema.schema.properties.spec_revision.enum[0];
 const route=raw.viable_routes[0],text=ctx.approved_routes[0].solution_excerpt;
 const spans=[],binding=new Map(),labels={g:'ㄱ',n:'ㄴ',d:'ㄷ',r:'ㄹ',m:'ㅁ',b:'ㅂ'};
 for(const d of route.critical_discoveries){
  d.target_statement_id=labels[d.id[0]];d.role=d.id.startsWith('r')?'optional_illustration':'required_derivation';
  d.role_reason=d.role==='optional_illustration'?'User approved numerical illustration exclusion.':'Preserved original relation, with approved M2 projection.';
  d.work=defaults(Schema.schema.properties.viable_routes.items.properties.critical_discoveries.items.properties.work);
  d.work.evidence='User approval: explanation sentences are not calculation steps.';
  if(d.id==='r3')d.work.calculation_steps=3;
  if(d.id==='m3'){d.depends_on=['m2'];d.summary='Apply the negative conclusion after the approved single M2 connection; illustrative numerical branch is excluded.';}
  const start=text.indexOf(d.basis_quote);assert(start>=0,'original source quote missing '+d.id);
  const span={origin:'approved_routes.approved-main',start,end:start+d.basis_quote.length,text:d.basis_quote,
   allowed_roles:[d.role],allowed_target_labels:[d.target_statement_id]};
  spans.push(span);binding.set(d.id,span);
 }
 // The existing qualitative statement supplies the judgment after the
 // explicitly approved exclusion of its optional numerical illustration.
 const q='내심에서 내린 수선의 발 $E$가 반드시 $BC$의 중점은 아닙니다.';
 const judge=structuredClone(route.critical_discoveries.find(d=>d.id==='r4'));
 Object.assign(judge,{id:'r0',summary:q,basis_quote:q,role:'required_judgment',role_reason:'Approved exclusion leaves the stated qualitative judgment.',
  depends_on:[],dependency_semantics:'none',work:defaults(Schema.schema.properties.viable_routes.items.properties.critical_discoveries.items.properties.work)});
 const start=text.indexOf(q);assert(start>=0);
 const span={origin:'approved_routes.approved-main',start,end:start+q.length,text:q,allowed_roles:['required_judgment'],allowed_target_labels:['ㄹ']};
 spans.push(span);binding.set(judge.id,span);route.critical_discoveries.push(judge);
 const source={question_id:id,revision_id:revision,question:ctx.question,scope:ctx.scope_context,difficulty_basis:ctx.difficulty_basis.solution,
  difficulty_basis_hash:basis,difficulty_basis_source:ctx.difficulty_basis_source,solution_restrictions:ctx.solution_restrictions,
  source_warning:ctx.source_warning,approved_routes:ctx.approved_routes.map(r=>({...r,reviewed_spans:spans})),
  images:m.images.map(im=>{const file=path.join(parent,im.file);assert.equal(C.bytesHash(fs.readFileSync(file)),im.sha256);return {...im,path:file};})};
 const prepared=I.prepare(source),reg=prepared.registry,rid=reg.approved_routes[0].id;
 Object.assign(raw,{source_manifest_hash:reg.source_manifest_hash,approved_route_ids:[rid]});
 Object.assign(route,{route_id:rid,approved_route_id:rid,route_is_official:true,execution_load:3});
 for(const d of route.critical_discoveries){
  const b=reg.basis_steps.find(b=>b.start===binding.get(d.id).start&&b.end===binding.get(d.id).end);
  assert(b);d.target_statement_id=reg.targets.find(t=>t.label===labels[d.id[0]]).id;
  d.basis_step_ids=[b.id];d.source_span_ids=[b.source_span_id];
  d.optional_explanation_ids=d.role==='optional_illustration'?reg.entries.filter(e=>e.namespace==='optional_explanation_id'&&e.basis_step_id===b.id).map(e=>e.id):[];
 }
 route.targets=Object.entries({ㄱ:'g1',ㄴ:'n1',ㄷ:'d2',ㄹ:'r0',ㅁ:'m3',ㅂ:'b1'}).map(([label,id])=>{
  const t=reg.targets.find(t=>t.label===label);return {target_statement_id:t.id,source_span_id:t.source_span_id,source_quote:t.text,conclusion_ids:[id]};});
 route.conclusion_ids=route.targets.flatMap(t=>t.conclusion_ids);
 route.excluded_explanation_ids=['r1','r2','r3','r4'];
 route.execution_audit=defaults(Schema.schema.properties.viable_routes.items.properties.execution_audit);
 route.execution_audit.execution_evidence='User approved E=3; six judgments and explanation sentences are not sequential calculations.';
 route.assembly_audit.triggered=false;route.assembly_audit.non_trigger_reason='Independent choices use max pooling; only one nonautomatic M2 connection.';
 for(const condition of raw.literacy_audit.c.condition_evidence)condition.reused_stage_refs=condition.reused_stage_refs.map(s=>s.replace('approved-main:',rid+':'));
 const evaluated=V.evaluate(raw,prepared.payload);
 assert.equal(evaluated.validation.valid,true,JSON.stringify(evaluated.validation));
 assert.equal(evaluated.computed.score,4.8);assert.equal(evaluated.computed.problem_tier,'T2');assert.deepEqual(evaluated.computed.promotions,[]);
 const envelope={...K.identity(prepared,require('../app/difficulty-v122/candidate-versions.json').versions),
  projection_source:'user_approved_reviewed_projection',model_generated:false,user_approved:true,original_raw_preserved:true,
  parent_result_hash:parentHash,parent_result_file:parentFile,original_raw_hash:C.hash(original.raw),
  approval_file:approval,approval_sha256:C.bytesHash(fs.readFileSync(approval)),projection_version:'m2-required-user-review-r1',
  historical_context_sha256:m.contextHash,reviewed_input_hash:prepared.rendered_input_hash,projection_hash:C.hash(raw),
  source,prepared,reviewed_projection:raw,evaluated,newAICalls:0};
 return envelope;
}
if(require.main===module){fs.mkdirSync(out,{recursive:true});const e=build();
 fs.writeFileSync(path.join(out,'shingu10-approved-review.json'),JSON.stringify(e,null,2)+'\n');
 console.log(JSON.stringify({score:e.evaluated.computed.score,tier:e.evaluated.computed.problem_tier,parent_result_hash:e.parent_result_hash,model_generated:false}));}
module.exports={build};
