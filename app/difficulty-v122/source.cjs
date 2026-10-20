'use strict';
const C=require('./canonical.cjs'),policy=require('./policy.cjs');
const version=policy.source_id_contract_version;
const roles=['required_judgment','required_derivation','shared_premise','optional_illustration','answer_aggregation'];
const roleNamespace={shared_premise:'shared_premise_id',optional_illustration:'optional_explanation_id',answer_aggregation:'answer_aggregation_id'};
// Identity is tied to source coordinates, NOT enumeration or model discovery order.
function sourceId(scope,namespace,route,span,role){
 return namespace+':'+C.hash({contract:version,canonicalization:C.version,...scope,route,role,origin:span.origin,start:span.start,end:span.end,text:C.text(span.text)});
}
function partitions(text,origin){
 const starts=[0,...[...text.matchAll(/^(?:#{1,6} |\d+[.)]\s|\[[^\n]+\]|[①②③④⑤⑥]|[ㄱㄴㄷㄹㅁㅂ][.．)]|\([1-9]\))/gm)].map(m=>m.index)];
 const points=[...new Set(starts)].sort((a,b)=>a-b);
 return points.map((start,i)=>({origin,start,end:points[i+1]??text.length,text:text.slice(start,points[i+1]??text.length).trimEnd()})).filter(s=>s.text.trim());
}
function targetSources(question){
 const body=C.text(question.body),sub=[...body.matchAll(/(?:^|(?<=\s))\([1-9]\)/g)];
 if(sub.length)return sub.map((m,i)=>({label:m[0].trim(),origin:'question.body',start:m.index,end:sub[i+1]?.index??body.length,text:body.slice(m.index,sub[i+1]?.index??body.length)}));
 const box=(question.statementBox||[]).map(x=>typeof x==='string'?x:C.json(x)).join('\n');
 const marks=[...box.matchAll(/(?:^|\n|\s)[ㄱㄴㄷㄹㅁㅂ][.．)]?\s/g)];
 if(marks.length>=2)return marks.map((m,i)=>({label:m[0].trim().replace(/[.．)]/g,''),origin:'question.statementBox',start:m.index,end:marks[i+1]?.index??box.length,text:box.slice(m.index,marks[i+1]?.index??box.length)}));
 // Statement judgments have independent targets; numeric answer alternatives do not.
 const choices=question.choices||[];
 // A mathematical relation is a judgment even without Korean prose.
 // Scalar answer alternatives remain one problem-level target.
 const statement=s=>/[가-힣=<>≠≤≥≦≧∥⊥≅≡∼≈∈∉⊂⊆⊃⊇]/.test(s)||
  /\\(?:neq?|leq?|geq?|lt|gt|parallel|perp|cong|equiv|sim|approx|in|notin|subseteq?|supseteq?)\b/.test(s);
 if(/옳[은지]|옳지|설명|항상 성립|성질/.test(body)&&choices.length>1&&choices.every(statement)){
  return choices.map((s,i)=>({label:'①②③④⑤⑥⑦⑧⑨'[i],origin:'question.choices.'+i,start:0,end:s.length,text:s}));
 }
 return [{label:'main',origin:'question.body',start:0,end:body.length,text:body}];
}
function classify(span){
 const heading=span.text.split('\n')[0];
 if(/^\[.*(?:경고|원문|주의)/.test(heading))return ['source_warning'];
 if(/(?:^|[. ]+)(?:선택지 검산|다른 방법으로 검산|사후 검산|참고용 예시)/.test(heading))return ['optional_illustration'];
 if(/^(?:\d+[.)]\s*)?(?:정답 모음|답 모음|정답 취합)\s*$/.test(heading))return ['answer_aggregation'];
 return ['required_judgment','required_derivation','shared_premise'];
}
function build(input){
 const {question_id,revision_id,difficulty_basis_hash,question,approved_routes}=input;
 const scope={question_id,revision_id,difficulty_basis_hash};
 if(Object.values(scope).some(x=>typeof x!=='string'||!x))throw Error('source scope missing');
 if(!Array.isArray(approved_routes)||!approved_routes.length)throw Error('approved route missing');
 const entries=[],targets=[],routes=[],basis=[];
 const add=(namespace,route,span,role,extra={})=>{
  const e={id:sourceId(scope,namespace,route,span,role),namespace,...scope,approved_route_id:route,role,text:span.text,origin:span.origin,start:span.start,end:span.end,...extra};
  if(entries.some(x=>x.id===e.id))throw Error('source ID collision');
  entries.push(e);return e;
 };
 const approvedKeys=new Set();
 for(const r of approved_routes){
  if(!r.route_id||approvedKeys.has(r.route_id)||!r.solution_excerpt?.trim())throw Error('approved route missing/duplicate');
  approvedKeys.add(r.route_id);
  const span={origin:'approved_route.'+r.route_id,start:0,end:r.solution_excerpt.length,text:r.solution_excerpt};
  const id=sourceId(scope,'approved_route_id',r.route_id,span,'approved_route');
  const e=add('approved_route_id',id,span,'approved_route',{original_route_id:r.route_id,source:r.source,eligibility:r.eligibility||'approved'});
  // The public route ID is its own scoped identity (never a model-created alias).
  e.id=id;routes.push(e);
 }
 for(const [sourceOrder,t] of targetSources(question).entries()){
  const s=add('source_span_id',null,t,'target');
  targets.push(add('target_statement_id',null,t,'target',{label:t.label,source_order:sourceOrder,source_span_id:s.id,approved_route_ids:routes.map(r=>r.id)}));
 }
 for(const [i,r]of approved_routes.entries()){
  const route=routes[i];
  const reviewed=r.reviewed_spans;
  const spans=reviewed||partitions(r.solution_excerpt,'approved_routes.'+r.route_id);
  if(!spans.length)throw Error('source manifest incomplete');
  for(const s of spans){
   if(r.solution_excerpt.slice(s.start,s.end).trimEnd()!==s.text)throw Error('source span not in approved basis');
   const allowed=s.allowed_roles||classify(s);
   if(!allowed.length||allowed.some(x=>!roles.includes(x)&&x!=='source_warning'))throw Error('source role missing');
   const label=s.text.split('\n')[0].match(/[①②③④⑤⑥ㄱㄴㄷㄹㅁㅂ]|\([1-9]\)/)?.[0];
   const matching=targets.filter(t=>t.label===label);
   let scoped=matching.length===1?matching:targets;
   if(s.allowed_target_labels){
    if(!s.allowed_target_labels.length||new Set(s.allowed_target_labels).size!==s.allowed_target_labels.length)throw Error('reviewed target labels missing/duplicate');
    scoped=s.allowed_target_labels.map(label=>{
     const exact=targets.filter(t=>t.label===label);
     if(exact.length!==1)throw Error('reviewed target label unresolved');
     return exact[0];
    });
   }
   const targetIds=scoped.map(t=>t.id);
   const span=add('source_span_id',route.id,s,allowed.join('|'),{allowed_roles:allowed,allowed_target_ids:targetIds});
   const b=add('basis_step_id',route.id,s,allowed.join('|'),{source_span_id:span.id,allowed_roles:allowed,allowed_target_ids:targetIds});
   basis.push(b);
   for(const role of allowed)if(roleNamespace[role])add(roleNamespace[role],route.id,s,role,{basis_step_id:b.id,source_span_id:span.id,allowed_target_ids:targetIds});
  }
 }
 const manifest={version,canonicalization_version:C.version,...scope,entries:entries.sort((a,b)=>a.id.localeCompare(b.id)),targets:targets.sort((a,b)=>a.id.localeCompare(b.id)),approved_routes:routes.sort((a,b)=>a.id.localeCompare(b.id)),basis_steps:basis.sort((a,b)=>a.id.localeCompare(b.id))};
 manifest.source_manifest_hash=C.hash(manifest);
 return manifest;
}
function verify(m){
 const {source_manifest_hash,...rest}=m;
 if(C.hash(rest)!==source_manifest_hash)throw Error('source manifest hash mismatch');
 if(new Set(m.entries.map(e=>e.id)).size!==m.entries.length)throw Error('source ID collision');
 for(const e of m.entries)for(const k of ['question_id','revision_id','difficulty_basis_hash'])if(e[k]!==m[k])throw Error('foreign source scope');
 return true;
}
module.exports={version,roles,sourceId,partitions,targetSources,build,verify};
