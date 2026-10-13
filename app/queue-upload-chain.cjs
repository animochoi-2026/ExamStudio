'use strict';
// Complete already queued parent revisions in order. Never rebase a child or
// manufacture a committed parent after a timeout.
async function processChain(bank,job,{ensure=()=>{},seen=new Set()}={}){
 if(seen.has(job.revisionId))throw Error('업로드 기준 버전 연결이 순환합니다. 기존 기록을 보존했습니다.');
 seen.add(job.revisionId);ensure();
 const parent=job.parentRevisionId&&bank.state.jobs.find(j=>j.revisionId===job.parentRevisionId);
 if(parent&&!parent.committed){
  if(parent.questionId!==job.questionId||parent.rootId!==job.rootId||parent.actorId!==job.actorId||!parent.queueManaged||parent.conflictBlocked||['conflict','cancelled','unknown'].includes(parent.status))throw Error('기준 업로드의 계정·문항·충돌 상태를 확인하세요.');
  const heads=await bank.remoteHeads(parent.questionId);
  if(heads.some(h=>h.revisionId===parent.revisionId)){parent.committed=true;parent.status='complete';bank.save();}
  else await processChain(bank,parent,{ensure,seen});
  if(!parent.committed)throw Error('기준 업로드가 아직 완료되지 않았습니다. 다음 버전은 보존했습니다.');
 }
 ensure();return bank.process(job);
}
module.exports={processChain};
