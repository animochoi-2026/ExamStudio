'use strict';
const exam=require('../app/bank-exam-model.cjs');
const original=require('./original-question.cjs');
const KIND='past-paper-print';
const schoolKey=s=>JSON.stringify([s.schoolId||'',s.region||'',s.school||'']);
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
   items.push({questionId:c.question_id,revisionId:c.revision_id,sourceId:source.source_id,year:Number(source.source.academicYear),originalNumber:original.printedNumber(c),workspaceMm:0,breakBefore:null,...(fit.solution?{solutionSnapshot:fit.solution.text,selectedSolutionId:fit.solutionId}:{})});
  }
 }
 return {items,excluded};
}
function groups(items){const out=[];for(const [index,item]of items.entries()){let g=out.at(-1);if(!g||g.year!==item.year){g={year:item.year,items:[]};out.push(g);}g.items.push({...item,index});}return out;}
// Existing two-column / two-slot layout. Tall questions can increase this estimate.
const estimate=items=>1+groups(items).reduce((n,g)=>n+Math.ceil(g.items.length/4),0);
module.exports={KIND,schoolKey,matches,collect,groups,estimate};
