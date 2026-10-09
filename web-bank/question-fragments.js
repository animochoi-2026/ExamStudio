// Output-only slices of one question. Bank IDs, answers and saved content stay
// whole. The same measured native nodes are passed to DOCX and HWPX.
import structure from '../app/structured-layout.js';
import presentation from '../app/question-presentation.js';
import {questionContent} from './print-question.js';

const inline=(text,kind='text')=>({kind,text,label:'',border:'none',widthEm:0,align:'left',origin:'printed'});
function inlines(text){
 const out=[];let start=0;
 const pattern=/\$\$[\s\S]*?\$\$|(?<!\\)\$[^$\n]*?(?<!\\)\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)/g;
 for(const m of String(text).matchAll(pattern)){if(m.index>start)out.push(inline(text.slice(start,m.index)));out.push({...inline(structure.inlineMath(m[0]),'math'),display:m[0].startsWith('$$')||m[0].startsWith('\\[')});start=m.index+m[0].length;}
 if(start<text.length)out.push(inline(text.slice(start)));return out;
}
export function fragmentDocument(question,figures=[]){
 const q=structure.forOutput(question),nodes=[];let serial=0;
 const add=(type,values={})=>{let id;do{id='output-flow-'+serial++;}while(nodes.some(n=>n.id===id));const node={id,type,parentId:null,origin:'printed',align:'left',widthRatio:1,inlines:[],...values};nodes.push(node);return node;};
 if(structure.status(q).active)nodes.push(...structuredClone(q.layoutDocument.nodes));
 else{
  const outer=q.bodyBorder?add('box'):null;
  const paragraph=(text,parentId=outer?.id??null)=>{let line=[];const flush=()=>{add('paragraph',{parentId,inlines:line});line=[];};for(const x of inlines(text)){if(x.kind!=='text'){line.push(x);continue;}const parts=x.text.split('\n');parts.forEach((part,i)=>{if(i)flush();if(part)line.push({...x,text:part});});}flush();};
  const attach=slot=>{
   if(q.statementBox?.length&&presentation.boxSlot(q)===slot){const box=add('box',{parentId:outer?.id??null});for(const text of q.statementBox)paragraph(text,box.id);}
   for(const figure of figures)if(presentation.figureSlot(q,figure.id)===slot)add('figure',{parentId:outer?.id??null,figureId:figure.id});
  };
  for(const part of presentation.flowParts(q.body)){attach(part.slot);paragraph(part.text);}attach('after');
 }
 if(q.originalPoints!=null){const last=[...nodes].reverse().find(n=>['paragraph','proofStep'].includes(n.type));if(last)last.inlines.push(inline(' ('+q.originalPoints+(String(q.originalPoints).includes('점')?'':'점')+')'));}
 const columns=q.choiceLayout==='vertical'||q.webChoiceColumns===1?1:2;
 for(let i=0;i<(q.choices||[]).length;i+=columns){
  const group=columns===2?add('figureGroup'):null;
  for(let j=i;j<Math.min(i+columns,q.choices.length);j++)add('paragraph',{parentId:group?.id??null,inlines:inlines(`${'①②③④⑤⑥⑦⑧'[j]||j+1} ${String(q.choices[j]).replace(/^[①②③④⑤⑥⑦⑧]\s*/,'')}`)});
 }
 if(q.sourceCaption)add('paragraph',{inlines:inlines(q.sourceCaption)});
 return {version:1,features:['interleavedFlow','proofSteps'],nodes};
}
function unitsOf(document){
 const units=[],atomic=new Set();
 for(const n of document.nodes){
  if(n.origin!=='printed'||atomic.has(n.parentId)){atomic.add(n.id);continue;}
  if(n.type==='figureGroup'||n.type==='figure'||(['paragraph','proofStep'].includes(n.type)&&!n.inlines.length)){units.push({id:n.id,atomic:true});atomic.add(n.id);continue;}
  n.inlines.forEach((x,i)=>{if(x.origin!=='printed')return;if(x.kind==='text'){let offset=0;for(const ch of Array.from(x.text)){units.push({id:n.id,i,start:offset,end:offset+ch.length});offset+=ch.length;}}else units.push({id:n.id,i,start:0,end:x.text.length});});
 }
 return units;
}
function sliceDocument(document,units,start,end){
 const chosen=units.slice(start,end),selected=new Map(),byId=new Map(document.nodes.map(n=>[n.id,n]));
 for(const u of chosen){if(!selected.has(u.id))selected.set(u.id,[]);selected.get(u.id).push(u);let p=byId.get(u.id).parentId;while(p!==null){if(!selected.has(p))selected.set(p,[]);p=byId.get(p).parentId;}}
 const keepAtomic=new Set(chosen.filter(u=>u.atomic).map(u=>u.id)),nodes=[];
 for(const n of document.nodes){
  if(keepAtomic.has(n.parentId)){keepAtomic.add(n.id);nodes.push(structuredClone(n));continue;}
  if(!selected.has(n.id))continue;
  const us=selected.get(n.id);if(keepAtomic.has(n.id)||!n.inlines.length){nodes.push(structuredClone(n));continue;}
  const sliced=[];n.inlines.forEach((x,i)=>{const a=us.filter(u=>u.i===i);if(a.length)sliced.push({...x,text:x.kind==='text'?x.text.slice(a[0].start,a.at(-1).end):x.text});});
  nodes.push({...n,inlines:sliced});
 }
 return {...document,nodes};
}
// Native equations retain full editable glyphs. Reserve their stacked height
// with the same 1.5 leading used for text, instead of measuring only KaTeX's
// compact inline fraction. This affects newly split questions only.
function mathEm(n){
 const children=[...n.children].filter(x=>!['annotation','annotation-xml'].includes(x.localName)),h=children.map(mathEm);
 switch(n.localName){case 'mfrac':return(h[0]||1.2)+(h[1]||1.2)+.5;case 'msqrt':case 'mroot':return Math.max(1.2,...h)+.5;case 'msup':case 'msub':return(h[0]||1.2)+.5*(h[1]||1.2);case 'msubsup':return(h[0]||1.2)+.5*((h[1]||1.2)+(h[2]||1.2));case 'mtable':return h.reduce((a,b)=>a+b,0)+.4*h.length;default:return Math.max(1.2,...h);}
}
export function questionFragmenter({question,figures,article,measure,workspacePx=0}){
 const source=fragmentDocument(question,figures),units=unitsOf(source),width=article.getBoundingClientRect().width;
 for(const figure of figures){const id=figure.measureStructureId||figure.structureId,visible=id?article.querySelector('[data-structure-id="'+CSS.escape(id)+'"] img'):figure.node;if(visible){const r=visible.getBoundingClientRect();if(r.width&&r.height){figure.node.style.width=r.width+'px';figure.node.style.height=r.height+'px';figure.node.style.maxHeight='none';}}}
 const host=document.createElement('div');host.style.width=width+'px';measure.append(host);
 const render=(start,end,index)=>{
  const layoutDocument=sliceDocument(source,units,start,end),q={...question,layoutDocument,layoutMode:'structure',choices:[],originalPoints:null,sourceCaption:null,bodyBorder:false,_outputFragment:true};
  const element=questionContent(q,figures.map(f=>({...f,node:f.node.cloneNode(true)}))),copy=article.cloneNode(false);copy.classList.add('flow-fragment');copy.append(element);
  if(index===0){const label=article.querySelector('.question-number')?.cloneNode(true),first=element.querySelector('.structure-paragraph,.structure-proofStep');if(label){if(first)first.prepend(label,document.createTextNode(' '));else copy.prepend(label);}}
  host.replaceChildren(copy);
  for(const n of layoutDocument.nodes)if(['paragraph','proofStep'].includes(n.type)){
   const p=copy.querySelector('[data-structure-id="'+CSS.escape(n.id)+'"]'),font=parseFloat(getComputedStyle(p).fontSize);
   const stacked=[...p.querySelectorAll('.katex-mathml math')].map(mathEm).filter(h=>h>1.2);
   n.lineHeightPt=font*.75*(stacked.length?Math.max(...stacked)*1.5:1.5);p.style.lineHeight=n.lineHeightPt+'pt';
  }
  const height=copy.getBoundingClientRect().height+(end===units.length?workspacePx:0);
  return {element:copy,height,fragment:{layoutDocument,start,end,total:units.length},next:end,done:end===units.length};
 };
 return {next(start,capacity,index){
  let lo=start+1,hi=units.length,best=null;
  while(lo<=hi){const mid=Math.floor((lo+hi)/2),part=render(start,mid,index);if(part.height<=capacity-2){best=part;lo=mid+1;}else hi=mid-1;}
  if(!best)throw Error('문항의 수식·그림 또는 나눌 수 없는 내용 하나가 한 단보다 큽니다. 해당 요소의 크기를 확인하세요.');
  // Prefer a prose boundary near the last fitted line. Never cut a formula.
  let end=best.next;if(!best.done)for(const boundary of [null,/\n/,/\s/]){let found=false;for(let i=end;i>=Math.max(start+1,end-40);i--){const u=units[i-1],n=source.nodes.find(n=>n.id===u.id),x=n?.inlines[u.i];if(boundary===null?u.id!==units[i]?.id:x?.kind==='text'&&boundary.test(x.text.slice(u.start,u.end))){end=i;found=true;break;}}if(found)break;}
  best=render(start,end,index);host.replaceChildren();return best;
 },dispose(){host.remove();}};
}
