(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ExamQuestionPresentation=api;})(globalThis,()=>{
 'use strict';
 function subparts(value){
  const text=String(value||'');
  // Mask formulas without changing offsets. Parenthesized numbers in math are not subquestions.
  const masked=text.replace(/\$\$[\s\S]*?\$\$|(?<!\\)\$[^$\n]*?(?<!\\)\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)/g,m=>' '.repeat(m.length));
  const marks=[...masked.matchAll(/(?:^|\s)[(（](\d{1,2})[)）](?=\s|$)/g)];
  if(marks.length<2||marks.some((m,i)=>Number(m[1])!==i+1))return[text];
  const cuts=marks.slice(1).map(m=>m.index+m[0].search(/[(（]/)),result=[];let start=0;
  for(const end of cuts){result.push(text.slice(start,end).trimEnd());start=end;}result.push(text.slice(start));return result;
 }
 function positionRequest(value){
  const text=String(value||'').trim().replace(/^(그림|도형|이미지)\s+(?!위치)/,'$1을 ');if(/(?:옮기|바꾸|배치|놓|넣|이동).{0,6}(?:말|않)/.test(text))return null;
  const figure='(?:그림|도형|이미지)',up='(?:위쪽|위|앞|먼저)',down='(?:아래쪽|아래|밑|뒤|나중)';
  const target=direction=>new RegExp(figure+'(?:을|를|은|는|의?\\s*위치(?:를|는)?)+\\s*(?:문제|본문|지문)?(?:의|보다)?\\s*'+direction+'(?:로|에|쪽|부터|으로|\\s|$)').test(text)||new RegExp('(?:문제|본문|지문)(?:의)?\\s*'+direction+'(?:로|에)\\s*'+figure).test(text);
  const before=target(up),after=target(down);return before===after?null:before?'before':'after';
 }
 function choiceLayoutRequest(value){
  const text=String(value||'');if(!/(?:선택지|객관식|보기)/.test(text)||/(?:하지\s*마|말고|않)/.test(text))return null;
  if(/세로|한\s*줄(?:에|마다)\s*(?:하나|한\s*개|1개)/.test(text))return 'vertical';
  if(/자동\s*(?:정렬|배치)|기존\s*(?:정렬|배치)/.test(text))return 'auto';return null;
 }
 function presentationOnly(value){return !!(positionRequest(value)||choiceLayoutRequest(value))&&!/(?:생성|만들|풀이|정답|풀어|수치|숫자|각도|좌우|조건|빗금|색칠|다시\s*그|재인식|재생성|추가)/.test(value);}
 function flowParts(value){
  const text=String(value||''),legacy=subparts(text),cuts=new Map();let offset=0;
  for(let i=1;i<legacy.length;i++){offset=text.indexOf(legacy[i],offset+legacy[i-1].length);cuts.set(offset,`part:${i}`);}
  const masked=text.replace(/\$\$[\s\S]*?\$\$|(?<!\\)\$[^$\n]*?(?<!\\)\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)/g,m=>' '.repeat(m.length));
  let gap=0;
  for(const m of masked.matchAll(/\r?\n[\t ]*\r?\n(?:[\t ]*\r?\n)*[\t ]*|\r?\n[\t ]*(?=[(（]\d{1,2}[)）]\s)/g)){
   const at=m.index+m[0].length;if(at<text.length&&!cuts.has(at))cuts.set(at,`gap:${++gap}`);
  }
  // Keep historical gap:N identifiers stable; single-line boundaries get their
  // own namespace so saved figure placements are not silently moved.
  let line=0;
  for(const m of masked.matchAll(/\r?\n[\t ]*/g)){
   const at=m.index+m[0].length;
   if(at<text.length&&!/[\r\n]/.test(masked[at])&&!cuts.has(at)&&!cuts.has(m.index)&&!/[\r\n]/.test(masked[m.index-1]||''))cuts.set(at,`line:${++line}`);
  }
  const starts=[0,...[...cuts.keys()].filter(n=>n>0).sort((a,b)=>a-b)];
  return starts.map((start,i)=>({text:text.slice(start,starts[i+1]??text.length).trimEnd(),slot:i?cuts.get(start):'before'}));
 }
 function validSlot(slot,count,body){return slot==='before'||slot==='after'||(/^part:[1-9]\d*$/.test(slot)&&Number(slot.slice(5))<count)||(body!==undefined&&flowParts(body).some(p=>p.slot===slot));}
 function figureSlot(question,id){
  const slot=question.figurePlacements?.[id];
  return validSlot(slot,subparts(question.body).length,question.body)?slot:id==='diagram'&&question.diagramPosition==='before'?'before':'after';
 }
 function boxSlot(question){const slot=question.boxSlot;return validSlot(slot,subparts(question.body).length,question.body)?slot:'after';}
 function placementOptions(body){return [{value:'before',label:'문제 위'},...flowParts(body).slice(1).map((p,i)=>({value:p.slot,label:`본문 사이 ${i+1} · ${p.text.replace(/\s+/g,' ').slice(0,24)} 앞`})),{value:'after',label:'문제 아래'}];}
 function choiceColumns(q){
  const t=q.choiceColumns;if(!t)return null;
  if(t.version!==1||t.sourceConfirmed!==true||JSON.stringify(t.sourceChoices)!==JSON.stringify(q.choices))return null;
  if(!Array.isArray(t.headers)||!t.headers.length||t.headers.length>6||!t.headers.every(x=>typeof x==='string')||!Array.isArray(t.rows)||t.rows.length!==q.choices.length||!t.rows.every(r=>Array.isArray(r)&&r.length===t.headers.length&&r.every(x=>typeof x==='string')))throw Error('선택지 열의 원본 대응을 확인하세요.');
  return t;
 }
 function choiceColumnsHtml(q,math){const t=choiceColumns(q);if(!t)return null;const cell=(s,tag='td')=>'<'+tag+' style="text-align:center;padding:.25em">'+math(s)+'</'+tag+'>';return '<table class="choice-column-table" style="width:100%;border-collapse:collapse"><thead><tr>'+['',...t.headers].map(s=>cell(s,'th')).join('')+'</tr></thead><tbody>'+t.rows.map((r,i)=>'<tr>'+['①②③④⑤⑥⑦⑧'[i]||String(i+1),...r].map(s=>cell(s)).join('')+'</tr>').join('')+'</tbody></table>';}
 return{subparts,flowParts,positionRequest,choiceLayoutRequest,presentationOnly,validSlot,figureSlot,boxSlot,placementOptions,choiceColumns,choiceColumnsHtml};
});
