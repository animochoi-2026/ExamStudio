'use strict';
// Pure transition plan. A persistence adapter MUST lock and commit all rows in
// one transaction; this module never performs partial production writes.
const I=require('../difficulty-v12/input.cjs'),P=require('./profile.cjs');
function snapshot(items){return {version:'recovery-only-v121',createdAt:new Date().toISOString(),items:structuredClone(items),hash:I.hash(items)};}
function plan({snapshot:backup,results,current,acceptancePassed,systemError=null}){
 if(!acceptancePassed||systemError)throw Error('acceptance/system gate blocked');
 if(!backup?.items?.length||backup.hash!==I.hash(backup.items))throw Error('recovery snapshot invalid');
 const count=backup.items.length;
 if(results.length!==count||new Set(results.map(r=>r.question_id)).size!==count)throw Error('incomplete/duplicate evaluation');
 if(results.some(r=>!['complete','failed'].includes(r.final_status)||r.spec_revision!=='1.2.1'||r.prompt_hash!==P.promptHash||r.json_schema_hash!==P.schemaHash||r.scorer_code_hash!==P.scorerCodeHash))throw Error('invalid result version');
 if(results.filter(r=>r.final_status==='failed').length/count>.05)throw Error('failure rate above 5%');
 const now=new Map(current.map(x=>[x.question_id,x])),old=new Map(backup.items.map(x=>[x.question_id,x]));
 return results.map(r=>{
  const before=old.get(r.question_id),c=now.get(r.question_id);
  if(!before||!c||r.question_revision_id!==c.revision_id||before.revision_id!==c.revision_id||I.hash(before)!==I.hash(c))throw Error('revision or concurrent metadata change');
  if(r.final_status==='complete'&&(!Number.isFinite(r.final_score)||r.final_score<1||r.final_score>10||!/^T[0-5]$/.test(r.final_tier)))throw Error('invalid final score');
  if(r.final_status==='failed'&&(r.final_score!==null||r.final_tier!==null))throw Error('failed result must be null');
  const metadata=structuredClone(c.metadata),confirmed=structuredClone(c.confirmed||{});
  // Other teacher confirmation (answers, units, source and review) is untouched.
  delete confirmed.difficulty;delete confirmed.difficultyBand;
  const prior=metadata.difficulty||{},kept={};
  // Only non-score classification/reference flags survive. Old score/history live
  // solely in the recovery snapshot, not an active display fallback.
  for(const k of ['scope','isReference'])if(Object.hasOwn(prior,k))kept[k]=structuredClone(prior[k]);
  metadata.difficulty={...kept,auto_score:r.final_score,auto_tier:r.final_tier,auto_evaluation_id:r.evaluation_run_id,
   teacher_override_score:null,teacher_override_reason:null,teacher_override_by:null,teacher_override_at:null,teacher_override_active:false,
   effective_score:r.final_score,effective_score_source:'v1.2.1',assessmentStatus:r.final_status,criteriaVersion:'insight-bottleneck-v1.2.1',v121Active:structuredClone(r)};
  return {question_id:r.question_id,revision_id:c.revision_id,expectedHash:I.hash(c),metadata,confirmed};
 });
}
function effective(metadata){const d=metadata?.difficulty;if(!d?.v121Active)return null;
 if(d.teacher_override_active&&Number.isFinite(d.teacher_override_score)&&d.teacher_override_score>=1&&d.teacher_override_score<=10)return {score:d.teacher_override_score,source:'teacher',status:'complete'};
 return {score:d.v121Active.final_status==='complete'?d.v121Active.final_score:null,source:'v1.2.1',status:d.v121Active.final_status};}
module.exports={snapshot,plan,effective};
