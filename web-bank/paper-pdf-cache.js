import {gradeEpoch} from './grade-workspace.js';
export function paperPdfCache({client,config}){
 async function call(job,blob){
  const epoch=gradeEpoch(),payload={...job,spaceId:config.spaceId,grade:config.grade};
  const {data,error}=await client.functions.invoke('bank-paper-pdf',blob?{body:blob,headers:{'x-pdf-job':JSON.stringify(payload)}}:{body:payload});
  if(epoch!==gradeEpoch())throw Error('학년이 변경되었습니다. 다시 열어 주세요.');
  if(error){let detail;try{detail=await error.context?.json();}catch{}throw Error(detail?.error||error.message);}
  if(data?.error)throw Error(data.error);return data;
 }
 async function obtain({draft,part,requestId,name,status,generate}){
  const job={paperId:draft.id,version:draft.version,part,requestId};
  status.textContent='보관된 최신 PDF 확인 중';
  const slot=await call({...job,operation:'claim'});
  if(slot.hit){
   const read=await call({...job,operation:'read'});if(!read.hit)throw Error('프린트가 변경되었습니다. 다시 받아 주세요.');
   const url=new URL(read.url);if(url.protocol!=='https:'||!url.hostname.endsWith('.r2.cloudflarestorage.com'))throw Error('PDF 저장소 주소 오류');
   status.textContent='보관된 PDF 내려받는 중';
   const response=await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',signal:AbortSignal.timeout(120000)});if(!response.ok)throw Error('PDF 다운로드에 실패했습니다. 다시 시도하세요.');
   const blob=await response.blob(),sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(x=>x.toString(16).padStart(2,'0')).join('');
   if(blob.size!==read.bytes||sha!==read.sha256)throw Error('PDF 파일 확인에 실패했습니다.');
   return {name,blob,cached:true};
  }
  try{
   const file=await generate();status.textContent='새 PDF 보관 중 · 저장 확인 후 이전 파일을 교체합니다.';
   await call({...job,operation:'upload',key:slot.key},file.blob);return file;
  }catch(error){try{await call({...job,operation:'abort',key:slot.key});}catch{}throw error;}
 }
 return {obtain};
}
