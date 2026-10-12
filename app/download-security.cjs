'use strict';
const identifier=value=>{if(typeof value!=='string'||!/^\d{4,12}$/.test(value))throw Error('출력 정보를 확인하지 못했습니다. 다시 시도하세요.');return value;};
// Official client flow only. The server cannot attest client-produced bytes or
// successful device storage. No unmarked fallback when any required step fails.
async function officialDownload({rpc,spaceId,requestId,format,revisions,kind='exam',paperId=null,generate,publish}){
 const ticket=await rpc('bank_download_begin',{s:spaceId,request_id:requestId,fmt:format,revisions:[...new Set(revisions)],request_kind:kind,paper_id:paperId});
 let file;
 try{file=await generate(identifier(ticket.identifier));if(!file)throw Error('파일 생성 결과가 없습니다.');}
 catch(error){try{await rpc('bank_download_finish',{s:spaceId,request_id:requestId,generated:false});}catch{}throw error;}
 const result=await rpc('bank_download_finish',{s:spaceId,request_id:requestId,generated:true});
 if(!result?.allowed)throw Error(result?.message||'파일 저장을 승인받지 못했습니다. 다시 시도하세요.');
 return publish(file);
}
function desktopRevisions(project,state){
 const ids=[];
 for(const p of project.problems)for(const q of [p.original,...(p.variants||[])].filter(q=>q?.include)){
  const key=project.id+':'+p.id+':'+q.id;
  const item=Object.values(state.items||{}).find(x=>x.localKey===key)||state.bindings?.[key];
  const revision=item?.latestRevisionId||item?.baseRevisionId||(q.kind==='original'?project.bankArchive?.revisionId:null);if(revision)ids.push(revision);
 }
 return [...new Set(ids)];
}
module.exports={identifier,officialDownload,desktopRevisions};
