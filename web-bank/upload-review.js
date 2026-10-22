import review from './source-review.cjs';
// Uses the editor's shared revision version, so warning and full review saves cannot overwrite each other.
export function uploadReview({c,node,action,save,message}){
 const reasons=review.acknowledgeableReasons(c),history=c.confirmed?.uploadReview;if(!reasons.length&&!history)return null;
 const box=node('section','','panel upload-review-panel');box.append(node('h3','업로드 확인 사항'),node('p','원본과 대조해 확인한 항목만 체크한 뒤 저장하세요. 문항 전체의 검수 완료와는 별개이며 원래 경고는 이력으로 보존합니다.','hint'));
 const done=new Set(review.acknowledgedReasons(c)),inputs=[];
 for(const reason of reasons){const label=node('label','','upload-review-item'),input=node('input');input.type='checkbox';input.checked=done.has(reason);input.disabled=done.has(reason);label.append(input,node('span',reason+(done.has(reason)?' · 확인 완료':'')));box.append(label);inputs.push({input,reason});}
 const result=node('p','','hint');let busy=false;
 box.append(action('선택한 사유 확인 완료',async()=>{if(busy)return;const selected=inputs.filter(x=>x.input.checked&&!done.has(x.reason)).map(x=>x.reason);if(!selected.length){result.textContent='새로 확인한 항목을 선택해 주세요.';return;}busy=true;box.inert=true;try{const saved=await save(selected,review.reviewEvidence(c));c.confirmed={...c.confirmed,uploadReview:saved};for(const {input,reason}of inputs)if(saved.reasons.includes(reason)){done.add(reason);input.checked=true;input.disabled=true;input.nextElementSibling.textContent=reason+' · 확인 완료';}result.textContent='확인 기록을 저장했습니다. 해당 경고는 목록에서 숨겨집니다.';message(result.textContent);}finally{busy=false;box.inert=false;}}),result);
 if(history){const detail=node('details');detail.append(node('summary','이전 확인 이력'),node('p',(history.reasons||[]).join(' · ')),node('small',history.at?new Date(history.at).toLocaleString('ko-KR'):''));box.append(detail);}
 return {element:box,dirty:()=>busy||inputs.some(x=>x.input.checked&&!done.has(x.reason))};
}
