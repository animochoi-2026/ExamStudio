'use strict';
const fs=require('node:fs'),I=require('./input.cjs'),B=require('./bundle-input.cjs'),V=require('./schema.cjs');
const flights=new Map();
async function prepared(q,p,scope){
 const paths=[...(p.cropPaths||[]),q.sourceFigure?.path,...(q.sourceFigures||[]).map(f=>f.path)].filter(Boolean),images=[];
 for(const file of [...new Set(paths)]){const bytes=fs.readFileSync(file);images.push({sha256:B.digest(bytes),dataUrl:'data:'+B.image(bytes)+';base64,'+bytes.toString('base64')});}
 return I.input({question:q,scope:scope?.grade,scopeContext:scope,restrictions:[scope?.restrictions,...(scope?.forbidden||[]),...(scope?.curriculum?.extraForbidden||[])].filter(Boolean),images});
}
function locate(store,projectId,questionId){const project=store.get(projectId),p=project.problems.find(p=>[p.original,...(p.variants||[])].some(q=>q?.id===questionId)),q=[p?.original,...(p?.variants||[])].find(q=>q?.id===questionId);if(!q)throw Error('업로드 평가 문항 없음');return {project,p,q};}
async function evaluate({bank,store,projectId,questionId,invoke,allowNetwork=true,sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
 const {project,p,q}=locate(store,projectId,questionId),input=await prepared(q,p,project.scope),item=bank.ensure(project,p,q),saved=item.metadata.difficulty.v12Latest;
 if(saved?.inputVersion===input.inputVersion&&saved.result?.computed?.status==='complete'){
  const basis=require('../assessment-cache.cjs').basis(q,p,project.scope);
  if(saved.inputBasis!==basis||item.metadata.analysis?.status!=='complete'){saved.inputBasis=basis;item.metadata.analysis={...item.metadata.analysis,basis,status:'complete',error:null};item.metadata.difficulty.reassessmentRequired=false;item.hasLocalChanges=true;bank.save();if(bank.state?.auto)bank.markDirty(projectId,questionId);}
  return {reused:true};
 }
 if(!allowNetwork)throw Error('저장된 동일 v1.2 평가가 없습니다. AI 호출 없이 보류합니다.');
 const key=String(bank.auth?.config?.().spaceId||'')+':'+input.inputVersion;
 if(!flights.has(key)){
  const request=(async()=>{let r=await invoke({action:'upload',source:{question:input.payload.question,scope:input.payload.curriculum_scope,scopeContext:input.payload.scope_context,restrictions:input.payload.solution_restrictions,images:input.images},localId:questionId});
   for(let n=0;r.pending&&n<100;n++){await sleep(1500);r=await invoke({action:'upload-result',id:r.id});}
   if(r.pending)throw Error('평가 진행 중입니다. 이어하기에서 기존 응답을 확인합니다.');
   const evaluated=V.evaluate(r.result?.raw);if(evaluated.computed.status!=='complete'||r.result.inputVersion!==input.inputVersion||r.result.versions?.evaluation_version!==I.evaluationVersion)throw Error('v1.2 평가 결과를 확인하지 못했습니다. 기존 점수는 유지합니다.');return {...r.result,...evaluated};})();
  flights.set(key,request);request.then(()=>flights.delete(key),()=>flights.delete(key));
 }
 const result=await flights.get(key),fresh=locate(store,projectId,questionId);
 if((await prepared(fresh.q,fresh.p,fresh.project.scope)).inputVersion!==input.inputVersion)throw Error('평가 중 원문이 변경되었습니다.');
 const target=bank.ensure(fresh.project,fresh.p,fresh.q),m=target.metadata,basis=require('../assessment-cache.cjs').basis(fresh.q,fresh.p,fresh.project.scope);
 const previous=structuredClone(Object.fromEntries(Object.entries(m.difficulty).filter(([k])=>k!=='history')));m.difficulty.history||=[];
 if(!m.difficulty.history.some(x=>I.hash(x)===I.hash(previous)))m.difficulty.history.push(previous);
 m.difficulty.v12Latest={inputVersion:input.inputVersion,inputBasis:basis,result};m.difficulty.reassessmentRequired=false;
 m.analysis={...m.analysis,status:'complete',basis,criteriaVersion:'insight-bottleneck-v1.2',error:null};target.hasLocalChanges=true;target.status='local';bank.save();if(bank.state?.auto)bank.markDirty(projectId,questionId);return {reused:false,score:result.computed.score};
}
async function afterAnalysis({bank,store,projectId,questionIds,savedOnly=false}){
 const invoke=async body=>bank.auth.request('/functions/v1/bank-difficulty-v12',{method:'POST',body:{...body,spaceId:bank.auth.config().spaceId},token:await bank.auth.token()}),result={analyzed:0,reused:0,errors:[],waiting:false};
 bank.catalog?.(projectId);
 for(const questionId of questionIds){try{const r=await evaluate({bank,store,projectId,questionId,invoke,allowNetwork:!savedOnly});result[r.reused?'reused':'analyzed']++;}catch(e){result.errors.push({questionId,code:'difficulty_v12',message:e.message});}}
 return result;
}
module.exports={evaluate,afterAnalysis,prepared};
