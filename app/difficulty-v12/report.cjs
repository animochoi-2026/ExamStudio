'use strict';
const tier=n=>typeof n!=='number'?'미평가':n<=2?'T0':n<=3.8?'T1':n<=5.8?'T2':n<=7.7?'T3':n<=9.4?'T4':'T5';
function report(rows){
 const before={},after={},transitions={},failures=[],groups=new Map(),samples=[];
 for(const row of rows){const c=row.state?.result?.computed,old=tier(row.previousScore),next=c?.status==='complete'?c.problem_tier:old;before[old]=(before[old]||0)+1;after[next]=(after[next]||0)+1;transitions[old+' → '+next]=(transitions[old+' → '+next]||0)+1;
  if(c?.status!=='complete'){failures.push({id:row.id,status:row.state?.status,reason:c?.reason||row.state?.error});continue;}
  for(const key of [c.problem_tier,...c.promotions.map(g=>'gate:'+g)]){if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
 }
 const seen=new Set();for(let round=0;samples.length<20;round++){let added=false;for(const list of groups.values()){const row=list[round];if(row&&!seen.has(row.id)){seen.add(row.id);samples.push({...row,detailRoute:'question/'+row.revisionId});added=true;if(samples.length===20)break;}}if(!added&&round>=rows.length)break;}
 return {total:rows.length,before,after,transitions,failures,samples};
}
module.exports={report};
