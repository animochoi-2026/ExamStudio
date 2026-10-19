'use strict';
const model=require('./bank-exam-model.cjs');
function summary(items,catalogs=new Map()){
 const schools={},difficulty={low:0,middle:0,high:0,killer:0,unknown:0};
 for(const item of items){const c=catalogs.get(item.revisionId)||item.catalogSnapshot,school=c?.metadata?.source?.school||'출처 미확인';schools[school]=(schools[school]||0)+1;const row=Object.hasOwn(item,'scoreSnapshot')?{confirmed:{difficulty:item.scoreSnapshot},metadata:{}}:c,score=row?model.numericScore(row):null,band=row?model.compositionBand(row):'unknown';difficulty[Object.hasOwn(difficulty,band)?band:'unknown']++;if(score!=null&&score>=9)difficulty.killer++;}
 return {total:items.length,schools,difficulty};
}
function text(items,catalogs){const s=summary(items,catalogs),d=s.difficulty;return '이 시험지는 '+Object.entries(s.schools).map(([name,n])=>name+' '+n+'문항').join(', ')+'으로 구성되었습니다. 난이도: 상 '+d.high+'문항'+(d.killer?'(킬러 '+d.killer+'문항 포함)':'')+', 중 '+d.middle+'문항, 하 '+d.low+'문항'+(d.unknown?', 미확인 '+d.unknown+'문항':'')+'.';}
module.exports={summary,text};
