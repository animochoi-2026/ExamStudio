import curriculum from '../app/curriculum.js';
import examModel from '../app/bank-exam-model.cjs';

const leafById=new Map(curriculum.leaves.map(leaf=>[leaf.id,leaf]));

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
