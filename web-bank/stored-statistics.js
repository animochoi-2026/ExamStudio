// The server persists completed group summaries at commit time.
export function storedStatistics(value){
 if(!Array.isArray(value?.groups)||!Array.isArray(value?.signals))throw Error('저장 통계 응답을 확인할 수 없습니다.');
 for(const group of value.groups)for(const part of ['all','objective','written','unknown']){
  const v=group[part];if(!v||!Number.isSafeInteger(v.total)||v.total<0||!Number.isSafeInteger(v.numericCount)||v.numericCount<0||v.numericCount>v.total)throw Error('저장 통계 응답을 확인할 수 없습니다.');
 }
 return {groups:value.groups.sort((a,b)=>a.school.localeCompare(b.school)||a.grade.localeCompare(b.grade)),signals:value.signals.map(x=>({...x,group:JSON.stringify(x.group)}))};
}
