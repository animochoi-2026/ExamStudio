'use strict';
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
// Match the server's recursive key preservation rule, including future fields.
function preserve(prior,incoming){if(!object(prior))return structuredClone(incoming===undefined?prior:incoming);const result=object(incoming)?structuredClone(incoming):{};for(const [key,value]of Object.entries(prior))result[key]=object(value)?preserve(value,result[key]):result[key]===undefined||result[key]===null?structuredClone(value):result[key];return result;}
function sameDifficulty(prior,incoming){const old=prior.difficulty?.v121Active?.input_identity||prior.difficulty?.v121Latest?.identity;return !!old&&old===incoming.difficulty?.v121Latest?.identity;}
function merge(prior,incoming){const result=preserve(prior,incoming);if(prior.processing)result.processing=preserve(incoming.processing||{},prior.processing);for(const section of ['classification','difficulty','review'])if(prior[section]?.confirmed)result[section].confirmed=structuredClone(prior[section].confirmed);
 // A new v1.2.1 assessment is an explicit replacement of old difficulty values.
 // The full prior record stays in protectedBase and immutable server history.
 if(incoming.difficulty?.v121Latest?.record?.spec_revision==='1.2.1'){
  // The deployed guard requires prior keys to remain present. Explicit null
  // tombstones retire their VALUES without restoring an old score or bypassing
  // the recursive protection of processing and other metadata sections.
  result.difficulty={...Object.fromEntries(Object.keys(prior.difficulty||{}).map(key=>[key,null])),...structuredClone(incoming.difficulty)};
  if(sameDifficulty(prior,incoming))for(const key of ['userScore','teacherBand','teacher_override_score','teacher_override_reason','teacher_override_by','teacher_override_at','teacher_override_active','confirmed'])if(Object.hasOwn(prior.difficulty,key))result.difficulty[key]=structuredClone(prior.difficulty[key]);
 }
 return result;}
async function refresh(bank,item){if(bank.storage.kind!=='shared'||!item.baseRevisionId||!bank.storage.rows)return;
 const rows=await bank.storage.rows('bank_catalog','revision_id=eq.'+item.baseRevisionId);if(rows.length!==1)throw Error('기존 문항의 수정 이력을 조회하지 못했습니다. 기존 자료를 보존했습니다.');
 const unchanged=sameDifficulty(rows[0].metadata,item.metadata);
 item.metadata=merge(rows[0].metadata,item.metadata);
 if(unchanged&&rows[0].confirmed?.difficulty!=null)item.metadata.difficulty.userScore=rows[0].confirmed.difficulty;
 item.protectedBase={revisionId:item.baseRevisionId,reviewVersion:rows[0].review_version,metadata:structuredClone(rows[0].metadata),confirmed:structuredClone(rows[0].confirmed)};
}
async function check(bank,job){if(!job.protectedBase||!bank.storage.rows)return;const [current]=await bank.storage.rows('bank_catalog','revision_id=eq.'+job.protectedBase.revisionId);if(!current||JSON.stringify(current.metadata)!==JSON.stringify(job.protectedBase.metadata)||(job.protectedBase.confirmed!==undefined&&JSON.stringify(current.confirmed)!==JSON.stringify(job.protectedBase.confirmed)))throw Object.assign(Error('기존 문항이 등록 준비 후 수정되었습니다. 최신 수정 이력을 다시 조회해 등록해야 합니다.'),{code:'protected_metadata_missing',status:409});}
module.exports={preserve,merge,refresh,check};
// Only called on an explicit retry of a structural rejection. Images and their
// verified IDs stay untouched; immutable rejected metadata files are retained.
async function rebuild(bank,job){
 if(!job.requiresPayloadRebuild||job.committed)return;
 const heads=await bank.remoteHeads(job.questionId);
 if(heads.some(h=>h.revisionId===job.revisionId)){job.committed=true;job.status='complete';bank.save();return;}
 if(heads.length!==1||heads[0].revisionId!==job.parentRevisionId)throw Object.assign(Error('기존 문항의 최신 버전이 변경되었습니다. 등록 대상을 다시 확인하세요.'),{code:'conflict',status:409});
 const [row]=await bank.storage.rows('bank_catalog','revision_id=eq.'+job.parentRevisionId);
 if(!row?.metadata)throw Error('기존 문항의 수정 이력을 조회하지 못했습니다.');
 const fs=require('node:fs'),path=require('node:path'),{atomicWrite}=require('./store.cjs'),file=path.join(bank.dir,'outbox',job.id,'question.json'),bundle=JSON.parse(fs.readFileSync(file,'utf8'));
 job.payloadRebuild||={priorMetadata:structuredClone(bundle.metadata),priorData:job.remote.data,priorCommit:job.remote.commit,at:new Date().toISOString()};
 // Save the recovery intent before replacing the local payload (crash safe).
 bank.save();bundle.metadata=merge(row.metadata,bundle.metadata);atomicWrite(file,bundle);
 delete job.remote.data;delete job.remote.commit;
 job.protectedBase={revisionId:job.parentRevisionId,reviewVersion:row.review_version,metadata:structuredClone(row.metadata)};
 job.requiresPayloadRebuild=false;job.uploadState='재시도 대기';bank.save();
}
module.exports.rebuild=rebuild;
