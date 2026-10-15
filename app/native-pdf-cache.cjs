'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function desktopSignature(project){
 const files=new Map(),walk=value=>{
  if(typeof value==='string'&&path.isAbsolute(value)&&fs.existsSync(value)&&fs.statSync(value).isFile()){if(!files.has(value))files.set(value,hash(fs.readFileSync(value)));return {file:files.get(value)};}
  if(Array.isArray(value))return value.map(walk);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(k=>!['updatedAt','createdAt','lastOpenedAt','lastSavedAt'].includes(k)).map(k=>[k,walk(value[k])]));
  return value;
 };
 const problems=project.problems.filter(p=>[p.original,...(p.variants||[])].some(q=>q?.include)).map(p=>({...p,original:p.original?.include?p.original:null,variants:(p.variants||[]).filter(q=>q.include)}));
 return hash(JSON.stringify(walk({title:project.title,settings:project.settings,scope:project.scope,problems,renderer:'electron-vector-cache-v2-paged-answers'})));
}
async function desktopPdf({auth,project,revisions,requestId,identity,target,generate,send=()=>{}}){
 const cfg=auth.config(),actor=auth.status().account?.id,raw=hash(project.id),paperId=[raw.slice(0,8),raw.slice(8,12),raw.slice(12,16),raw.slice(16,20),raw.slice(20,32)].join('-');
 const job={engine:'chromium-vector-v2-noto-1',kind:'local',paperId,spaceId:cfg.spaceId,variant:'desktop',part:'all',answerMode:project.settings.answerMode||'detailed',requestId,document:{desktopSignature:desktopSignature(project),items:revisions.map(revisionId=>({revisionId}))}};
 const call=async(operation,extra={})=>{if(auth.status().account?.id!==actor)throw Error('계정이 변경되었습니다.');return auth.request('/functions/v1/bank-native-pdf',{method:'POST',body:{job:{...job,operation,...extra.job},...extra.body},token:await auth.token()});};
 let slot;const start=Date.now();for(;;){slot=await call('claim');if(!slot.busy)break;if(Date.now()-start>660000)throw Error('PDF 생성 대기 시간이 지났습니다. 다시 시도하세요.');send('이미 생성 중인 PDF 기다리는 중');await new Promise(r=>setTimeout(r,1500));}
 if(slot.hit){
  send('저장된 최신 PDF 내려받는 중');const saved=await call('read');if(!saved.hit)throw Error('보관된 PDF가 없어 다시 시도해야 합니다.');const url=new URL(saved.url);
  if(url.protocol!=='https:'||!url.hostname.endsWith('.r2.cloudflarestorage.com'))throw Error('PDF 저장소 주소 오류');
  const response=await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(120000)});if(!response.ok)throw Error('PDF 다운로드 실패');const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length!==saved.bytes||hash(bytes)!==saved.sha256)throw Error('PDF 무결성 확인 실패');if(auth.status().account?.id!==actor)throw Error('계정이 변경되었습니다.');fs.writeFileSync(target,bytes,{flag:'wx'});return {path:target,format:'pdf',warnings:[],cached:true};
 }
 try{
  send('PDF 생성 중');const result=await generate(identity),bytes=fs.readFileSync(result.path);if(bytes.length<100||bytes.subarray(0,5).toString()!=='%PDF-'||!bytes.subarray(-1024).includes('%%EOF'))throw Error('PDF 생성 결과 오류');
  send('최신 PDF 저장 중');await call('upload',{job:{key:slot.key},body:{pdfBase64:bytes.toString('base64')}});return {...result,cached:false};
 }catch(error){try{await call('abort',{job:{key:slot.key}});}catch{}throw error;}
}
module.exports={desktopSignature,desktopPdf};
