'use strict';
const exam=require('../app/bank-exam-model.cjs');
const original=require('./original-question.cjs');
const KIND='past-paper-print';
const schoolKey=s=>JSON.stringify([s.schoolId||'',s.region||'',s.school||'']);
function title(names,from,to){
 const schools=[...new Set(names.map(x=>String(x||'').trim()).filter(Boolean))];
 const years=from===to?`${from}년`:`${from}년~${to}년`;
 let school=schools.join(' · ');if(school.length+years.length+8>200)school=schools[0]+' 외 '+(schools.length-1)+'개교';
 return [school,'기출프린트',years].filter(Boolean).join(' ');
}
function header(group,source={}){
 const item=group.items[0],semester=String(item.semester??source.semester??'').trim(),exam=String(item.exam??source.exam??'').trim();
 return `[${group.year}년 ${/^[12]$/.test(semester)?semester+'학기':semester||'학기 미확인'} ${exam||'시험 구분 미확인'}]`;
}
function matches(source,{schools,from,to}){
 const s=source.source||{},year=Number(s.academicYear);
 return Number.isInteger(year)&&year>=from&&year<=to&&schools.includes(schoolKey(s));
}
function collect(sources,rows,units){
 const items=[],excluded=[];
 for(const source of [...sources].sort((a,b)=>Number(b.source.academicYear)-Number(a.source.academicYear)||a.source_id.localeCompare(b.source_id))){
  // Sort only; intentionally do not collapse repeated content or question IDs.
  const ordered=original.restoreItems(rows.get(source.source_id)||[],null,c=>c);
  for(const c of ordered){if(c.metadata?.relations?.originalQuestionId)continue;
   const fit=exam.scopeFit(c.metadata,units);if(!fit.ok){excluded.push({sourceId:source.source_id,questionId:c.question_id,reason:fit.reason});continue;}
   items.push({questionId:c.question_id,revisionId:c.revision_id,sourceId:source.source_id,year:Number(source.source.academicYear),semester:source.source.semester??null,exam:source.source.exam??null,originalNumber:original.printedNumber(c),workspaceMm:0,breakBefore:null,...(fit.solution?{solutionSnapshot:fit.solution.text,selectedSolutionId:fit.solutionId}:{})});
  }
 }
 return {items,excluded};
}
function groups(items){const out=[];for(const [index,item]of items.entries()){let g=out.at(-1);if(!g||g.year!==item.year||g.sourceId!==item.sourceId){g={year:item.year,sourceId:item.sourceId,items:[]};out.push(g);}g.items.push({...item,index});}return out;}
// Existing two-column / two-slot layout. Tall questions can increase this estimate.
const estimate=items=>1+groups(items).reduce((n,g)=>n+Math.ceil(g.items.length/4),0);
module.exports={KIND,schoolKey,title,header,matches,collect,groups,estimate};
