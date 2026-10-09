'use strict';
const inventory=require('./source-inventory.cjs');
async function resolve(bank,item,{selection=null,preview=false}={}){
 if(bank.storage.kind!=='shared'||item.baseRevisionId||item.latestRevisionId||item.metadata.source.kind!=='학교기출'||item.metadata.relations.originalQuestionId)return {linked:false,required:false};
 if(!bank.storage.sourceCandidates)return {linked:false,required:false};
 const identity=inventory.identity(item.metadata.source),candidates=await bank.storage.sourceCandidates(item.metadata.source);
 const exact=identity.key?candidates.filter(c=>inventory.identity(c.metadata.source).key===identity.key):[];
 const writable=c=>c.owner_id===bank.auth.status().account?.id;
 const selectedId=selection&&typeof selection==='object'?selection.questionId:selection;
 let target=selectedId&&selectedId!=='new'?candidates.find(c=>c.question_id===selectedId):null;
 if(selection&&selection!=='new'&&!target)throw Error('선택한 기존 문항을 다시 확인하세요.');
 if(!selection&&exact.length===1&&writable(exact[0]))target=exact[0];
 const required=!target&&selection!=='new'&&(!identity.complete||exact.length>0);
 if(preview)return {questionId:item.questionId,required,target:target||null,candidates: candidates.map(c=>({...c,writable:writable(c)})),identity};
 if(required)throw Error('원본 번호 또는 기존 대상이 불확실합니다. 등록 화면에서 기존 문항 또는 신규 문항을 명시적으로 선택하세요.');
 if(!target)return {linked:false,required:false};
 if(selection?.revisionId&&selection.revisionId!==target.revision_id)throw Error('대상을 확인한 뒤 다른 기기에서 문항을 수정했습니다. 최신 내용을 다시 확인하세요.');
 if(!writable(target))throw Error('다른 교사의 원문은 덮어쓸 수 없습니다. 소유자에게 갱신을 요청하세요.');
 const targetSource=target.metadata.source;
 const numbering={...item.metadata.source.numbering,section:inventory.sourceNumber(targetSource).section};
 for(const key of ['total','objectiveCount','writtenCount','evidence','confirmed'])if(targetSource.numbering?.[key]!=null)numbering[key]=targetSource.numbering[key];
 item.overrides={...item.overrides,...Object.fromEntries([...inventory.fields,'originalNumber'].map(k=>[k,targetSource[k]])),numbering};
 item.metadata.source={...item.metadata.source,...item.overrides};
 const existing=bank.state.items[target.question_id];
 if(existing&&existing.localKey!==item.localKey){bank.state.bindings||={};bank.state.bindings[existing.localKey]=structuredClone(existing);}
 const oldId=item.id;delete bank.state.items[oldId];item.id=target.question_id;item.baseRevisionId=target.revision_id;item.latestRevisionId=null;item.ownerId=target.owner_id;item.folderId=null;
 const sourceId=target.metadata.source.documentId;
 if(sourceId){const oldSource=item.sourceId;item.sourceId=sourceId;item.metadata.source.documentId=sourceId;for(const [key,id]of Object.entries(bank.state.sources))if(id===oldSource)bank.state.sources[key]=sourceId;}
 bank.state.items[item.id]=item;bank.save();return {linked:true,target};
}
module.exports={resolve};
