'use strict';
// Metadata-only reassessment through the existing owner maintenance/verified
// upload path. No inference, grants, deletes, retries or in-place file changes.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),R=require('./difficulty-reassessment.cjs'),D=require('./difficulty-assessment.cjs'),Cache=require('./assessment-cache.cjs');
const hash=Cache.hash;
async function publish({storage,archive,item,row,result,jobId,revisionId,actorId,spaceId,directory,appVersion,checkpoint,currentOnly=true,verificationOnly=false}){
 if(!checkpoint||!revisionId||!jobId)throw Error('명시적인 작업·버전·저장 기록이 필요합니다.');
 if(Object.keys(R.protectedFields(item.catalog)).length)throw Error('교사 확정값은 보존합니다.');
 const policy='difficulty-only-v1',stateFile=path.join(directory,'difficulty-publication.json');
 const identity=hash({jobId,revisionId,actorId,spaceId,inputFingerprint:row.inputFingerprint,baseRevisionId:row.revisionId,currentOnly,verificationOnly,result:verificationOnly?null:result});
 let state=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,'utf8')):null;
 if(state&&(state.identity!==identity||state.policy!==policy))throw Error('저장 작업의 입력 또는 ID가 변경되었습니다.');
 const persist=()=>{fs.writeFileSync(stateFile+'.tmp',JSON.stringify(state,null,2));fs.renameSync(stateFile+'.tmp',stateFile);};
 const verify=async replay=>{const [actual]=await storage.rows('bank_catalog','revision_id=eq.'+revisionId),[version]=await storage.rows('bank_revisions','id=eq.'+revisionId);
  if(!version?.committed||!actual||actual.commit_id!==state.commit.id||hash(actual.metadata)!==hash(state.metadata)||hash(actual.content)!==hash(state.content)||hash(actual.files)!==hash(state.files))throw Error('저장된 완료 결과가 고정한 작업과 다릅니다.');
  if(!replay&&hash(actual.confirmed)!==hash(state.confirmed))throw Error('저장 중 교사 확정값이 변경되었습니다.');
  const returned=JSON.parse(await storage.download(state.data.id,state.data));if(hash(returned.native)!==state.nativeHash||hash(returned.metadata)!==hash(state.metadata))throw Error('재불러오기 검증이 실패했습니다.');
  for(const f of state.reusedFiles){const bytes=await storage.download(f.id,f);if(crypto.createHash('sha256').update(bytes).digest('hex')!==f.sha256)throw Error('재사용 파일 검증 실패');}
  state.status='complete';persist();await checkpoint({status:'complete',revisionId,score:D.effective(actual).number,rawScore:actual.metadata.difficulty.aiScore,verificationOnly,contentUnchanged:true,nativeContentUnchanged:true,nativeAssessmentUpdated:currentOnly&&!verificationOnly,confirmedUnchanged:hash(actual.confirmed)===hash(state.confirmed),reviewChangedAfterCompletion:replay&&hash(actual.confirmed)!==hash(state.confirmed),filesContentUnchanged:true,reusedFiles:state.reusedFiles.length,newFiles:2,replay});return actual;
 };
 // A lost completion response never stages a new revision or uploads new IDs.
 if(state){const [existing]=await storage.rows('bank_revisions','id=eq.'+revisionId);if(existing?.committed)return verify(true);}
 const check=async()=>{const versions=await storage.rows('bank_revisions','question_id=eq.'+row.questionId),complete=versions.filter(v=>v.committed),parents=new Set(complete.map(v=>v.parent_id)),heads=complete.filter(v=>!parents.has(v.id));if(heads.length!==1||heads[0].id!==row.revisionId||heads[0].review_version!==item.catalog.review_version)throw Error('수정 충돌: 평가 이후 문항 또는 검수값이 변경되었습니다.');const [catalog]=await storage.rows('bank_catalog','revision_id=eq.'+row.revisionId);const current={...structuredClone(item),catalog:{...catalog,review_version:heads[0].review_version,visibility:heads[0].visibility}};if(R.fingerprint(current)!==row.inputFingerprint||hash(catalog.confirmed)!==hash(item.catalog.confirmed)||hash(catalog.files)!==hash(item.catalog.files))throw Error('평가 입력 또는 사용자 확정값이 변경되었습니다.');return current;};
 const current=await check();if(Object.keys(R.protectedFields(current.catalog)).length)throw Error('교사 확정값은 보존합니다.');
 if(!state){let carried;
 if(verificationOnly){if(D.activeAssessment(current.catalog))throw Error('버전 결합 평가가 있는 문항은 무변경 검증 대상으로 사용할 수 없습니다.');carried={catalog:structuredClone(current.catalog),record:{score:current.catalog.metadata.difficulty.aiScore}};carried.catalog.revision_id=revisionId;}
 else if(currentOnly&&row.status==='reuse_versioned_result'){const accepted=D.activeAssessment(current.catalog);if(!accepted||hash(accepted.assessment)!==hash(result.assessment)||hash(accepted.provenance)!==hash(result.provenance))throw Error('현재 버전에 연결된 새 기준 완료 평가와 다릅니다.');const catalog=D.currentOnly(current.catalog);catalog.revision_id=revisionId;catalog.metadata.difficulty.assessment.revisionBinding={fromRevisionId:row.revisionId,revisionId,method:'current_only_metadata_revision'};carried={catalog,record:accepted};}
 else{const saved=R.recordResult(current,row,result.assessment,{...result.provenance,activate:false}),evaluated={...current,catalog:saved.catalog},target={...evaluated,catalog:{...structuredClone(saved.catalog),revision_id:revisionId}};carried=R.carryToRevision(evaluated,row.idempotencyKey,target,{at:new Date().toISOString()});if(currentOnly)carried.catalog=D.currentOnly(carried.catalog);} 
 const original=JSON.parse(await archive.download(current.catalog.commit_id)),nativeFile=current.catalog.files.find(f=>f.role==='data'),bundle=JSON.parse(await archive.download(nativeFile.id,nativeFile));
 if(bundle.questionId!==row.questionId||bundle.revisionId!==row.revisionId||hash(bundle.metadata)!==hash(current.catalog.metadata))throw Error('백업의 네이티브 자료와 현재 목록이 다릅니다.');
 if(hash(original.files)!==hash(current.catalog.files))throw Error('백업의 파일 목록과 현재 목록이 다릅니다.');
 const proof=hash(bundle.native);let expectedNative=proof;if(currentOnly&&!verificationOnly){const p=bundle.native.project.problems.find(p=>[p.original,...(p.variants||[])].some(q=>q?.id===bundle.native.targetQuestionId)),q=[p.original,...(p.variants||[])].find(q=>q?.id===bundle.native.targetQuestionId);q.assessment=Cache.record(carried.record.assessment,q,p,bundle.native.project.scope,{...carried.record.provenance,criteriaVersion:D.version});if(p.recognition&&p.recognition.assessmentOrigin?.criteriaVersion!==D.version){delete p.recognition.assessment;delete p.recognition.assessmentOrigin;}expectedNative=hash(bundle.native);}bundle.revisionId=revisionId;bundle.parentRevisionId=row.revisionId;bundle.modifiedAt=new Date().toISOString();bundle.appVersion=appVersion;bundle.metadata=carried.catalog.metadata;
 const descriptors=original.files.filter(f=>f.role!=='data').map(f=>structuredClone(f));
 // Check the authorized parent links, owner and verified bytes before any write.
 const links=await storage.rows('bank_revision_files','revision_id=eq.'+row.revisionId),[owner]=await storage.rows('bank_questions','id=eq.'+row.questionId);if(owner?.owner_id!==actorId||owner?.space_id!==spaceId)throw Error('같은 소유자의 문항만 파일을 재사용할 수 있습니다.');
 for(const f of descriptors){if(!['source','docx','preview','asset','attachment'].includes(f.role))throw Error('재사용할 수 없는 파일 역할');const bytes=await archive.download(f.id,f),m=await storage.get(f.id);if(bytes.length!==f.size||crypto.createHash('sha256').update(bytes).digest('hex')!==f.sha256||!m.verified||m.size!==f.size||m.sha256!==f.sha256||m.appProperties.role!==f.role||!links.some(l=>l.file_id===f.id)||f.role!=='source'&&(m.ownerId!==actorId||m.appProperties.questionId!==row.questionId))throw Error('기존 파일의 소유권·연결·해시 검증 실패');}
 fs.mkdirSync(directory,{recursive:true});bundle.files=descriptors;
 const prepared=(key,bytes,name,role)=>{const id=crypto.randomUUID(),file=path.join(directory,id+'.bin');fs.writeFileSync(file,bytes,{flag:'wx'});return {descriptor:{key,id,name,role,size:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')},file};};
 const data=prepared('data',Buffer.from(JSON.stringify(bundle)),'question.json','data');
 const commit={schemaVersion:1,app:'examstudio-bank-v1',rootId:spaceId,questionId:row.questionId,sourceId:original.sourceId,revisionId,parentRevisionId:row.revisionId,completedAt:new Date().toISOString(),metadata:bundle.metadata,folderId:original.folderId,files:[...descriptors,data.descriptor],immutableReferencePolicy:policy,baseReviewVersion:current.catalog.review_version};
 const completed=prepared('commit',Buffer.from(JSON.stringify(commit)),'complete.json','commit');
 state={policy,identity,status:'prepared',revisionId,jobId,baseRevisionId:row.revisionId,parentFolderId:original.folderId,data:data.descriptor,dataFile:data.file,commit:completed.descriptor,commitFile:completed.file,files:commit.files,reusedFiles:descriptors,metadata:bundle.metadata,content:current.catalog.content,confirmed:current.catalog.confirmed,nativeHash:expectedNative,report:{rule:verificationOnly?'difficulty-immutable-noop-v1':'difficulty-fixed-learner-access-v2',criteriaVersion:D.version,newScore:carried.record.score,evaluationKey:row.idempotencyKey,contentUnchanged:true,backupVerified:true,verificationOnly}};persist();
 }
 for(const [descriptor,file]of [[state.data,state.dataFile],[state.commit,state.commitFile]]){const bytes=fs.readFileSync(file);if(bytes.length!==descriptor.size||crypto.createHash('sha256').update(bytes).digest('hex')!==descriptor.sha256)throw Error('준비된 전송 파일이 변경되었습니다.');}
 await checkpoint({status:'prepared',revisionId,score:state.report.newScore,dataId:state.data.id,commitId:state.commit.id,reusedFiles:state.reusedFiles.length});
 await storage.rpc('bank_maintenance_stage',{j:jobId,b:row.revisionId,r:revisionId,expected:current.catalog.review_version,report_value:state.report});
 await storage.beginRevision({actorId,questionId:row.questionId,revisionId,parentRevisionId:row.revisionId});
 const registry={},folder=await storage.folder({key:crypto.createHash('sha256').update(spaceId+'revision:'+revisionId).digest('hex'),name:'R_'+revisionId,parent:state.parentFolderId,registry,save:()=>{}});
 for(const [descriptor,file]of [[state.data,state.dataFile],[state.commit,state.commitFile]]){await storage.put({file,id:descriptor.id,name:descriptor.name,parent:folder,properties:{questionId:row.questionId,revisionId,role:descriptor.role,rootId:spaceId}});state.status=descriptor.role+'_verified';persist();await checkpoint({status:state.status,revisionId,fileId:descriptor.id});}
 return verify(false);
}
module.exports={publish};
