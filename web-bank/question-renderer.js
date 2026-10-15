import {printImageUrl,releasePrintImage} from './print-image-url.js';
import questionSets from '../app/question-sets.cjs';
import {enrichSets} from './question-set-client.js';
import {downloadChunk} from './file-storage.js';
import {originalPageReferences,originalPdfPage} from './original-pdf-page.js';
import {needsLossless,validateStoredProof} from './lossless/lossless-upload-contract.mjs';
import {imageMime,materialName} from './bank-image.js';
import geometry from '../app/geometry.cjs';
import materialDiagram from './material-diagram.cjs';
import structure from '../app/structured-layout.js';
import originalQuestion from './original-question.cjs';
import {mathText} from './math-text.js';
import {questionContent} from './print-question.js';
export {mathText} from './math-text.js';
const el=(tag,text='')=>{const n=document.createElement(tag);n.textContent=text;return n;};
const sourceCatalog=(catalog,q)=>catalog.metadata?.source?.originalPoints!=null||structure.sourcePoints(q)==null?catalog:{...catalog,metadata:{...catalog.metadata,source:{...catalog.metadata?.source,originalPoints:structure.sourcePoints(q)}}};
export function createQuestionReader(client,config,{signal}={}){
 const byteCache=new Map();let cachedBytes=0;const cache=new Map(),urls=new Set(),imageProofs=new WeakMap(),cropOrigins=new WeakMap();
 async function bytes(file,bundle){
  signal?.throwIfAborted();let query=client.from('bank_entries').select('*').eq('id',file.id).single();if(signal)query=query.abortSignal(signal);const {data:entry,error}=await query;if(error)throw Error(error.message);
  if(!entry.verified||!Number.isSafeInteger(entry.size)||entry.size<1||!Number.isSafeInteger(entry.chunks)||entry.chunks<1||entry.size>50*1024*1024)throw Error('파일 상태 또는 50MB 읽기 한도를 확인하세요.');
  if((file.encoding&&!needsLossless(file))||(!needsLossless(file)&&(entry.lossless_proof||entry.props?.losslessUpload)))throw Error('저장된 무손실 그림 계약을 확인할 수 없습니다.');
  const proof=needsLossless(file)?await validateStoredProof({entry,descriptor:file,native:bundle?.native,files:bundle?.files,spaceId:config.spaceId,questionId:bundle?.questionId}):null;
  const key=entry.id+':'+entry.sha256+':'+entry.size;const existing=byteCache.get(key);if(existing){if(file.size!=null&&file.size!==existing.byteLength||file.sha256&&file.sha256!==entry.sha256)throw Error('파일 참조 무결성 불일치');if(proof)imageProofs.set(existing,proof);return existing;}
  const chunks=[];for(let i=0;i<entry.chunks;i++){const {data,error}=await downloadChunk(client,config,`${config.spaceId}/${file.id}/${String(i).padStart(3,'0')}`,{signal});if(error)throw Error(error.message);chunks.push(data);}
  const buffer=await new Blob(chunks).arrayBuffer(),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(x=>x.toString(16).padStart(2,'0')).join('');
  signal?.throwIfAborted();if(buffer.byteLength!==entry.size||file.size!=null&&buffer.byteLength!==file.size||hash!==entry.sha256||file.sha256&&file.sha256!==hash)throw Error('저장 파일의 무결성 확인에 실패했습니다.');if(proof){if(imageMime(buffer)!=='image/webp')throw Error('무손실 그림 형식이 일치하지 않습니다.');imageProofs.set(buffer,proof);}if(buffer.byteLength<=32*1024*1024){while(cachedBytes+buffer.byteLength>32*1024*1024&&byteCache.size){const oldest=byteCache.keys().next().value;cachedBytes-=byteCache.get(oldest).byteLength;byteCache.delete(oldest);}byteCache.set(key,buffer);cachedBytes+=buffer.byteLength;}return buffer;
 }
 async function load(id,registry=null){
  // Permission is rechecked on every screen entry, including cached revisions.
  signal?.throwIfAborted();let query=client.from('bank_catalog').select('*').eq('revision_id',id).single();if(signal)query=query.abortSignal(signal);let {data,error}=await query;if(error)throw Error(error.message);[data]=registry?questionSets.attach([data],registry):await enrichSets(client,config,[data]);
  if(cache.has(id))return {...cache.get(id),catalog:sourceCatalog(data,cache.get(id).question)};
  const file=data.files.find(f=>f.role==='data');if(!file)throw Error('파일 보관형 문항: 재편집 원본이 없습니다.');
  const bundle=JSON.parse(new TextDecoder().decode(await bytes(file)));
  if(bundle.questionId!==data.question_id||bundle.revisionId!==id||bundle.schemaVersion!==1)throw Error('문항 ID·버전이 맞지 않습니다.');
  const problem=bundle.native?.project?.problems?.[0],q=[problem?.original,...(problem?.variants||[])].find(q=>q?.id===bundle.native.targetQuestionId);
  if(!q)throw Error('원본 문항 모델이 없습니다.');const result={catalog:sourceCatalog(data,q),bundle,problem,question:q};
  signal?.throwIfAborted();cache.set(id,result);if(cache.size>30)cache.delete(cache.keys().next().value);return result;
 }
 async function crop(bundle,ref,bounds){
  if(!ref?.startsWith('bank-asset:'))throw Error('복원 가능한 그림 참조가 없습니다.');
  const file=bundle.files.find(f=>f.key===ref.slice(11));if(!file||file.role!=='asset')throw Error('문항 그림 파일이 누락되었습니다.');
  const stored=await bytes(file,bundle);
  const bitmap=await createImageBitmap(new Blob([stored],{type:imageMime(stored)}));
  try{const proof=imageProofs.get(stored);if(proof&&(!Number.isSafeInteger(proof.width)||!Number.isSafeInteger(proof.height)||bitmap.width!==proof.width||bitmap.height!==proof.height))throw Error('무손실 그림 크기가 검증 정보와 다릅니다.');const b=bounds||{x:0,y:0,width:1,height:1};if(![b.x,b.y,b.width,b.height].every(Number.isFinite)||b.x<0||b.y<0||b.width<=0||b.height<=0||b.x+b.width>1.001||b.y+b.height>1.001)throw Error('그림 영역이 잘못되었습니다.');
   const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*b.width));canvas.height=Math.max(1,Math.round(bitmap.height*b.height));canvas.getContext('2d').drawImage(bitmap,bitmap.width*b.x,bitmap.height*b.y,bitmap.width*b.width,bitmap.height*b.height,0,0,canvas.width,canvas.height);const img=el('img');img.alt='원본 그림';const blob=await new Promise(r=>canvas.toBlob(r));signal?.throwIfAborted();if(!blob)throw Error('원본 그림 변환에 실패했습니다.');img.src=printImageUrl(blob);urls.add(img.src);cropOrigins.set(img,{ref,bounds:bounds||null,width:bitmap.width,height:bitmap.height});return img;
  }finally{bitmap.close();}
 }
 async function render(id,{answers=false,printedNumber=null,catalogSnapshot=null,setRegistry=null,setContext=null,showOriginalPoints=false}={}){
  const loaded=await load(id,setRegistry);if(catalogSnapshot&&(catalogSnapshot.revision_id!==id||catalogSnapshot.question_id!==loaded.catalog.question_id))throw Error('문항 스냅샷 식별자가 다릅니다.');const data=catalogSnapshot?{...loaded,catalog:{...structuredClone(catalogSnapshot),questionSet:loaded.catalog.questionSet}}:{...loaded};if(data.catalog.questionSet)data.question=questionSets.forPrint(data.question,data.catalog.questionSet,{start:Number(data.catalog.questionSet.original_numbers[0]),...(setContext||{}),originalNumber:data.catalog.metadata.source.originalNumber});const q=structure.forOutput({...((printedNumber==null)?data.question:originalQuestion.forOutput(data.question,printedNumber)),showOriginalPoints}),root=el('div');root.className='native-question';const figures=[];
  const state=structure.status(q);if(state.missing)throw Error(state.message);
  if(state.active){
   for(const n of q.layoutDocument.nodes.filter(n=>n.origin==='printed'&&n.type==='figure'&&!q.hiddenFigureIds?.includes(n.figureId))){
    let image;
    if(n.diagram){
     if(!Array.isArray(n.diagram.points)||n.diagram.points.length>300||n.diagram.points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.abs(p.x)>1e9||Math.abs(p.y)>1e9))throw Error('Invalid structured geometry');
     image=el('img');image.alt='구조 도형 '+n.id;image.src=printImageUrl(new Blob([geometry.diagramSvg(n.diagram,structure.diagramOptions(q,n))],{type:'image/svg+xml'}));urls.add(image.src);
    }else{
     let f=n.figureId==='diagram'?q.sourceFigure:q.sourceFigures?.find(f=>f.id===n.figureId);
     if(!f){for(const m of data.problem.recognition?.materials||[]){const ref=data.problem.cropPaths?.[m.regionIndex],file=data.bundle.files.find(f=>f.key===ref?.slice(11)),raw=JSON.stringify([materialName(file),m.bounds||null,m.label||'']);const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)))].map(x=>x.toString(16).padStart(2,'0')).join('').slice(0,20);if(n.figureId==='material-'+hash)f={path:ref,bounds:q.materialBounds?.[n.figureId]||m.bounds};}}
     image=await crop(data.bundle,f?.path,f?.bounds);image.alt=n.sourceImageWarningDismissed===true?'원본 이미지':'원본 이미지 · 필기 잔존 가능성 확인 필요';
    }
    figures.push({id:n.figureId||n.id,structureId:n.diagram?n.id:null,measureStructureId:n.id,node:image});
   }

  }else{
  const add=async(id,fn)=>{if(q.hiddenFigureIds?.includes(id))return;try{figures.push({id,node:await fn()});}catch(e){const warning=el('p','그림 복원 실패: '+e.message);warning.className='error';figures.push({id,node:warning});root.dataset.incomplete='true';}};
  if(q.diagramMode==='source')await add('diagram',()=>crop(data.bundle,q.sourceFigure?.path,q.sourceFigure?.bounds));
  else if(!q.hiddenFigureIds?.includes('diagram')){const diagram=geometry.questionDiagram(q);if(diagram){if(!Array.isArray(diagram.points)||diagram.points.length>300||diagram.points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.abs(p.x)>1e9||Math.abs(p.y)>1e9))throw Error('도형 좌표 구조를 읽을 수 없습니다.');const svg=geometry.diagramSvg(diagram);
   // SVG is emitted by the existing geometry renderer, never by uploaded HTML.
   const image=el('img');image.alt='문제 도형';const url=printImageUrl(new Blob([svg],{type:'image/svg+xml'}));image.src=url;urls.add(url);figures.push({id:'diagram',node:image});}}
  for(const f of q.sourceFigures||[])await add(f.id,()=>crop(data.bundle,f.path,f.bounds));
  if(q.kind==='original')for(const m of [...(data.problem.recognition?.materials||[]),...(data.problem.regions||[]).flatMap((r,i)=>r.role==='context'?[{label:'공통 자료',regionIndex:i,bounds:null}]:[])]){const ref=data.problem.cropPaths?.[m.regionIndex];
   // Match the desktop material identifier using its portable filename.
   const file=data.bundle.files.find(f=>f.key===ref?.slice(11));const raw=JSON.stringify([materialName(file),m.bounds||null,m.label||'']);const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)))].map(x=>x.toString(16).padStart(2,'0')).join('').slice(0,20);
   await add('material-'+hash,()=>crop(data.bundle,ref,m.bounds));
  }
  }
  const duplicate=figures.findIndex(f=>f.id==='diagram');if(duplicate>=0&&figures.some(f=>f.id.startsWith('material-')&&materialDiagram.containsObservedDiagram(data.problem,q,cropOrigins.get(f.node)))){figures.splice(duplicate,1);q.hiddenFigureIds=[...(q.hiddenFigureIds||[]),'diagram'];}
  const content=questionContent(q,figures);if(root.dataset.incomplete)content.dataset.incomplete='true';
  if(answers){content.append(el('h3','정답'),mathText(q.answer||'미확인'),el('h3','상세 풀이'),mathText(q.solution||'미작성'));}

  return {...data,element:content,figures,question:q};
 }
 async function original(id,{signal:reviewSignal}={}){
  const data=await load(id),result=[];
  // cropPaths are the original per-question scans, not rendered preview images.
  for(const [index,ref] of (data.problem.cropPaths||[]).entries()){
   const region=data.problem.regions?.[index];if(!region||!Number.isInteger(region.page)||region.page<1)continue;
   if(ref)result.push({image:await crop(data.bundle,ref,null),page:region.page,index});
  }
  const pending=originalPageReferences(data).filter(item=>item.regions.some(region=>!data.problem.cropPaths?.[data.problem.regions.indexOf(region)]));
  const pageSignal=signal&&reviewSignal?AbortSignal.any([signal,reviewSignal]):signal||reviewSignal;
  for(const item of pending){const blob=await originalPdfPage({client,config,file:item.file,page:item.page,signal:pageSignal}),image=el('img');image.src=printImageUrl(blob);urls.add(image.src);result.push({...item,image,kind:'page'});}
  return result;
 }
 return {load,render,bytes,original,clear:()=>{byteCache.clear();cachedBytes=0;cache.clear();for(const url of urls)releasePrintImage(url);urls.clear();}};
}
