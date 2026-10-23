'use strict';
const B=require('../app/bank-exam-model.cjs'),alias=require('../app/school-alias.cjs');
const labels={low:'하',middle:'중',high:'상',unknown:'미평가',deferred:'판단 보류'};
function summarize(rows){
 const groups=new Map();for(const row of rows){const c=row.catalogSnapshot||row,s=c.metadata?.source||{},school=alias.name(s.school,s.region)||'학교 정보 없음',band=B.compositionBand(c),score=B.numericScore(c),key=JSON.stringify([school,band,score]);
  if(!groups.has(key))groups.set(key,{school,band,score,count:0});groups.get(key).count++;
 }
 return [...groups.values()].sort((a,b)=>a.school.localeCompare(b.school,'ko')||(a.score??Infinity)-(b.score??Infinity));
}
function lines(rows){return summarize(rows).map(g=>`${g.school} · ${labels[g.band]||'미평가'} · ${g.score==null?'점수 없음':g.score.toFixed(2)+'점'} · ${g.count}문항`);}
module.exports={summarize,lines};
