'use strict';
// Browser-safe projection shared by desktop, web lists and exam selection.
const number=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))&&Number(v)>=1&&Number(v)<=10?Number(v):null;
function active(c){
 const d=c.metadata?.difficulty||{},r=d.v121Active||d.v121Latest?.record;
 if(!r)return null;
 const stale=d.reassessmentRequired||c.metadata?.analysis?.status==='stale'||
  (d.v121Active&&c.revision_id&&r.question_revision_id!==c.revision_id)||
  (d.v121Latest?.inputBasis&&d.v121Latest.inputBasis!==c.metadata?.analysis?.basis);
 const ai=!stale&&r.final_status==='complete'?number(r.final_score):null;
 // Cutover removes historical fields; values saved subsequently remain valid
 // teacher adjustments through the existing review UI.
 const manual=number(c.confirmed?.difficulty)??number(d.userScore)??(d.teacher_override_active?number(d.teacher_override_score):null);
 const score=manual??ai,status=manual!==null?'complete':stale?'stale':r.final_status;
 return {score,rawScore:ai,status,source:manual!==null?'교사 조정':'AI v1.2.1',record:r,computed:r.computed||{},
  reason:r['stage'+r.final_stage+'_raw_json']?.short_reason||r.failure_reason||'',
  summary:'AI v1.2.1 '+(ai===null?(stale?'재평가 필요':'평가 실패'):r.final_tier+' · 기본 '+r.computed?.base_tier+' · 승급 '+((r.computed?.promotions||[]).map(g=>({assembly:'조립 +1',literacy:'문해력 +1',execution:'실행 +1'}[g])).join(', ')||'없음'))};
}
module.exports={active};
