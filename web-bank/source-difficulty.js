import model from '../app/bank-exam-model.cjs';

export function sourceDifficultyStatus(questions){
 const total=questions.length,scored=questions.map(c=>({score:model.numericScore(c),confirmed:c.confirmed?.difficulty!==null&&c.confirmed?.difficulty!==undefined&&c.confirmed?.difficulty!==''}));
 const rated=scored.filter(x=>x.score!==null&&Number.isFinite(x.score));
 if(!total)return '등록 문항 없음';
 if(rated.length<total)return rated.length?`난이도 평가 중 · ${rated.length}/${total}문항`:'난이도 미평가';
 const average=(rated.reduce((sum,x)=>sum+x.score,0)/total).toFixed(1);
 return `평균 난이도 ${average} · ${rated.every(x=>x.confirmed)?'공동 확정':'잠정 평가 포함'}`;
}

export function sourceDifficultySummary(value){
 const {total,numericCount,confirmedCount,average}=value||{};
 if(!Number.isSafeInteger(total)||total<0||!Number.isSafeInteger(numericCount)||numericCount<0||numericCount>total||!Number.isSafeInteger(confirmedCount)||confirmedCount<0||confirmedCount>numericCount)throw Error('난이도 저장 집계를 확인할 수 없습니다.');
 if(!total)return '등록 문항 없음';
 if(numericCount<total)return numericCount?`난이도 평가 중 · ${numericCount}/${total}문항`:'난이도 미평가';
 if(typeof average!=='number'||!Number.isFinite(average)||average<0||average>10)throw Error('난이도 저장 집계를 확인할 수 없습니다.');
 return `평균 난이도 ${average.toFixed(1)} · ${confirmedCount===numericCount?'공동 확정':'잠정 평가 포함'}`;
}
export async function loadSourceDifficulty(rpc,spaceId,sourceId,stored=null){
 return sourceDifficultySummary(stored??await rpc('bank_source_difficulty',{s:spaceId,source_key:sourceId}));
}
