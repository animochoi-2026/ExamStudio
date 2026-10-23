import sets from '../app/question-sets.cjs';
import {isTransientPreparationError} from './preview-wait.js';
export async function getSets(client,config,{signal}={}){
 const active=signal?AbortSignal.any([signal,AbortSignal.timeout(45000)]):AbortSignal.timeout(45000);
 for(let attempt=0;attempt<2;attempt++){
  active.throwIfAborted();
  try{
   const {data,error,status}=await client.rpc('bank_question_sets_get',{s:config.spaceId}).abortSignal(active);
   active.throwIfAborted();
   if(error)throw Object.assign(Error('세트 권한·연결 확인 실패: '+error.message),{originalMessage:error.message,code:error.code,status:error.status||status,details:error.details});
   if(!Array.isArray(data))throw Error('세트 정보 응답 형식이 올바르지 않습니다.');
   return data;
  }catch(error){if(attempt||active.aborted||!isTransientPreparationError(error))throw error;}
 }
}
export async function enrichSets(client,config,rows){return sets.attach(rows,await getSets(client,config));}
export async function enrichMockSets(client,config,snapshot,options){const setRegistry=await getSets(client,config,options);return {...snapshot,candidates:sets.attach(snapshot.candidates,setRegistry),setRegistry};}
export function attachItems(items,registry){return items.map(i=>{const g=registry.find(g=>g.members.some(m=>m.questionId===i.questionId));return {...i,questionSet:g||null};});}
export async function enrichPageSets(client,config,rows){
 if(!rows.length)return rows;
 const {data,error}=await client.rpc('bank_question_sets_page',{s:config.spaceId,revisions:rows.map(c=>c.revision_id)}).abortSignal(AbortSignal.timeout(45000));
 if(error)throw Error('세트 연결 조회 실패: '+error.message);return sets.attach(rows,data);
}
