'use strict';
const {hash,validateScope}=require('./rules.cjs');
function refresh(p,scope){
 const q=p?.original,c=q?.checks,prefix='금지 개념 언급/의존 검토 필요: ';
 if(!c?.program?.errors?.some(e=>e.startsWith(prefix))||!c.ai||q.solutionDraft||q.solutionStale||q.solutionProvenance?.scopeVersion!==hash(validateScope(scope))||q.solutionProvenance?.sourceVersion!==p.recognition?.version)return false;
 const authorized=c.scope?.userAuthorizedConcepts||[],forbidden=require('./scope-check.cjs').forbiddenConcepts({...scope,forbidden:(scope.forbidden||[]).filter(x=>!authorized.includes(x))},c.ai,(q.solution||'').split('\n\n[참고 코멘트]')[0]);
 if(forbidden.length)return false;
 c.program.errors=c.program.errors.filter(e=>!e.startsWith(prefix));c.program.status=c.program.errors.length?'failed':'partial';
 c.scope={...c.scope,status:c.scope.originalScopeStatus||c.ai.scopeStatus,forbiddenHits:[]};return true;
}
module.exports={refresh};
