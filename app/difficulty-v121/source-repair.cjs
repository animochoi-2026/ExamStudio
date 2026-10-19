'use strict';
// Offline copies only. A branch-local ID collision is not a mathematical change.
// Refuse ambiguous/cross-branch dependencies instead of guessing their targets.
const I=require('../difficulty-v12/input.cjs');
function namespaceIndependentDiscoveryIds(raw){
 const out=structuredClone(raw),changes=[];
 for(const [ri,r]of out.viable_routes.entries()){
  const groups=[r.critical_discoveries,...r.independent_branches.map(b=>b.critical_discoveries)];
  const all=groups.flatMap(ds=>ds.map(d=>d.id));
  if(new Set(all).size===all.length)continue;
  const plans=groups.map((ds,gi)=>{
   const ids=ds.map(d=>d.id);if(new Set(ids).size!==ids.length)throw Error('duplicate_id_within_group');
   const map=new Map(ids.map((id,di)=>[id,`route${ri}_group${gi}_discovery${di}`]));
   for(const d of ds)for(const dep of d.depends_on)if(!map.has(dep))throw Error('nonlocal_dependency_requires_review');
   return map;
  });
  for(const [gi,ds]of groups.entries())for(const d of ds){
   const before={id:d.id,depends_on:[...d.depends_on]};d.id=plans[gi].get(d.id);d.depends_on=d.depends_on.map(x=>plans[gi].get(x));
   changes.push({route:ri,group:gi,before,after:{id:d.id,depends_on:[...d.depends_on]}});
  }
 }
 return {raw:out,changes};
}
function applyReviewedEdits(value,expectedHash,edits){
 if(I.hash(value)!==expectedHash)throw Error('reviewed_input_changed');
 const out=structuredClone(value);
 for(const edit of edits){
  if(!edit.rationale?.trim()||!Array.isArray(edit.path)||!edit.path.length)throw Error('review_evidence_missing');
  if(edit.path.some(x=>['__proto__','prototype','constructor'].includes(x)))throw Error('unsafe_path');
  // Numeric rubric judgments and confidence must never be raised to pass a gate.
  if(edit.path.some(x=>['C','R','B','H','confidence','answer_confidence','execution_load','execution_extreme','is_non_obvious','literacy_high','reference_student_match','uses_powerful_tool'].includes(x)))throw Error('rubric_or_confidence_edit_forbidden');
  let parent=out;for(const key of edit.path.slice(0,-1)){if(!Object.hasOwn(parent,key))throw Error('missing_edit_path');parent=parent[key];}
  const key=edit.path.at(-1);if(!Object.hasOwn(parent,key)||I.hash(parent[key])!==I.hash(edit.before))throw Error('reviewed_field_changed');
  parent[key]=structuredClone(edit.after);
 }
 return out;
}
module.exports={namespaceIndependentDiscoveryIds,applyReviewedEdits};
