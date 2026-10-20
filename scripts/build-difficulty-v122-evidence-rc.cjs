'use strict';
const fs=require('fs'),path=require('path'),C=require('../app/difficulty-v122/canonical.cjs');
const dir=path.resolve(__dirname,'../app/difficulty-v122');
const file=path.join(dir,'prompt.json'),old=JSON.parse(fs.readFileSync(file)).instructions;
const marker='\n\n# Atomic evidence relation contract';
let text=old.split(marker)[0];
text=text.replace('각 발견에 basis_step_ids, source_span_ids 및 역할에 맞는 shared_premise_ids/optional_explanation_ids/answer_aggregation_ids를 기록한다. 해당 없는 역할 참조는 빈 배열이다. source manifest의 allowed_roles와 allowed_target_ids를 지킨다. targets에는 source_span_id도 기록한다.',
 '각 발견에 basis_step_ids를 기록한다. source_span_ids와 역할별 source ID는 아래 evidence relation 계약에 따라 시스템이 연결한다. source manifest의 allowed_roles와 allowed_target_ids를 지킨다. targets에는 source_span_id도 기록한다.');
text+=marker+'\n'+
 'evidence_contract_version은 atomic-evidence-relations-r1이다. 입력 evidence_relations의 제공된 관계만 사용한다. 발견마다 basis_step_ids와 evidence_relation_ids를 기록한다. source_span_ids, shared_premise_ids, optional_explanation_ids, answer_aggregation_ids는 출력하지 않는다. 이들은 시스템이 관계에서 연결하며 모델의 표시용 값은 권한이 없다.\n'+
 '현재 approved_route_id 및 발견 role에 대해 해당 basis_step_id의 관계가 하나이면 evidence_relation_ids에 생략할 수 있으며 시스템이 자동 연결한다. 여러 관계이면 현재 target_statement_id를 허용하는 제공된 evidence_relation_id를 명시한다. basis와 span을 독립 조합하거나 relation ID를 만들지 않는다.\n'+
 'shared_premise 관계는 branch마다 복제되지 않는 canonical 관계다. 공통 전제는 하나의 실제 shared_premise 발견으로 선언하고 여러 판단은 그 동일한 discovery id를 depends_on으로 참조한다. branch마다 공통 전제를 새 발견으로 다시 선언하지 않는다. answer aggregation은 기존대로 discovery/assembly/실행량 집계에서 제외한다. 이 계약은 출처 연결만 정하며 C/R/B/H, Move, 승급, 점수 산식을 변경하지 않는다.\n';
fs.writeFileSync(file,JSON.stringify({instructions:text},null,2)+'\n');
fs.writeFileSync(path.join(dir,'schema.json'),JSON.stringify(require('../app/difficulty-v122/schema.cjs').modelSchema(),null,2)+'\n');
const files=Object.fromEntries(fs.readdirSync(dir).filter(n=>/\.(cjs|json)$/.test(n)&&n!=='candidate-versions.json').sort().map(n=>[n,C.bytesHash(fs.readFileSync(path.join(dir,n)))]));
const versions={prompt_hash:files['prompt.json'],schema_hash:files['schema.json'],projection_hash:files['projection.cjs'],validator_hash:C.hash([files['validate.cjs'],files['references.cjs'],files['response-contract.cjs'],files['evidence.cjs']]),scorer_hash:files['scorer.cjs'],source_builder_hash:C.hash([files['source.cjs'],files['input.cjs'],files['evidence.cjs']]),criteria_payload_hash:C.hash(files)};
fs.writeFileSync(path.join(dir,'candidate-versions.json'),JSON.stringify({status:'unfrozen_successor_candidate',versions,files},null,2)+'\n');console.log(JSON.stringify(versions));
