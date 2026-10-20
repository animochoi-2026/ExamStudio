'use strict';
const {instructions}=require('./prompt.json'),C=require('./canonical.cjs');
function render(prepared){
 const input=JSON.parse(JSON.stringify(prepared.payload));delete input.source_manifest_hash;delete input.source_registry.source_manifest_hash;
 // Approval provenance and past accepted results never become model evidence.
 const hasOverlay=!!input.projection_role_overlay;delete input.projection_role_overlay;
 const effectiveInstructions=instructions+(hasOverlay?'\n\n# 시스템 소유 projection 역할 계약\n이 요청의 role, role_reason, premise_source_id 및 공통 전제/답 모음의 역할은 시스템이 연결한다. 이 세 필드는 출력하지 않는다. shared premise와 answer aggregation을 critical_discoveries에 다시 만들지 않는다. 입력의 제공된 evidence relation으로 공식 필수 판단·도출을 기록한다. required_judgment와 required_derivation relation은 동일한 required 역할의 감사용 subtype이다. 수학적 축, 필수 작업량, 실제 의존 관계는 기존 기준대로 독립 평가한다. 시스템 전제를 출력하지 않은 것을 이유로 가짜 발견이나 의존 edge를 추가하지 않는다.\n':'');
 const generationInstructions=effectiveInstructions+(hasOverlay?'':require('./wire-contract.cjs').instructions);
 const wire={instructions:generationInstructions,input};
 const forbidden=new Set(['previous_score','previous_tier','expected_score','expected_tier','expected_promotions','teacher_override','teacher_override_score','other_model_response','acceptance_criteria']);
 function walk(v){if(!v||typeof v!=='object')return;for(const [k,x]of Object.entries(v)){if(forbidden.has(k)||/token|cookie|api.?key|authorization/i.test(k))throw Error('forbidden rendered payload field '+k);walk(x);}}
 walk(wire.input);
 return {text:generationInstructions+'\n\n평가 대상 원문 및 확정 풀이 JSON:\n'+C.json(input),rendered_payload_hash:C.hash(wire)};
}
module.exports={instructions,render};
