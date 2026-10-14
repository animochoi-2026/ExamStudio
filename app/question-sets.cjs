(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ExamQuestionSets=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const clone=x=>structuredClone(x),id=x=>x.bankQuestionId||x.questionId||x.question_id;
function descriptor(row){return row.questionSet||row.metadata?.relations?.questionSet||null;}
function attach(rows,sets){return rows.map(row=>{if(row.metadata?.relations?.originalQuestionId||row.metadata?.relations?.derivedFromQuestionId)return row;const s=row.metadata?.source||{},set=sets.find(g=>g.source_document===s.documentId&&g.original_numbers.includes(String(s.originalNumber)));return set?{...row,questionSet:clone(set)}:row;});}
function members(row){const g=descriptor(row);if(!g)return [id(row)];if(!g.complete)throw Error(`세트 [${g.original_numbers.join('·')}]의 짝 문항이 미등록·접근 불가·보관 상태입니다.`);return g.members.map(x=>x.questionId);}
function units(rows,{strict=true}={}){
 const byId=new Map(rows.map(r=>[id(r),r])),seen=new Set(),out=[];
 for(const row of rows){if(seen.has(id(row)))continue;let ids;try{ids=members(row);}catch(e){if(strict)throw e;seen.add(id(row));continue;}
  if(ids.some(x=>!byId.has(x))){if(strict)throw Error('세트 일부 문항이 없거나 출제 조건 밖입니다. 짝 문항과 함께 선택하세요.');ids.forEach(x=>seen.add(x));continue;}
  const group=ids.map(x=>byId.get(x));if(group.some(x=>descriptor(x)?.id!==descriptor(row)?.id)){if(strict)throw Error('세트 연결 정보가 서로 다릅니다.');continue;}
  ids.forEach(x=>seen.add(x));out.push(group);
 }return out;
}
function ordered(rows){return units(rows).flat();}
function complete(rows){try{units(rows);return true;}catch{return false;}}
function selection(selected,row,pool){const group=members(row),map=new Map(pool.map(c=>[id(c),c]));if(group.some(x=>!map.has(x)))throw Error('세트 짝 문항을 읽을 수 없습니다.');const remove=selected.some(c=>id(c)===id(row));return remove?selected.filter(c=>!group.includes(id(c))):ordered([...selected,...group.filter(x=>!selected.some(c=>id(c)===x)).map(x=>map.get(x))]);}
function move(rows,from,to){const groups=units(rows),a=groups.findIndex(g=>g.some(x=>id(x)===id(rows[from]))),b=groups.findIndex(g=>g.some(x=>id(x)===id(rows[to])));if(a<0||b<0||a===b)return rows.slice();const [g]=groups.splice(a,1);groups.splice(b,0,g);return groups.flat();}
function remove(rows,index){const ids=members(rows[index]);return rows.filter(x=>!ids.includes(id(x)));}
function issues(rows){const problems=[];for(const row of rows){const g=descriptor(row);if(!g||problems.some(p=>p.id===g.id))continue;try{const ids=members(row),at=rows.findIndex(x=>id(x)===ids[0]);if(ids.some((x,i)=>id(rows[at+i]||{})!==x))problems.push({id:g.id,set:g,message:'세트 구성원의 누락·순서·연속 배치를 확인하세요.'});}catch(e){problems.push({id:g.id,set:g,message:e.message});}}return problems;}
function detect(text){const m=/\[\s*(\d{1,3})\s*[~～–−-]\s*(\d{1,3})\s*\]/.exec(text||'');if(!m)return null;const first=+m[1],last=+m[2];return last>first&&last-first<20?{originalNumbers:Array.from({length:last-first+1},(_,i)=>String(first+i)),status:'needs_confirmation',evidence:m[0]}:null;}
function proposal(problem){const explicit=detect(problem.recognition?.setContext?.evidence);if(explicit)return explicit;for(const m of problem.recognition?.materials||[]){const p=detect(m.label+' '+m.text);if(p)return p;}for(const n of problem.original?.layoutDocument?.nodes||[]){const p=detect((n.inlines||[]).map(i=>i.text).join(''));if(p)return p;}return detect(problem.recognition?.text||problem.original?.body);}
function output(question,set,number,isFirst){
 const q=clone(question),rule=set.member_output?.[number]||{},nodes=q.layoutDocument?.nodes;
 // Only explicitly reviewed common nodes/materials are suppressed. Original
 // images and stored snapshots remain untouched.
 if(nodes)q.layoutDocument.nodes=nodes.filter(n=>!(rule.commonNodeIds||[]).includes(n.id));
 q.hiddenFigureIds=[...new Set([...(q.hiddenFigureIds||[]),...(rule.commonFigureIds||[])])];
 if(isFirst){
  const common=clone(set.common.nodes);q.layoutDocument||={schemaVersion:1,nodes:[]};
  if(!nodes)q.layoutDocument=null; // Caller uses common content separately for legacy questions.
  return {question:q,common};
 }return {question:q,common:[]};
}
function paragraph(id,text){
 const inlines=[],pattern=/(\$\$[\s\S]*?\$\$|\$[^$]*?\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))/g;let at=0;
 const add=(kind,text)=>inlines.push({kind,text,label:'',border:'none',widthEm:0,align:'left',origin:'printed'});
 for(const m of text.matchAll(pattern)){if(m.index>at)add('text',text.slice(at,m.index));const token=m[0],n=token.startsWith('$$')||token.startsWith('\\')?2:1;add('math',token.slice(n,-n));at=m.index+token.length;}if(at<text.length)add('text',text.slice(at));
 return {id,parentId:null,type:'paragraph',origin:'printed',align:'left',widthRatio:1,figureId:null,diagram:null,inlines};
}
function forPrint(question,set,{start=1,first=true,originalNumber}={}){
 const q=clone(question),rule=set.member_output?.[originalNumber]||{};
 let own=q.layoutDocument?.nodes;
 if(own)own=own.filter(n=>!(rule.commonNodeIds||[]).includes(n.id));
 else {if(q.statementBox?.length||q.sourceFigures?.some(f=>!(rule.commonFigureIds||[]).includes(f.id))||q.diagramMode==='source'&&!(rule.commonFigureIds||[]).includes('diagram'))throw Error('세트 공통 자료와 개별 그림의 출력 분리를 확인하세요.');own=[paragraph('set-member-body',q.body||'')];}
 const common=first?clone(set.common.nodes):[];
 for(const n of common){const old=n.id;n.id='set-common-'+old;if(n.diagram)n.figureId='set-common-figure-'+old;n.parentId=n.parentId?'set-common-'+n.parentId:null;for(const x of n.inlines||[])if(x.kind==='text')x.text=x.text.replace(/\[\s*\d+\s*[~～–−-]\s*\d+\s*\]/g,`[${start}~${start+set.original_numbers.length-1}]`);}
 if(first&&!common.some(n=>(n.inlines||[]).some(i=>i.kind==='text'&&detect(i.text))))common.unshift(paragraph('set-common-number-range',`[${start}~${start+set.original_numbers.length-1}] 다음 공통 자료를 읽고 물음에 답하시오.`));
 q.layoutMode='structure';q.layoutDocument={version:1,features:['interleavedFlow','multipleFigures'],nodes:[...common,...own]};
 const visible=new Set(common.filter(n=>n.type==='figure'&&!n.diagram).map(n=>n.figureId));q.hiddenFigureIds=[...new Set([...(q.hiddenFigureIds||[]),...(rule.commonFigureIds||[])])].filter(id=>!visible.has(id));q.materialBounds=clone(rule.materialBounds||{});q.questionSet=clone(set);q.setHeading=first?`[${start}~${start+set.original_numbers.length-1}]`:null;
 return q;
}
return {descriptor,attach,members,units,ordered,complete,selection,move,remove,issues,detect,proposal,output,paragraph,forPrint};
});
