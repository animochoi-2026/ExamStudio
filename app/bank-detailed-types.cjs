'use strict';
const T=require('./question-types.cjs');
// Confirmed review data is an overlay. Never rewrite a signed native bundle.
function applyConfirmed(metadata,row){
 if(!row?.confirmed?.types?.length)return metadata;
 const types=T.requireDetailed({confirmed:{types:row.confirmed.types}});
 const out=structuredClone(metadata);out.classification||={};
 out.classification.confirmed={...out.classification.confirmed,types:structuredClone(types)};
 return out;
}
async function catalog(storage,revisionId,questionId){
 let row;
 if(storage.kind==='shared')row=(await storage.rows('bank_catalog','revision_id=eq.'+encodeURIComponent(revisionId)))[0];
 else row=storage.archive?.records?.find(r=>r.catalog?.revision_id===revisionId)?.catalog;
 if(row&&row.question_id!==questionId)throw Error('검수 유형과 문항 ID가 일치하지 않습니다.');
 return row;
}
async function beforeUpload(bank,item){
 const manual=item.metadata.classification?.confirmed;
 if(!manual?.types?.length&&!manual?.type&&(item.baseRevisionId||item.latestRevisionId)){
  const row=await catalog(bank.storage,item.latestRevisionId||item.baseRevisionId,item.id);
  item.metadata=applyConfirmed(item.metadata,row);
 }
 T.requireDetailed({metadata:item.metadata});
}
async function restoredMetadata(storage,bundle){return applyConfirmed(bundle.metadata,await catalog(storage,bundle.revisionId,bundle.questionId));}
module.exports={applyConfirmed,catalog,beforeUpload,restoredMetadata};
