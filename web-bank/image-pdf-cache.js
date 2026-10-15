import {outputLifetime} from './output-lifetime.js';
import {gradeEpoch} from './grade-workspace.js';
import {PDF_ENGINE} from './image-pdf.js';
import {imagePdfProgress} from './image-pdf-progress.js';
import questionSets from '../app/question-sets.cjs';
import security from '../app/download-security.cjs';
import {attachItems,getSets} from './question-set-client.js';
const flights=new Map();
const digest=async blob=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(x=>x.toString(16).padStart(2,'0')).join('');
export function pdfFilename(title,job){const suffix=job.part==='questions'?'문제지':job.part==='answers'?(job.answerMode==='detailed'?'상세풀이':'빠른정답'):'문제지_정답해설';return (String(title).replace(/\.pdf$/i,'').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').replace(/[ .]+$/,'').slice(0,160)||'시험지')+'_'+suffix+'.pdf';}
export function imagePdfCache({client,config,rpc}){
 async function call(job,signal){
  const epoch=gradeEpoch(),request=outputLifetime(signal,job.operation==='finalize'?180000:45000);
  try{const {data,error}=await request.wait(client.functions.invoke('bank-image-pdf',{body:{job:{...job,engine:PDF_ENGINE,spaceId:config.spaceId,grade:config.grade}},signal:request.signal}));
   if(epoch!==gradeEpoch())throw Error('학년이 변경되었습니다. 다시 열어 주세요.');
   if(error){let detail;try{if(error.context?.json)detail=await request.wait(error.context.json());}catch{}throw Error(detail?.error||error.message);}
   if(data?.error)throw Error(data.error);return data;
  }finally{request.close();}
 }
 const validUrl=value=>{const url=new URL(value);if(url.protocol!=='https:'||!url.hostname.endsWith('.r2.cloudflarestorage.com'))throw Error('PDF 저장소 주소 오류');return url;};
 async function read(job,name,status,signal,operation='read'){
  const saved=await call({...job,operation},signal);if(!saved.hit)return null;
  status.textContent='저장된 PDF를 불러오는 중';const started=performance.now();
  const res=await fetch(validUrl(saved.url),{credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(120000)]):AbortSignal.timeout(120000)});if(!res.ok)throw Error('PDF 다운로드 실패. 네트워크 연결을 확인하세요.');
  const blob=await res.blob();if(blob.size!==saved.bytes||await digest(blob)!==saved.sha256)throw Error('PDF 파일 검증 실패. 다시 시도하세요.');
  return {name,blob,cached:true,stale:saved.stale,pageCount:saved.pages,expiresAt:saved.expiresAt,sha256:saved.sha256,key:saved.key,timings:{downloadMs:performance.now()-started}};
 }
 async function obtain({job,name,status,prepare,signal}){
  if(job.document){const registry=rpc?await rpc('bank_question_sets_get',{s:config.spaceId}):await getSets(client,config),items=attachItems(job.document.items||[],registry);
   if(questionSets.issues(items).length)throw Error('세트 짝·순서를 편집 화면에서 확인한 뒤 PDF를 만들어 주세요.');
   job={...job,document:{...job.document,items,outputRenderingVersion:'source-material-once-v1'}};
  }
  const originalName=name;name=pdfFilename(name,job);const epoch=gradeEpoch(),flightKey=JSON.stringify({...job,requestId:undefined,grade:config.grade});
  if(flights.has(flightKey)){status.textContent='이미 생성 중인 PDF를 기다리는 중';await flights.get(flightKey);return read(job,name,status,signal);}
  const work=(async()=>{
   status.textContent='저장된 최신 PDF 확인 중';const started=performance.now();let slot;
   for(;;){signal?.throwIfAborted();if(epoch!==gradeEpoch())throw Error('학년이 변경되었습니다.');slot=await call({...job,operation:'claim'},signal);
    if(slot.hit){const file=await read(job,name,status,signal);if(file)return file;}
    if(!slot.busy&&!slot.hit)break;
    if(performance.now()-started>660000)throw Error('다른 화면의 PDF 작업이 진행 중입니다. 잠시 후 다시 시도하세요.');
    status.textContent='다른 화면에서 생성 중인 PDF를 기다리는 중';await new Promise(r=>setTimeout(r,1500));
   }
   const progress=imagePdfProgress(status,job.part==='questions'?'questions':job.answerMode,signal),active={...job,token:slot.token};
   let heartbeatError=null,heartbeatBusy=false;
   const timer=setInterval(async()=>{if(heartbeatBusy)return;heartbeatBusy=true;try{await call({...active,operation:'heartbeat'},progress.signal);}catch(e){heartbeatError=e;}finally{heartbeatBusy=false;}},45000);
   try{
    progress.report({stage:'layout'});const preparedAt=performance.now(),file=await prepare();progress.signal.throwIfAborted();if(heartbeatError)throw heartbeatError;
    const sha256=await digest(file.blob),bytes=file.blob.size,pages=file.pageCount;
    if(bytes>100*1048576)throw Error('PDF가 100MB를 넘었습니다. 출력 범위를 나누어 생성하세요.');
    clearInterval(timer);progress.report({stage:'upload'});const uploadAt=performance.now(),upload=await call({...active,operation:'upload',sha256,bytes},progress.signal);
    const response=await fetch(validUrl(upload.url),{method:'PUT',headers:upload.headers,body:file.blob,credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.any([progress.signal,AbortSignal.timeout(300000)])});
    if(!response.ok)throw Error(`R2 업로드 실패 (HTTP ${response.status}). 네트워크 연결을 확인한 뒤 다시 시도하세요.`);
    progress.signal.throwIfAborted();progress.report({stage:'verify'});
    const committed=await call({...active,operation:'finalize',sha256,bytes,pages},progress.signal);
    const result={...file,name,cached:false,expiresAt:committed.expiresAt,sha256,key:committed.key,timings:{...file.timings,prepareMs:uploadAt-preparedAt,uploadVerifyMs:performance.now()-uploadAt,...committed.timings}};
    progress.finish(result);return result;
   }catch(error){
    try{await call({...active,operation:'abort'});}catch{}
    const retry=previous=>{const requestId=crypto.randomUUID(),next={...job,requestId};return security.officialDownload({rpc,spaceId:config.spaceId,requestId,format:'pdf',revisions:job.document.items.map(i=>i.revisionId),kind:job.kind,paperId:job.kind==='local'?null:job.paperId,
     generate:()=>previous?read(next,name.replace(/\.pdf$/,'_이전저장본.pdf'),status,undefined,'read_previous'):obtain({job:next,name:originalName,status,prepare}),
     publish:file=>{if(!file)throw Error('사용 가능한 이전 파일이 없습니다.');const url=URL.createObjectURL(file.blob),a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);return file;}});};
    progress.finish(null,error,{retry:()=>retry(false),previous:slot.previous?()=>retry(true):null});throw error;
   }
   finally{clearInterval(timer);}
  })();flights.set(flightKey,work);try{return await work;}finally{if(flights.get(flightKey)===work)flights.delete(flightKey);}
 }
 return {obtain};
}
