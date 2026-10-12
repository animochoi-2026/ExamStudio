import curriculum from '../app/curriculum.js';
import examModel from '../app/bank-exam-model.cjs';

const leafById=new Map(curriculum.leaves.map(leaf=>[leaf.id,leaf]));

// One small, permission-filtered index per editor, shared across scope changes.
// Rejected requests are never cached, so the retry button can recover.
export function schoolIndexLoader(rpc,spaceId){
 let cached=null,pending=null;
 return async()=>{
  if(cached)return cached;
  if(!pending)pending=rpc('bank_exam_school_index',{s:spaceId}).then(rows=>{
   if(!Array.isArray(rows))throw Error('학교 목록 응답을 확인할 수 없습니다.');
   const grouped=new Map();
   for(const row of rows){if(!grouped.has(row.source_id))grouped.set(row.source_id,[]);grouped.get(row.source_id).push(row);}
   return cached=grouped;
  }).finally(()=>{pending=null;});
  return pending;
 };
}

// School choices describe source exams with a question in the chosen topic.
// This is separate from automatic composition, which still requires a checked,
// complete solution and applies the remaining status/difficulty conditions.
export function questionMatchesScope(question,selectedIds){
 if(!selectedIds?.size)return false;
 const metadata=question?.metadata||{},classification=metadata.classification||{};
 const grade=metadata.source?.grade||'';
 const values=[question.confirmed?.primaryUnit,classification.confirmed?.primaryUnit,classification.primaryUnit,classification.suggested?.primaryUnit];
 for(const value of values){
  const id=typeof value==='string'?value:value?.id;
  if(id&&leafById.has(id))return selectedIds.has(id);
  const name=typeof value==='string'?value:value?.name;
  const matches=curriculum.leaves.filter(leaf=>leaf.title===name&&(!grade||curriculum.gradeKey(grade)===leaf.gradeId));
  if(matches.length===1&&selectedIds.has(matches[0].id))return true;
 }
 const evidence=question.confirmed?.scopeEvidence;
 if(evidence){const fit=examModel.scopeFit({...metadata,classification:evidence},[...selectedIds]);if(fit.ok)return true;}
 return false;
}

export function matchingSourceSchools(sources,questionsBySource,selectedIds){
 const matched=new Map();
 for(const source of sources){
  const school=source.source?.school;
  if(!school)continue;
  const relevant=(questionsBySource.get(source.source_id)||[]).filter(question=>questionMatchesScope(question,selectedIds));
  if(!relevant.length)continue;
  const current=matched.get(school)||{school,examCount:0,questionCount:0};
  current.examCount++;current.questionCount+=relevant.length;matched.set(school,current);
 }
 return [...matched.values()].sort((a,b)=>a.school.localeCompare(b.school,'ko'));
}
