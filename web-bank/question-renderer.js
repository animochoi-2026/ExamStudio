import {needsLossless,validateStoredProof} from './lossless/lossless-upload-contract.mjs';
import {imageMime,materialName} from './bank-image.js';
import geometry from '../app/geometry.cjs';
import structure from '../app/structured-layout.js';
import originalQuestion from './original-question.cjs';
import {mathText} from './math-text.js';
import {questionContent} from './print-question.js';
export {mathText} from './math-text.js';
const el=(tag,text='')=>{const n=document.createElement(tag);n.textContent=text;return n;};
const sourceCatalog=(catalog,q)=>catalog.metadata?.source?.originalPoints!=null||structure.sourcePoints(q)==null?catalog:{...catalog,metadata:{...catalog.metadata,source:{...catalog.metadata?.source,originalPoints:structure.sourcePoints(q)}}};
export function createQuestionReader(client,config){
 const cache=new Map(),urls=new Set(),imageProofs=new WeakMap();
 async function bytes(file,bundle){
  const {data:entry,error}=await client.from('bank_entries').select('*').eq('id',file.id).single();if(error)throw Error(error.message);
  if(!entry.verified||!Number.isSafeInteger(entry.size)||entry.size<1||!Number.isSafeInteger(entry.chunks)||entry.chunks<1||entry.size>50*1024*1024)throw Error('파일 상태 또는 50MB 읽기 한도를 확인하세요.');
  if((file.encoding&&!needsLossless(file))||(!needsLossless(file)&&(entry.lossless_proof||entry.props?.losslessUpload)))throw Error('저장된 무손실 그림 계약을 확인할 수 없습니다.');
  const proof=needsLossless(file)?await validateStoredProof({entry,descriptor:file,native:bundle?.native,files:bundle?.files,spaceId:config.spaceId,questionId:bundle?.questionId}):null;
  const chunks=[];for(let i=0;i<entry.chunks;i++){const {data,error}=await client.storage.from('question-bank').download(`${config.spaceId}/${file.id}/${String(i).padStart(3,'0')}`);if(error)throw Error(error.message);chunks.push(data);}
  const buffer=await new Blob(chunks).arrayBuffer(),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(x=>x.toString(16).padStart(2,'0')).join('');
  if(buffer.byteLength!==entry.size||file.size!=null&&buffer.byteLength!==file.size||hash!==entry.sha256||file.sha256&&file.sha256!==hash)throw Error('저장 파일의 무결성 확인에 실패했습니다.');if(proof){if(imageMime(buffer)!=='image/webp')throw Error('무손실 그림 형식이 일치하지 않습니다.');imageProofs.set(buffer,proof);}return buffer;
 }
 async function load(id){
  // Permission is rechecked on every screen entry, including cached revisions.
  const {data,error}=await client.from('bank_catalog').select('*').eq('revision_id',id).single();if(error)throw Error(error.message);
  if(cache.has(id))return {...cache.get(id),catalog:sourceCatalog(data,cache.get(id).question)};
  const file=data.files.find(f=>f.role==='data');if(!file)throw Error('파일 보관형 문항: 재편집 원본이 없습니다.');
  const bundle=JSON.parse(new TextDecoder().decode(await bytes(file)));
  if(bundle.questionId!==data.question_id||bundle.revisionId!==id||bundle.schemaVersion!==1)throw Error('문항 ID·버전이 맞지 않습니다.');
  const problem=bundle.native?.project?.problems?.[0],q=[problem?.original,...(problem?.variants||[])].find(q=>q?.id===bundle.native.targetQuestionId);
  if(!q)throw Error('원본 문항 모델이 없습니다.');const result={catalog:sourceCatalog(data,q),bundle,problem,question:q};
  cache.set(id,result);if(cache.size>30)cache.delete(cache.keys().next().value);return result;
 }
 async function crop(bundle,ref,bounds){
  if(!ref?.startsWith('bank-asset:'))throw Error('복원 가능한 그림 참조가 없습니다.');
  const file=bundle.files.find(f=>f.key===ref.slice(11));if(!file||file.role!=='asset')throw Error('문항 그림 파일이 누락되었습니다.');
  const stored=await bytes(file,bundle);
  const bitmap=await createImageBitmap(new Blob([stored],{type:imageMime(stored)}));
  try{const proof=imageProofs.get(stored);if(proof&&(!Number.isSafeInteger(proof.width)||!Number.isSafeInteger(proof.height)||bitmap.width!==proof.width||bitmap.height!==proof.height))throw Error('무손실 그림 크기가 검증 정보와 다릅니다.');const b=bounds||{x:0,y:0,width:1,height:1};if(![b.x,b.y,b.width,b.height].every(Number.isFinite)||b.x<0||b.y<0||b.width<=0||b.height<=0||b.x+b.width>1.001||b.y+b.height>1.001)throw Error('그림 영역이 잘못되었습니다.');
   const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*b.width));canvas.height=Math.max(1,Math.round(bitmap.height*b.height));canvas.getContext('2d').drawImage(bitmap,bitmap.width*b.x,bitmap.height*b.y,bitmap.width*b.width,bitmap.height*b.height,0,0,canvas.width,canvas.height);const img=el('img');img.alt='원본 그림';img.src=URL.createObjectURL(await new Promise(r=>canvas.toBlob(r)));urls.add(img.src);return img;
  }finally{bitmap.close();}
 }
 async function render(id,{answers=false,printedNumber=null}={}){
  const data=await load(id),q=structure.forOutput(printedNumber==null?data.question:originalQuestion.forOutput(data.question,printedNumber)),root=el('div');root.className='native-question';const figures=[];
  const state=structure.status(q);if(state.missing)throw Error(state.message);
  if(state.active){
   for(const n of q.layoutDocument.nodes.filter(n=>n.origin==='printed'&&n.type==='figure'&&!q.hiddenFigureIds?.includes(n.figureId))){
    let image;
    if(n.diagram){
     if(!Array.isArray(n.diagram.points)||n.diagram.points.length>300||n.diagram.points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.abs(p.x)>1e9||Math.abs(p.y)>1e9))throw Error('Invalid structured geometry');
     image=el('img');image.alt='구조 도형 '+n.id;image.src=URL.createObjectURL(new Blob([geometry.diagramSvg(n.diagram,structure.diagramOptions(q,n))],{type:'image/svg+xml'}));urls.add(image.src);
    }else{
     let f=n.figureId==='diagram'?q.sourceFigure:q.sourceFigures?.find(f=>f.id===n.figureId);
     if(!f){for(const m of data.problem.recognition?.materials||[]){const ref=data.problem.cropPaths?.[m.regionIndex],file=data.bundle.files.find(f=>f.key===ref?.slice(11)),raw=JSON.stringify([materialName(file),m.bounds||null,m.label||'']);const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)))].map(x=>x.toString(16).padStart(2,'0')).join('').slice(0,20);if(n.figureId==='material-'+hash)f={path:ref,bounds:m.bounds};}}
     image=await crop(data.bundle,f?.path,f?.bounds);image.alt='원본 이미지 · 필기 잔존 가능성 확인 필요';
    }
    figures.push({id:n.figureId||n.id,structureId:n.diagram?n.id:null,measureStructureId:n.id,node:image});
   }

  }else{
  const add=async(id,fn)=>{if(q.hiddenFigureIds?.includes(id))return;try{figures.push({id,node:await fn()});}catch(e){const warning=el('p','그림 복원 실패: '+e.message);warning.className='error';figures.push({id,node:warning});root.dataset.incomplete='true';}};
  if(q.diagramMode==='source')await add('diagram',()=>crop(data.bundle,q.sourceFigure?.path,q.sourceFigure?.bounds));
  else if(!q.hiddenFigureIds?.includes('diagram')){const diagram=geometry.questionDiagram(q);if(diagram){if(!Array.isArray(diagram.points)||diagram.points.length>300||diagram.points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.abs(p.x)>1e9||Math.abs(p.y)>1e9))throw Error('도형 좌표 구조를 읽을 수 없습니다.');const svg=geometry.diagramSvg(diagram);
   // SVG is emitted by the existing geometry renderer, never by uploaded HTML.
   const image=el('img');image.alt='문제 도형';const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));image.src=url;urls.add(url);figures.push({id:'diagram',node:image});}}
  for(const f of q.sourceFigures||[])await add(f.id,()=>crop(data.bundle,f.path,f.bounds));
  if(q.kind==='original')for(const m of [...(data.problem.recognition?.materials||[]),...(data.problem.regions||[]).flatMap((r,i)=>r.role==='context'?[{label:'공통 자료',regionIndex:i,bounds:null}]:[])]){const ref=data.problem.cropPaths?.[m.regionIndex];
   // Match the desktop material identifier using its portable filename.
   const file=data.bundle.files.find(f=>f.key===ref?.slice(11));const raw=JSON.stringify([materialName(file),m.bounds||null,m.label||'']);const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)))].map(x=>x.toString(16).padStart(2,'0')).join('').slice(0,20);
   await add('material-'+hash,()=>crop(data.bundle,ref,m.bounds));
  }
  }
  const content=questionContent(q,figures);if(root.dataset.incomplete)content.dataset.incomplete='true';
  if(answers){content.append(el('h3','정답'),mathText(q.answer||'미확인'),el('h3','상세 풀이'),mathText(q.solution||'미작성'));}

  return {element:content,figures,...data};
 }
 return {load,render,bytes,clear:()=>{cache.clear();for(const url of urls)URL.revokeObjectURL(url);urls.clear();}};
}
