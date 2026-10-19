import {distributionPanel} from './mock-distribution.js';
import autoFill from './mock-auto-fill.cjs';
const label={low:'하',middle:'중',high:'상'},bandText=x=>['high','middle','low'].map(k=>`${label[k]} ${x[k]||0}`).join(' · ');
export function autoSummaryText(paper){
 const r=autoFill.report(paper);if(!r)return [];
 const lines=[];if(Object.keys(label).some(k=>r.planned.difficulty[k]!==r.actual.difficulty[k]))lines.push(`난이도 변경: 계획 ${bandText(r.planned.difficulty)} → 실제 ${bandText(r.actual.difficulty)}`);
 if(Object.keys(r.foreignSchools).length)lines.push('서술형 보충: '+Object.entries(r.foreignSchools).map(([s,n])=>`${s} ${n}문항`).join(' · '));
 if(Object.values(r.missing).some(Boolean))lines.push('미충족: '+Object.entries(r.missing).filter(([,n])=>n).map(([t,n])=>`${t==='선택형'?'객관식':t} ${n}문항`).join(' · '));
 return lines;
}
export function autoSummary({node,action,popup},variants,{modal=false,compositionVariants=null}={}){
 const generated=variants.filter(v=>v.paper?.autoComposition);
 function details(){const {d,body,footer}=popup('실전모의고사 자동 구성 결과');if(compositionVariants)body.append(distributionPanel(node,compositionVariants));for(const v of generated){const r=autoFill.report(v.paper),section=node('section','','mock-auto-detail');section.append(node('h3',v.label));const lines=autoSummaryText(v.paper);section.append(node('p',lines.length?lines.join('\n'):'계획대로 구성됨'));section.append(node('p',`전체 문항: ${r.actual.total}/${r.planned.total} · 객관식 ${r.actual.types.선택형}/${r.planned.types.선택형} · 서술형 ${r.actual.types.서술형}/${r.planned.types.서술형}`));section.append(node('p',`계획 난이도: ${bandText(r.planned.difficulty)}\n실제 난이도: ${bandText(r.actual.difficulty)}`,'hint'));if(r.preferredWrittenShortage)section.append(node('p',`지정 학교 서술형 ${r.preferredWrittenShortage}문항 부족 · 타학교 ${Object.values(r.foreignSchools).reduce((a,b)=>a+b,0)}문항 보충`));if(r.transfers.length){const transfers={};for(const x of r.transfers){const k=`${label[x.from]} → ${label[x.to]}`;transfers[k]=(transfers[k]||0)+1;}section.append(node('p',Object.entries(transfers).map(([k,n])=>`${k} ${n}문항 보충`).join(' · '),'hint'));}body.append(section);}footer.append(action('닫기',()=>d.close(),true));}
 if(modal){if(compositionVariants||generated.some(v=>autoFill.report(v.paper).changed))details();return;}
 const box=node('div','','mock-auto-notice');for(const v of generated){const lines=autoSummaryText(v.paper);if(lines.length){const p=node('p',lines.join(' · '),'mock-auto-lines');p.setAttribute('aria-label',v.label+' 자동 보충 안내');box.append(p);}}
 if(box.childNodes.length)box.append(action('자동 구성 상세 보기',details));return box;
}
