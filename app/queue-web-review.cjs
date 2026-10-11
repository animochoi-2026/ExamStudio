'use strict';
// Use the same revision/permission/version checked operation as the web editor.
// A committed upload is never repeated just because review acknowledgement was lost.
async function approve(bank,job){
 if(bank.storage.kind!=='shared')return;
 const read=async()=>{const row=(await bank.storage.rows('bank_revisions','id=eq.'+encodeURIComponent(job.revisionId)))[0];if(!row||row.question_id!==job.questionId||!row.committed)throw Error('등록된 문항의 검수 대상을 확인하지 못했습니다.');return row;};
 let row=await read();
 if(row.visibility!=='approved'){
  try{await bank.storage.rpc('bank_review_save',{r:job.revisionId,p:{},expected:row.review_version});}
  catch(error){row=await read();if(row.visibility!=='approved')throw error;}
  row=await read();if(row.visibility!=='approved')throw Error('문항은 등록됐지만 검수완료 상태를 확인하지 못했습니다.');
 }
 job.queueWebReviewed={revisionId:job.revisionId,version:row.review_version};bank.save();
}
module.exports={approve};
