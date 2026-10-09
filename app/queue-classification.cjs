'use strict';
const C=require('./curriculum.js'),T=require('./bank-question-types.cjs');
const properties=require('./bank-analysis.cjs').schema.properties;
const keys=['primaryUnitId','relatedUnitIds','conditionUnitIds','solutions','types','typeReason'];
const schema={type:'object',additionalProperties:false,required:keys,properties:Object.fromEntries(keys.map(k=>[k,structuredClone(properties[k])]))};
function checked(value){
 if(!value||!Array.isArray(value.types)||!Array.isArray(value.solutions))throw Error('단원·유형 결과 확인 필요');
 const unit=id=>C.leaves.find(u=>u.id===id);if(value.primaryUnitId&&!unit(value.primaryUnitId))throw Error('교육과정에 없는 대표 단원');
 for(const id of [...value.relatedUnitIds,...value.conditionUnitIds,...value.solutions.flatMap(s=>s.unitIds)])if(!unit(id))throw Error('교육과정에 없는 관련 단원');
 for(const type of value.types)if(!T.catalog().some(t=>t.id===type.id)||!type.evidence?.trim())throw Error('출제유형 ID·근거 확인 필요');
 return structuredClone(value);
}
function instructions(){return '\n[대기열 통합 분류] 이 풀이 응답의 queueClassification에 대표·관련·조건 단원과 풀이별 사용 단원, 실제 요구 작업의 출제유형을 함께 기록하세요. 난이도 assessment와 원본 배점은 별개입니다. 선수 개념은 허용하되 범위 밖 핵심 성질에 의존한 풀이는 compatible으로 선언하지 마세요. 대표 단원은 교육과정 ID, 유형은 실제 본문 요구 문구의 근거가 있는 제공 ID만 사용합니다. 불명확하면 null/[]와 typeReason으로 남깁니다. 풀이를 다시 만드는 분류용 요청은 없습니다.\n교육과정: '+JSON.stringify(C.leaves.map(u=>({id:u.id,name:u.title,grade:u.grade})))+'\n출제유형: '+JSON.stringify(T.catalog());}
function apply(metadata,q,p,scope){const packet=q.queueClassification;if(!packet||packet.basis!==require('./bank-analysis.cjs').basis(q,p,scope))return;const value=checked(packet.value),unit=id=>{const u=C.leaves.find(x=>x.id===id);return u?{id:u.id,name:u.title}:null;},c=metadata.classification;
 if(!c.confirmed?.primaryUnit){c.primaryUnit=unit(value.primaryUnitId);c.relatedUnits=value.relatedUnitIds.map(unit);c.conditionUnitIds=value.conditionUnitIds;c.solutions=value.solutions;c.status=c.primaryUnit?'ai_suggested':'unclassified';}
 if(!c.confirmed?.types?.length&&!c.confirmed?.type){c.types=value.types.map(type=>({...T.catalog().find(t=>t.id===type.id),evidence:type.evidence,source:'combined_solution'}));c.typeRecommendation={status:c.types.length?'suggested':'unresolved',reason:value.typeReason,source:'combined_solution'};}
 c.suggested={primaryUnit:unit(value.primaryUnitId),relatedUnits:value.relatedUnitIds.map(unit),types:structuredClone(c.types),reason:value.typeReason};
}
module.exports={schema,checked,instructions,apply};
