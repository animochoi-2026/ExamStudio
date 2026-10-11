import sets from '../app/question-sets.cjs';
export async function getSets(client,config){const {data,error}=await client.rpc('bank_question_sets_get',{s:config.spaceId}).abortSignal(AbortSignal.timeout(45000));if(error)throw Error('세트 권한·연결 확인 실패: '+error.message);return data;}
export async function enrichSets(client,config,rows){return sets.attach(rows,await getSets(client,config));}
export function attachItems(items,registry){return items.map(i=>{const g=registry.find(g=>g.members.some(m=>m.questionId===i.questionId));return {...i,questionSet:g||null};});}
