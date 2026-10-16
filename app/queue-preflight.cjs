'use strict';
const crypto=require('node:crypto');
const Inventory=require('./source-inventory.cjs');
const ERROR='기존 업로드 여부를 확인하지 못했습니다. 서버 연결을 확인한 뒤 다시 시도해 주세요.';
const candidates=queue=>queue.state.items.filter(i=>!i.hidden&&!i.removedAt&&!i.linkedTo&&i.status!=='cancelled');
const fingerprint=queue=>crypto.createHash('sha256').update(JSON.stringify(candidates(queue).map(i=>[i.id,i.hash,i.metadata,i.projectId,i.steps,i.status]))).digest('hex');
function classify(item,result){
 const localFailure=Object.values(item.steps||{}).some(s=>['failed','held','unknown'].includes(s.status)||s.status?.startsWith('waiting_'));
 const complete=(result.sources||[]).filter(source=>{
  const p=source.progress||{},questions=source.questions||[],n=p.numbering||{},inventory=Inventory.inventory(questions,n);
  const expected=p.expected_count||n.total;
  return questions.length>0&&questions.length===expected&&!inventory.duplicates.length&&!inventory.unknown.length&&
   !['partial','in_progress'].includes(p.status)&&(inventory.complete||(p.status==='complete'&&!inventory.missing.length&&!inventory.unexpected.length));
 });
 return {id:item.id,name:item.name,metadata:item.metadata,state:localFailure?'partial':complete.length?'complete':result.sourcePresent||result.sources?.length?'partial':'new',
  count:complete.reduce((n,s)=>Math.max(n,s.questions.length),0),sourceIds:complete.map(s=>s.id)};
}
class QueuePreflight{
 constructor({queue,storage,now=Date.now}){Object.assign(this,{queue,storage,now});this.plan=null;this.checking=false;}
 async check(){
  if(this.checking||this.queue.active||this.queue.state.mode==='running')throw Error('현재 작업이 끝난 뒤 시작하세요.');
  this.checking=true;this.plan=null;
  try{
   const basis=fingerprint(this.queue),items=candidates(this.queue),storage=this.storage(),rows=[];
   for(const item of items)if(item.currentPath&&require('./exam-queue.cjs').fileHash(item.currentPath)!==item.hash)throw Error('대기열에 추가한 뒤 원본 파일이 변경됐습니다. 원본을 다시 확인하세요.');
   // Bounded batches; never truncate a large queue or treat missing rows as new.
   for(let at=0;at<items.length;at+=100){const batch=items.slice(at,at+100);const result=await storage.rpc('bank_queue_exam_preflight',{s:storage.auth.config().spaceId,exams:batch.map(i=>({id:i.id,sha256:i.hash,source:i.metadata}))});
    if(!Array.isArray(result)||result.length!==batch.length||new Set(result.map(r=>r.id)).size!==batch.length)throw Error(ERROR);
    for(const item of batch){const r=result.find(r=>r.id===item.id);if(!r||!Array.isArray(r.sources))throw Error(ERROR);rows.push(classify(item,r));}
   }
   if(basis!==fingerprint(this.queue))throw Error('대기열이 변경됐습니다. 다시 시작해 주세요.');
   this.plan={token:crypto.randomUUID(),basis,expires:this.now()+5*60*1000,rows};return {token:this.plan.token,rows};
  }catch(cause){this.plan=null;throw Error(ERROR,{cause});}finally{this.checking=false;}
 }
 start(action,value={}){
  const p=this.plan;if(!p||value.token!==p.token||p.expires<this.now()||p.basis!==fingerprint(this.queue))throw Error('시작 전에 기존 업로드 여부를 다시 확인해 주세요.');
  if(!['start','resume'].includes(action))throw Error('시작 동작을 확인하세요.');
  const choices=value.choices||{};for(const row of p.rows)if(row.state==='complete'&&choices[row.id]!==undefined&&!['exclude','reupload'].includes(choices[row.id]))throw Error('업로드 선택을 확인하세요.');
  const before=structuredClone(this.queue.state);
  try{
   for(const row of p.rows){const item=this.queue.item(row.id);item.serverUploadStatus=row.state;
    item.uploadExcluded=row.state==='complete'&&choices[row.id]!=='reupload';
    if(item.uploadExcluded)continue;
    if(row.state==='complete'&&choices[row.id]==='reupload'){
     item.status='pending';
     // Keep recognition/solution results and revision lineage. The normal upload
     // path merges protected server metadata and reuses verified source assets.
     for(const step of Object.values(item.steps||{}))if(step.kind==='upload'){step.status='pending';step.retryAuthorized=true;step.fingerprint=null;}
    }
   }
   const result=this.queue.action(action);this.plan=null;return result;
  }catch(error){this.queue.state=before;throw error;}
 }
}
module.exports={QueuePreflight,classify,fingerprint,ERROR};
