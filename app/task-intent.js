(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ExamTaskIntent=api;})(globalThis,function(){
 const quantityWords={한:1,하나:1,두:2,둘:2,세:3,셋:3,네:4,넷:4,다섯:5,여섯:6,일곱:7,여덟:8,아홉:9,열:10};
 function requestedBatches(text){
  const t=String(text||''),matches=[...t.matchAll(/(\d+(?:\.\d+)?|하나|한|둘|두|셋|세|넷|네|다섯|여섯|일곱|여덟|아홉|열)\s*(?:개|문제|문항)/g)],batches=[];let end=0;
  for(const m of matches){const clause=t.slice(end,m.index);end=m.index+m[0].length;
   if(/(?:총|합계|모두)\s*$/.test(clause))continue;
   const variant=/좌우|반전/.test(clause)?'mirror_numeric':/다른\s*성질|성질.*바꿔/.test(clause)?'alternative_property':/수치|숫자/.test(clause)?'numeric_only':'';
   if(!variant)return [];
   batches.push({variant,count:quantityWords[m[1]]??Number(m[1])});
  }
  return batches.length>1?batches:[];
 }
 function requestedCount(text){
  const numbers={한:1,하나:1,두:2,둘:2,세:3,셋:3,네:4,넷:4,다섯:5,여섯:6,일곱:7,여덟:8,아홉:9,열:10};
  const token='(\\d+(?:\\.\\d+)?|하나|한|둘|두|셋|세|넷|네|다섯|여섯|일곱|여덟|아홉|열)';
  const t=String(text||'');
  const batches=requestedBatches(t);if(batches.length)return batches.reduce((sum,b)=>sum+b.count,0);
  // Prefer an explicit question quantity, then a quantity attached to a creation verb.
  const match=t.match(new RegExp('(?:유사\\s*문제|새\\s*문제|문제|문항)\\s*'+token+'\\s*(?:개|문항)'))
   ||t.match(new RegExp(token+'\\s*(?:개|문제|문항)(?:를|만|씩|정도)?\\s*[^.!?\\n\\d]{0,40}?(?:만들|생성|추가)'))
   ||t.match(new RegExp(token+'\\s*(?:문제|문항)(?![가-힣])'));
  return match?(numbers[match[1]]??Number(match[1])):undefined;
 }
 function directInstructions(request={}){
  return String(request.userInstructions||request.regenerationInstructions||request.solutionInstructions||request.additionalInstructions||(!request.requestKind||request.requestKind==='chat'?request.text:'')||'').trim();
 }
 function generationDifficulty(request={}){
   const direct=directInstructions(request),matches=[...direct.matchAll(/난이도\s*(?:는|를|:)?\s*(중상|중하|상|중|하)(?=$|[^가-힣]|으로|로)|(?:^|[^가-힣])(중상|중하|상|중|하)\s*(?:난이도|수준)/g)];
  const last=matches.at(-1);return last?(last[1]||last[2]):request.regenerateOf?(request.difficulty||'same'):'same';
 }
 function generationCount(request={}){
  const explicit=requestedCount(directInstructions(request));
  if(explicit===undefined&&(request.requestKind==='suggestion'||request.regenerateOf))return 1;
  const count=explicit??requestedCount(request.text)??request.count??1;
  if(!Number.isSafeInteger(count)||count<1||count>1000)throw Error('생성 개수는 1~1000 사이의 정수로 입력하세요.');
  return count;
 }
 function infer(text){
  const t=String(text||'').trim(),out={};
  if(/좌우|반전/.test(t))out.variant='mirror_numeric';else if(/다른\s*성질|성질.*바꿔/.test(t))out.variant='alternative_property';else if(/수치|숫자/.test(t))out.variant='numeric_only';
  // A referenced variant identifies the target, not the requested operation.
  const action=t.replace(/(?:유사\s*문제|변형)\s*\d+\s*번/g,'');
  const newQuestion=/(?:유사\s*문제|새\s*문제|추가\s*문제|문항).*(?:만들|생성|추가)|(?:\d+|한|두|세)\s*(?:개|문제|문항).*만들/.test(action);
  const writeSolution=/(?:풀이|해설|정답).*(?:재생성|다시|작성|바꿔)|풀어|풀고|풀되|풀어서/.test(action);
  if(newQuestion)out.task='generation';
  else if(/그림|도형/.test(action)&&/다시|그려|수정|고쳐/.test(action)&&!/문제.*만들/.test(action)){out.task='recognition';out.recognitionTarget='diagram';out.additionalInstructions=t;out.force=true;out.acceptReplacement=true;}
  else if(writeSolution&&!/맞는지|올바른지|검토|재검수/.test(action))out.task='solve';
  else if(/재검수|검산|검토|맞는지|확인해/.test(action))out.task='validation';
  else if(/풀이|풀어|해설|정답.*작성/.test(action))out.task='solve';
  else if(/전체.*인식|다시.*인식|문장.*인식|본문.*인식|원문.*인식/.test(t)){out.task='recognition';out.recognitionTarget=/문장|본문|글자/.test(t)?'text':'all';out.force=true;out.acceptReplacement=true;}
  else if(/교정|잘못.*읽|오인식|오타/.test(t)){out.task='revision';out.revisionMode='correction';}
  else if(/바꿔|수정|고쳐|변경/.test(t)){out.task='revision';out.revisionMode='content';}
  if(!out.task&&/유사\s*문제|새\s*문제|만들어|생성|변형/.test(action))out.task='generation';
  if(out.task==='solve')out.force=true;
  if(out.task==='generation'&&requestedCount(t)!==undefined)out.count=requestedCount(t);
  const target=t.match(/(?:유사문제|변형)\s*(\d+)\s*번|(?:유사문제|변형)\s*(\d+)(?!\d|\s*(?:개|문항|문제))/);if(target)out.variantIndex=Number(target[1]||target[2])-1;
  return out;
 }
 return{infer,requestedCount,requestedBatches,generationCount,generationDifficulty,directInstructions};
});
