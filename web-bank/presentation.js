import D from '../app/difficulty-assessment.cjs';
import textTools from '../app/question-text.cjs';
import taskTypes from '../app/question-types.cjs';
// Storage uses native metadata.source fields. Never infer missing source data.
const value=(...items)=>items.find(x=>x!==null&&x!==undefined&&String(x).trim()!=='');
export function sourceInfo(c){
 const m=c.metadata||{},s=m.source||{},f=c.confirmed||{};
 const unit=value(f.primaryUnit,m.classification?.primaryUnit?.name),types=taskTypes.effective(c),type=types[0]?.name;
 return {school:value(s.school,s.materialTitle),kind:s.kind,year:value(s.academicYear),
 grade:value(s.grade),term:value(s.semester),exam:value(s.exam),number:value(s.originalNumber),points:value(f.originalPoints,s.originalPoints),
 region:value(s.region),unit:typeof unit==='object'?unit.name:unit,type:typeof type==='object'?(type.name||type.label||type.id):type,
 types:types.map(t=>({...t,displayName:[t.name,t.coreTask?.name].filter(Boolean).join(' · ')})),typeStatus:(f.types?.length||f.type||f.typeId||m.classification?.confirmed?.types?.length)?'confirmed':types.length?'suggested':'unresolved',
 typeReason:m.classification?.typeRecommendation?.reason||null,
 tags:Array.isArray(f.tags)?f.tags:(m.management?.tags||[])};
}
export function score(c){const e=D.effective(c),d=c.metadata?.difficulty||{};const numeric=e.number===null?(d.reassessmentRequired?'문항 변경 · AI 난이도 재확인 필요':'미평가'):e.number.toFixed(1)+'점 · '+e.numberSource;return numeric+(e.number!==null?' / '+D.compositionLabels[D.compositionBand(c)]:' · 미분석·판단보류');}
export function sourceLabel(c){
 const s=sourceInfo(c);
 return [s.school,s.grade,s.year&&s.year+'학년도',s.term,s.exam,s.number&&originalNumberText(s.number)].filter(Boolean).join(' · ');
}
export function originalNumberText(number){const value=String(number||'').trim();return value?'원문 '+value+(/번$/.test(value)?'':'번'):null;}
export function formatSourcePoints(points){return points===null||points===undefined||String(points).trim()===''?'미확인':/점/.test(String(points))?String(points):String(points)+'점';}
export function previewText(body){
 if(!body)return '상세보기에서 문항을 확인하세요.';
 // Search intentionally returns a short excerpt; avoid exposing an equation
 // cut in the middle by the API's 350-character limit.
 let text=textTools.splitSourcePoints(String(body)).body;const dollars=[...text.matchAll(/(?<!\\)\$/g)];
 if(dollars.length%2)text=text.slice(0,dollars.at(-1).index)+' …';
 if(!text.includes('$')&&/\\[a-zA-Z]+/.test(text))return '수식이 포함된 문항입니다. 미리보기에서 전체 문제를 확인하세요.';
 return text.trim()==='…'?'수식이 포함된 문항입니다. 미리보기에서 전체 문제를 확인하세요.':text;
}
