'use strict';
const Inventory=require('./source-inventory.cjs');
const diagnostic='[원본 번호 확인 필요] 객관식·서술형 구분 또는 전체 문항 수 근거를 확인하세요.';
// A cropped question cannot see the exam header. User-confirmed counts may
// resolve that absence, but cannot establish an ambiguous printed identity.
function reconcile(recognition,manifest,group){
 if(!recognition||recognition.correctedByUser)return null;
 const raw=recognition.aiSourceNumbering||recognition.sourceNumbering,n=Inventory.normalize(raw),m=Inventory.normalize(manifest);
 const printed=Inventory.number(recognition.originalNumber||recognition.sourceQuestionNumber,n?.section);
 if(!n||!m?.confirmed||m.uncertain||m.total==null||!printed.key||printed.key!==group)return null;
 if(['total','objectiveCount','writtenCount'].some(k=>n[k]!=null&&m[k]!=null&&n[k]!==m[k]))return null;
 const absentCounts=n.total==null&&n.objectiveCount==null&&n.writtenCount==null;
 const identityEvidence=[n.evidence,...(recognition.uncertainties||[]).filter(u=>u.text!==diagnostic).map(u=>u.text)].join('\n');
 // Counts cannot repair a cropped/illegible number or an uncertain question type.
 const identityUncertain=/(?:번호|구분|문항\s*(?:종류|유형)|문제\s*(?:종류|유형)).{0,24}(?:잘려|잘린|잘렸|잘림|가려|가림|흐릿|번짐|어려|어렵|곤란|불명|불확|추정|애매|확인\s*필요|식별\s*불가)|(?:잘린|가려진|흐릿한|불명확한).{0,12}(?:번호|구분)|(?:number|section|question\s*type).{0,24}(?:cropped|cut\s*off|unclear|ambiguous|unreadable)/i.test(identityEvidence);
 if(identityUncertain)return null;
 const countOnly=/(?:\uC804\uCCB4|\uC601\uC5ED\uBCC4|\uC720\uD615\uBCC4|\uAC1D\uAD00\uC2DD|\uC11C\uC220\uD615|\uB17C\uC220\uD615|\uCD1D).{0,10}(?:\uBB38\uD56D|\uBB38\uC81C).{0,3}\uC218/.test(n.evidence)&&/(?:\uC5C6(?:\uC74C|\uB2E4|\uC2B5|\uB294)|\uBCF4\uC774\uC9C0\s*\uC54A|(?:\uD45C\uC2DC|\uC81C\uC2DC|\uC778\uC1C4)(?:\uB418\uC9C0|\uB418\uC5B4\s*\uC788\uC9C0|\uB418\uC5B4|\uB418)?\s*\uC54A|\uD655\uC778\uD560\s*\uC218\s*\uC5C6)/.test(n.evidence)&&!/(?:\uBC88\uD638|\uAD6C\uBD84).{0,12}(?:\uBD88\uBA85|\uBD88\uD655|\uCD94\uC815|\uC560\uB9E4|\uD655\uC778\s*\uD544\uC694)/.test(n.evidence);
 if(n.uncertain&&(!absentCounts||!countOnly))return null;
 const next=structuredClone(recognition);
 next.aiSourceNumbering=structuredClone(raw);
 next.sourceNumbering={...n,total:m.total,objectiveCount:m.objectiveCount,writtenCount:m.writtenCount,confirmed:true,uncertain:false};
 next.queueNumberingConfirmation={method:'preflight_user_confirmed_counts',total:m.total,objectiveCount:m.objectiveCount,writtenCount:m.writtenCount,printedKey:printed.key};
 next.uncertainties=(next.uncertainties||[]).filter(u=>u.text!==diagnostic);
 next.status=next.uncertainties.length?'needs_confirmation':'recognized';
 return JSON.stringify(next)===JSON.stringify(recognition)?null:next;
}
module.exports={reconcile,diagnostic};
