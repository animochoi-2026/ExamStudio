(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./diagram-layout.js'):root.ExamDiagramLayout);if(typeof module==='object'&&module.exports)module.exports=api;else root.ExamStructuredLayout=api;})(globalThis,(diagramLayout)=>{
 'use strict';
 const FEATURES=['multiElementBox','inlineBlanks','multipleFigures','interleavedFlow','proofSteps'];
 const containers=new Set(['box','figureGroup']);
 function validate(value){
  if(value==null)return null;
  if(value.version!==1||!Array.isArray(value.features)||value.features.some(f=>!FEATURES.includes(f))||!Array.isArray(value.nodes)||!value.nodes.length||value.nodes.length>250)throw Error('복합 배치 데이터 형식을 확인하세요.');
  const seen=new Map();let chars=0,ancestors=[];
  for(const n of value.nodes){
   if(!n||typeof n.id!=='string'||!/^[-\w]{1,80}$/.test(n.id)||seen.has(n.id)||!['paragraph','proofStep','box','figureGroup','figure','arrow'].includes(n.type)||!['printed','handwritten','uncertain'].includes(n.origin)||!['left','center','right'].includes(n.align)||!Number.isFinite(n.widthRatio)||n.widthRatio<=0||n.widthRatio>1||!Array.isArray(n.inlines))throw Error('복합 배치 요소 형식을 확인하세요.');
   if(n.parentId!==null&&(!seen.has(n.parentId)||!containers.has(seen.get(n.parentId).type)))throw Error('복합 배치의 포함관계 또는 순서가 올바르지 않습니다.');
   if(n.parentId===null)ancestors=[];else{const index=ancestors.indexOf(n.parentId);if(index<0)throw Error('복합 배치의 읽기 순서가 포함관계와 다릅니다.');ancestors=ancestors.slice(0,index+1);}if(containers.has(n.type))ancestors.push(n.id);
   let depth=0,parent=n.parentId;while(parent!==null){parent=seen.get(parent).parentId;if(++depth>8)throw Error('복합 배치 중첩이 너무 깊습니다.');}
   if(containers.has(n.type)&&n.inlines.length)throw Error('상자·도형 묶음의 글은 내부 문단으로 기록하세요.');
   if(n.type==='figure'&&!n.diagram&&!n.figureId)throw Error('복합 배치 그림 데이터가 없습니다.');
   for(const x of n.inlines){
    if(!x||!['text','math','blank','reason'].includes(x.kind)||typeof x.text!=='string'||typeof x.label!=='string'||!['none','box','underline'].includes(x.border)||!['left','center','right'].includes(x.align)||!['printed','handwritten','uncertain'].includes(x.origin)||!Number.isFinite(x.widthEm)||x.widthEm<0||x.widthEm>30)throw Error('문장 속 수식·빈칸 형식을 확인하세요.');
    if(x.kind==='blank'&&(x.widthEm<1||x.border==='none'||x.text))throw Error('빈칸은 답 없이 실제 테두리와 너비로 기록하세요.');
    if(x.kind==='blank'&&/[①-⑳]/.test(x.label))throw Error('빈칸 표지와 증명 근거번호를 구분하세요.');
    chars+=x.text.length+x.label.length;if(chars>100000)throw Error('복합 배치 본문이 너무 깁니다.');
   }
   seen.set(n.id,n);
  }
  return value;
 }
 function tree(value){validate(value);const roots=[],seen=new Map();for(const n of value.nodes){const item={...n,children:[]};seen.set(n.id,item);if(n.parentId===null)roots.push(item);else seen.get(n.parentId).children.push(item);}return roots;}
 function status(q){const document=q.layoutDocument,mode=q.layoutMode||'auto';if(mode==='normal')return{active:false,message:'일반 출력 · 저장 데이터로 출력 재생성'};if(!document)return{active:false,missing:mode==='structure',message:'구조 정보 없음 · 수동 구조 교정 또는 AI 재인식 필요 (자동 호출 없음)'};validate(document);const active=mode==='structure'||new Set(document.features).size>=2;return{active,message:active?'구조 보존 · 저장 데이터로 출력 재생성 (AI 호출 없음)':'일반 출력 · 구조 특징이 복합 기준에 미달'};}
 function warnings(q){if(!q.layoutDocument)return[];const notes=[];for(const n of q.layoutDocument.nodes){if(n.origin==='uncertain'||n.inlines.some(x=>x.origin==='uncertain'))notes.push('부분 확인 필요: '+n.id);if(n.origin==='printed'&&n.type==='arrow'&&!n.inlines.some(x=>x.origin==='printed'&&['text','math'].includes(x.kind)&&x.text.trim()))notes.push('부분 확인 필요: '+n.id+' · 화살표의 방향·표시가 저장되지 않았습니다. 원본을 확인하여 구조 데이터를 교정하세요.');if(n.origin==='printed'&&n.type==='figure'&&n.figureId&&!n.diagram)notes.push('원본 이미지 사용: '+n.id+' · 필기 잔존 가능성 확인 필요');}return notes;}
 function diagramOptions(q,n){return q.layoutDocument?.nodes.some(p=>p.id===n.parentId&&p.type==='figureGroup')?{width:480,height:420}:{};}
 function incompleteArrow(n){return n.type==='arrow'&&n.origin==='printed'&&!n.inlines.some(x=>x.origin==='printed'&&['text','math'].includes(x.kind)&&x.text.trim());}
 function requireArrows(q){const missing=q.layoutDocument?.nodes.find(incompleteArrow);if(missing)throw Error('화살표 원본 확인 필요: '+missing.id+' — 방향·표지가 없는 구조로 출력할 수 없습니다.');}
 // A caller must have inspected the printed source. Never infer direction
 // from figure order, node ID, question number, or another example.
 function confirmArrow(q,{nodeId,symbol,sourceConfirmed}={}){
  if(sourceConfirmed!==true||typeof symbol!=='string'||!/^([←-↿⇐-⇿➔-➿⟵-⟿])$/u.test(symbol))throw Error('원본에서 확인한 화살표 기호가 필요합니다.');
  validate(q.layoutDocument);const out=structuredClone(q),n=out.layoutDocument?.nodes.find(n=>n.id===nodeId);
  if(!n||!incompleteArrow(n))throw Error('확인할 빈 인쇄 화살표를 다시 선택하세요.');
  n.inlines=[{kind:'text',text:symbol,label:'',border:'none',widthEm:0,align:n.align,origin:'printed'}];validate(out.layoutDocument);return out;
 }
 // An observed standalone blank is a paragraph in the existing flow schema.
 // Split only the selected inline; retain every printed token and its order.
 function confirmStandaloneBlank(q,{nodeId,inlineIndex,sourceConfirmed}={}){
  if(sourceConfirmed!==true||!Number.isInteger(inlineIndex))throw Error('원본에서 확인한 독립 줄 빈칸이 필요합니다.');
  validate(q.layoutDocument);const out=structuredClone(q),nodes=out.layoutDocument.nodes,index=nodes.findIndex(n=>n.id===nodeId),n=nodes[index],blank=n?.inlines[inlineIndex];
  if(!n||!['paragraph','proofStep'].includes(n.type)||n.origin!=='printed'||blank?.kind!=='blank'||blank.origin!=='printed')throw Error('확인할 수 있는 인쇄 빈칸을 선택하세요.');
  const used=new Set(nodes.map(n=>n.id)),newId=role=>{const base=n.id.slice(0,55)+'-'+role;let id=base,k=1;while(used.has(id))id=base+'-'+k++;used.add(id);return id;};
  const before=n.inlines.slice(0,inlineIndex),after=n.inlines.slice(inlineIndex+1),replacement=[];
  if(before.length)replacement.push({...n,inlines:before});
  replacement.push({...n,id:before.length?newId('blank'):n.id,align:blank.align,inlines:[blank]});
  if(after.length)replacement.push({...n,id:newId('after'),inlines:after});
  nodes.splice(index,1,...replacement);validate(out.layoutDocument);return out;
 }
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 // Recover only explicit source annotations. Keep the stored OCR untouched.
 function splitSourcePoints(value){
  const original=String(value||''),pairs={'(':')','[':']','（':'）','【':'】'},math=[...original.matchAll(/\$\$[\s\S]*?\$\$|(?<!\\)\$[^$\n]*?(?<!\\)\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]/g)];
  // A combined annotation has an explicit answer-count label. Remove only
  // its score and separator, preserving the count, wrapper and stored text.
  const count='정답\\s*\\d{1,2}\\s*개',separator='(?:\\s*[/／|｜·ㆍ,，;；:：\\-–—]\\s*|\\s+)',score='(\\d{1,2}(?:\\.\\d{1,2})?)\\s*점';
  const combined=new RegExp('([\\(\\[（【])(\\s*'+count+')'+separator+score+'\\s*([\\)\\]）】])|(^|[ \\t])('+count+')'+separator+score+'(?=\\s*$)','gu');
  let points=null;const body=original.replace(combined,(match,open,label,enclosedScore,close,prefix,bareLabel,bareScore,offset)=>{
   if((open&&pairs[open]!==close)||math.some(m=>offset>=m.index&&offset<m.index+m[0].length))return match;
   points??=Number(enclosedScore??bareScore);return open?open+label.trimEnd()+close:prefix+bareLabel;
  });
  const match=body.match(/\s*[([]\s*(\d{1,2}(?:\.\d)?)\s*점\s*[)\]]\s*$/u)||body.match(/(?<=[?？])\s*[([]\s*(\d{1,2}(?:\.\d)?)\s*점(?:\s*[)\]]|(?=\s*(?:$|\$|\\\()))/u);
  return{body:match?(body.slice(0,match.index)+body.slice(match.index+match[0].length)).trimEnd():body,points:points??(match?Number(match[1]):null),original};
 }
 function sourcePoints(q){return q.originalPoints??splitSourcePoints(q.body).points??(q.layoutDocument?.nodes.filter(n=>n.parentId===null&&n.type==='paragraph').map(n=>splitSourcePoints(n.inlines.filter(x=>x.origin==='printed'&&x.kind==='text').map(x=>x.text).join('')).points).find(p=>p!==null)??null);}
 function forOutput(q){
  if(q._outputFragment)return q;
  const leaders=new Map();for(const m of String(q.body||'').matchAll(/([.…]{2,}[ \t]*)([①-⑳])/gu)){const matches=leaders.get(m[2])||[];matches.push(m[1]);leaders.set(m[2],matches);}
  const layout=q.layoutDocument?{...q.layoutDocument,nodes:q.layoutDocument.nodes.map(n=>({...n,...(n.type==='figure'&&n.origin==='printed'&&n.diagram?{diagram:diagramLayout?.prepareObservedPerpendicularFeet(n.diagram)??n.diagram}:{}),inlines:n.inlines.map((x,i)=>{
   if(x.origin!=='printed')return{...x};
   if(x.kind==='text'&&n.parentId===null&&n.type==='paragraph')return{...x,text:splitSourcePoints(x.text).body};
   const matches=leaders.get(x.text.trim()),previous=n.inlines[i-1];
   if(x.kind==='reason'&&matches?.length===1&&!/[.…]{2,}\s*$/.test(previous?.text||''))return{...x,text:matches[0]+x.text};
   return{...x};
  })}))}:null;
  return{...q,body:splitSourcePoints(q.body).body,...(layout?{layoutDocument:layout}:{})};
 }
 // Stored math tokens may contain one legacy delimiter envelope. Their kind
 // already declares inline math; remove only that envelope, never inner $ or
 // LaTeX backslashes (including genuine aligned/matrix row separators).
 function inlineMath(value){
  const text=String(value??'').trim(),wrappers=[['$$','$$'],['$','$'],['\\(','\\)'],['\\[','\\]']];
  for(const [open,close] of wrappers){if(!text.startsWith(open))continue;
   if(text.length<open.length+close.length||!text.endsWith(close))throw Error('구조 인라인 수식의 구분자가 닫히지 않았습니다.');
   const source=text.slice(open.length,-close.length);
   if(open.includes('$')&&/(^|[^\\])(?:\\\\)*\$/.test(source))throw Error('구조 수식 토큰에는 한 개의 수식만 기록하세요.');
   if(open.includes('$')&&/(^|[^\\])(?:\\\\)*\\$/.test(source))throw Error('구조 인라인 수식의 구분자가 닫히지 않았습니다.');
   return source;
  }
  return text;
 }
 function html(q,{math,figure,number}={}){
  q=forOutput(q);
  const state=status(q);if(state.missing)throw Error(state.message);if(!state.active)return null;
  requireArrows(q);
  const inline=x=>{if(x.origin!=='printed')return '';if(x.kind==='blank')return `<span class="structure-blank ${x.border}" style="width:${x.widthEm}em;text-align:${x.align}" data-blank-label="${escape(x.label)}">${escape(x.label)||'&nbsp;'}</span>`;if(x.kind==='math'){const delimiter=x.display?'$$':'$';return math(delimiter+inlineMath(x.text)+delimiter);}return `<span${x.kind==='reason'?' class="structure-reason"':''}>${escape(x.text)}</span>`;};
  let numbered=false;
  const render=n=>{if(n.origin!=='printed')return '';const style=`text-align:${n.align};${n.parentId&&q.layoutDocument.nodes.find(p=>p.id===n.parentId)?.type==='figureGroup'?`flex:${n.widthRatio} 1 0;`:''}`;
   let content='';if(containers.has(n.type))content=n.children.map(render).join('');else if(n.type==='figure'){if(q.hiddenFigureIds?.includes(n.figureId))return '';content=figure(n);if(!content)throw Error('복합 배치 그림을 표시할 수 없습니다: '+n.id);}else{content=n.inlines.map(inline).join('');if(!numbered&&n.parentId===null&&number!=null){content=`<b>${number}.</b> `+content;numbered=true;}}
   return `<div class="structure-${n.type}" data-structure-id="${escape(n.id)}" style="${style}">${content}</div>`;
  };
  return `<div class="structured-content">${tree(q.layoutDocument).map(render).join('')}</div>`;
 }
 const css='.structured-content{min-width:0;overflow-wrap:break-word}.structure-box{border:0.6pt solid #444;padding:.6em;margin:.6em 0}.structure-paragraph,.structure-proofStep{margin:.3em 0;line-height:1.6;white-space:pre-wrap}.structure-figureGroup{display:flex;align-items:center;gap:.25em;break-inside:avoid;min-width:0}.structure-figureGroup>div{min-width:0}.structure-figure img,.structure-figure svg{display:block;width:100%;height:auto;max-height:66mm;object-fit:contain}.structure-arrow{white-space:nowrap}.structure-blank{display:inline-block;vertical-align:middle;max-width:100%;min-height:1.5em;line-height:1.5;box-sizing:border-box;white-space:nowrap;padding:0 .1em}.structure-blank.box{border:.6pt solid #222;margin:0;padding:0 .1em}.structure-blank.underline{border-bottom:.6pt solid #222}.structure-reason{white-space:nowrap}';
 return{FEATURES,validate,tree,status,warnings,diagramOptions,confirmArrow,confirmStandaloneBlank,requireArrows,inlineMath,splitSourcePoints,sourcePoints,forOutput,html,css};
});
