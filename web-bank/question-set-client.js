import sets from '../app/question-sets.cjs';
export async function getSets(client,config){const {data,error}=await client.rpc('bank_question_sets_get',{s:config.spaceId}).abortSignal(AbortSignal.timeout(45000));if(error)throw Error('세트 권한·연결 확인 실패: '+error.message);return data;}
export async function enrichSets(client,config,rows){return sets.attach(rows,await getSets(client,config));}
export function attachItems(items,registry){return items.map(i=>{const g=registry.find(g=>g.members.some(m=>m.questionId===i.questionId));return {...i,questionSet:g||null};});}
export async function enrichPageSets(client,config,rows){
 if(!rows.length)return rows;
 const {data,error}=await client.rpc('bank_question_sets_page',{s:config.spaceId,revisions:rows.map(c=>c.revision_id)}).abortSignal(AbortSignal.timeout(45000));
 if(error)throw Error('세트 연결 조회 실패: '+error.message);return sets.attach(rows,data);
}
