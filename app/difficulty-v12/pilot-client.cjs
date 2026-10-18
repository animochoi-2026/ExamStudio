'use strict';
const I=require('./input.cjs'),P=require('./pilot.cjs');
// Authenticated transport is supplied by the owner session. Preparation calls no model.
async function preparePilot({invoke,bankInputs,externalImages,spaceId}){
 if(bankInputs.length!==22||new Set(bankInputs.map(e=>e.questionId)).size!==22)throw Error('은행 고유 문항 22개 필요');
 const external=P.mapping().map(m=>{const image=externalImages[m.file];if(!image)throw Error('원문 이미지 필요: '+m.file);const source={question:{body:''},scope:m.scope,target:m.target,restrictions:m.restrictions,images:[image]};I.input(source);return {...m,source};});
 const job=await invoke({action:'prepare',spaceId,kind:'pilot',questionIds:bankInputs.map(e=>e.questionId)});
 for(const m of external)await invoke({action:'external',id:job.id,externalId:m.id,source:m.source});
 await invoke({action:'prepare-next',id:job.id});return job;
}
async function executeApproved({invoke,id,approval}){
 if(!approval?.granted||approval.promptHash!==I.promptHash||approval.model!==I.settings.model||approval.effort!=='high'||approval.strict_calibration!==false)throw Error('현재 실제 프롬프트·비용 실행 승인이 필요합니다.');
 await invoke({action:'approve',id,approval});return invoke({action:'run',id});
}
module.exports={preparePilot,executeApproved};
