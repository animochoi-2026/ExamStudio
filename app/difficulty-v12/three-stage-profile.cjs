'use strict';
const I=require('./input.cjs'),S=require('./schema.cjs'),P=require('./scoring-profiles.cjs');
const id='literacy-one-proof-d-three-stage-20261018';
const base=P.get(P.literacyOneId);
const instructions=base.instructions+'\n\n## 추가 문해력 기준 (d)\n(d) 증명에서 빈칸을 채우도록 하는 문항. 증명문의 앞뒤 논리 연결과 빈칸에 들어갈 조건·관계·용어를 파악하는 문해력 부담을 검토한다. literacy_evidence에 (d) 해당 여부와 실제 부담의 근거를 기록한다. 수학적 관계를 새로 발견하는 부담은 C/R/B와 구분한다. 문해력 승급은 +1이다.\n\n## 판정 불확실성 기록\nassessment_uncertainty에는 실제로 해결되지 않은 게이트 판정, 풀이, 원문 해석, 교과 범위의 불확실성만 각각 gate_ambiguity, solution_unresolved, source_ambiguity, scope_ambiguity로 기록한다. 판단이 명확하면 빈 배열이다. confidence는 평가 근거의 안정성이다. 어려운 문제라는 이유만으로 불확실하다고 표시하지 않는다.';
const schema={...S.schema,properties:{...S.schema.properties,assessment_uncertainty:{type:'array',items:{type:'string',enum:['gate_ambiguity','solution_unresolved','source_ambiguity','scope_ambiguity']}}},required:[...S.schema.required,'assessment_uncertainty']};
function evaluate(value){
 const evaluated=base.evaluate(value);
 const uncertainty=value?.assessment_uncertainty;
 if(!Array.isArray(uncertainty)||uncertainty.some(v=>!schema.properties.assessment_uncertainty.items.enum.includes(v)))return {raw:null,computed:{status:'failed',score:null,problem_tier:null,reason:'invalid_uncertainty',scorer_version:base.scorerVersion}};
 return {...evaluated,raw:evaluated.raw?{...evaluated.raw,assessment_uncertainty:[...new Set(uncertainty)]}:null};
}
module.exports={id,instructions,schema,promptHash:I.hash(instructions),scorerVersion:base.scorerVersion,evaluate};
