'use strict';
function apply(result){
 const resolution=result.intendedSolution;
 if(!resolution)return null;
 if(!['answer','interpretation','sourceError'].every(k=>typeof resolution[k]==='string'&&resolution[k].trim())||!result.solution?.trim())throw Error('출제 의도에 따른 정답·완성된 해설·조건 오류 설명이 필요합니다.');
 const note='[원문 조건 오류 및 출제 의도]\n'+resolution.sourceError.trim()+'\n'+resolution.interpretation.trim();
 const record={...structuredClone(resolution),originalHoldReason:result.holdReason||''};
 result.answer=resolution.answer.trim();
 if(!result.solution.includes(note))result.solution=result.solution.trimEnd()+'\n\n'+note;
 result.holdReason='';
 return record;
}
const assessmentInstructions='\n[출제 의도와 난이도] intendedSolution에 특정할 수 있는 출제 의도의 정답·해석·원문 오류를 기록하고 완성된 해설을 작성했다면, 같은 응답의 assessment와 queueClassification도 그 해석의 핵심 풀이를 기준으로 작성하세요. 원문 오류는 limitations와 해설 하단에 보존하고, 오류를 입증하는 부가 설명은 본래 문항의 난이도에 더하지 마세요. 이미 해석을 확정했는데 원문 모순만으로 난이도를 다시 보류하지 마세요. 해석이나 핵심 풀이가 실제로 미확정이면 점수·유형을 지어내지 않습니다.';
module.exports={apply,assessmentInstructions};
