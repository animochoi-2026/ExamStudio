'use strict';
// Projection of stored values only. No scoring or promotion computation.
const mappingVersion='tier-display-v123-1',tiers={T0:'low',T1:'low',T2:'middle',T3:'middle',T4:'high',T5:'killer'};
const number=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))&&Number(v)>=1&&Number(v)<=10?Number(v):null;
function active(c){
 const d=c.metadata?.difficulty||{},r=d.v123Active;if(!r)return null;
 const stale=d.reassessmentRequired||(c.revision_id&&r.question_revision_id!==c.revision_id);
 const ai=!stale&&r.final_status==='complete'?number(r.final_score):null;
 const manual=number(c.confirmed?.difficulty)??number(d.userScore)??(d.teacher_override_active?number(d.teacher_override_score):null),score=manual??ai;
 return {score,rawScore:ai,status:manual!==null?'complete':stale?'stale':r.final_status,source:manual!==null?'교사 조정':'AI v1.2.3',
 criteriaVersion:'difficulty-v1.2.3',record:r,computed:r.computed||{},reason:r.short_reason||'',mappingVersion,
 summary:'AI v1.2.3 '+(ai===null?(stale?'재평가 필요':'평가 실패'):r.final_tier+' · 기본 '+r.computed?.base_tier+' · 승급 '+((r.computed?.promotions||[]).map(g=>({assembly:'조립 +1',literacy:'문해력 +1',execution:'실행 +1'}[g])).join(', ')||'없음'))};
}
module.exports={active,tiers,mappingVersion};

