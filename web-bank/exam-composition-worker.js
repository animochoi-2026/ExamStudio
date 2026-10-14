import model from '../app/bank-exam-model.cjs';
import supplementPlan from './supplement-plan.cjs';
import mock from './mock-exam-model.cjs';
import supplements from './mock-round-supplements.cjs';
const version=typeof __COMPOSITION_VERSION__==='undefined'?'development':__COMPOSITION_VERSION__;

self.onmessage=({data})=>{
 try{if(data.version!==version)throw Error('출제 계산 파일의 버전이 다릅니다. 새로고침 후 다시 실행하세요.');self.postMessage({version,result:data.kind==='mock'?(data.request.recommendRound?supplements.plan(data.request):data.request.recommend?mock.recommend(data.request):mock.compose({...data.request,onProgress:progress=>self.postMessage({version,progress})})):(data.rules.supplementRequiredIds?.length?supplementPlan.select(data.candidates,data.rules):model.selectQuestions(data.candidates,data.rules))});}
 catch(error){self.postMessage({version,error:{message:error.message||String(error)}});}
};
