import {outputLifetime} from './output-lifetime.js';
import {gradeEpoch} from './grade-workspace.js';
import {PDF_ENGINE} from './native-pdf.js';
import questionSets from '../app/question-sets.cjs';
import {attachItems,getSets} from './question-set-client.js';
const flights=new Map();
export function nativePdfCache({client,config,rpc}){
 async function call(job,extra={},signal){
  const epoch=gradeEpoch(),request=outputLifetime(signal,job.operation==='render'?240000:45000);let result;try{result=await request.wait(client.functions.invoke('bank-native-pdf',{body:{job:{...job,engine:PDF_ENGINE,spaceId:config.spaceId,grade:config.grade},...extra},signal:request.signal}));}finally{request.close();}const {data,error}=result;
  if(epoch!==gradeEpoch())throw Error('학년이 변경되었습니다. 다시 열어 주세요.');
  if(error){let detail;try{detail=await error.context?.json();}catch{}throw Error(detail?.error||error.message);}if(data?.error)throw Error(data.error);return data;
 }
 async function read(job,name,status,signal){
  const read=await call({...job,operation:'read'},{},signal);if(!read.hit)return null;
  const url=new URL(read.url);if(url.protocol!=='https:'||!url.hostname.endsWith('.r2.cloudflarestorage.com'))throw Error('PDF 저장소 주소 오류');
  status.textContent='저장된 최신 PDF 내려받는 중';const started=performance.now();
  const res=await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(120000)]):AbortSignal.timeout(120000)});if(!res.ok)throw Error('PDF 다운로드 실패. 다시 시도하세요.');
  const blob=await res.blob(),sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(x=>x.toString(16).padStart(2,'0')).join('');
  if(blob.size!==read.bytes||sha!==read.sha256)throw Error('PDF 파일 검증 실패. 다시 시도하세요.');
  return {name,blob,cached:true,timings:{downloadMs:performance.now()-started}};
 }
 async function obtain({job,name,status,prepare,signal}){
  if(job.document){
   // A set may be registered after a paper/PDF was saved. Recheck before a
   // cache hit so incomplete old papers cannot silently reuse that PDF.
   const registry=rpc?await rpc('bank_question_sets_get',{s:config.spaceId}):await getSets(client,config);
   const items=attachItems(job.document.items||[],registry),issues=questionSets.issues(items);
   if(issues.length)throw Error('세트 짝·순서를 편집 화면에서 확인한 뒤 PDF를 만들어 주세요. 기존 저장본은 유지됩니다.');
   job={...job,document:{...job.document,items,outputRenderingVersion:'source-material-once-v1'}};
  }
  const epoch=gradeEpoch(),flightKey=JSON.stringify({...job,requestId:undefined,grade:config.grade});
  // Each caller still has its own official download authorization. The shared
  // server slot protects separate tabs/devices, and this map saves local work.
  if(flights.has(flightKey))await flights.get(flightKey).catch(()=>{});
  const work=(async()=>{
   status.textContent='저장된 최신 PDF 확인 중';const started=performance.now();let slot;
   for(;;){
    signal?.throwIfAborted();if(epoch!==gradeEpoch())throw Error('학년이 변경되었습니다.');
    slot=await call({...job,operation:'claim'},{},signal);
    if(slot.hit){const cached=await read(job,name,status,signal);if(cached)return cached;continue;}
    if(!slot.busy)break;
    if(performance.now()-started>660000)throw Error('PDF 생성 대기 시간이 지났습니다. 잠시 후 다시 시도하세요.');
    status.textContent='이미 생성 중인 최신 PDF 기다리는 중';await new Promise(resolve=>setTimeout(resolve,1500));
   }
   const active={...job,key:slot.key};
   try{
    status.textContent='준비 중';const before=performance.now(),input=await prepare(),prepareMs=performance.now()-before;signal?.throwIfAborted();
    status.textContent='PDF 생성·저장 중';const created=await call({...active,operation:'render'},{input},signal);
    const file=await read(job,name,status,signal);if(!file)throw Error('생성 중 시험지가 수정됐습니다. 최신 내용을 다시 열어 주세요.');
    file.cached=false;file.timings={prepareMs,...created.timings,...file.timings};
    status.textContent='완료 · 최신 PDF 저장됨';return file;
   }catch(error){try{await call({...active,operation:'abort'});}catch{}throw error;}
  })();flights.set(flightKey,work);
  try{return await work;}finally{if(flights.get(flightKey)===work)flights.delete(flightKey);}
 }
 return {obtain};
}
