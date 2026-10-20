'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'app/difficulty-v122'),C=require(path.join(dir,'canonical.cjs'));
const parent='C:/Users/reals/.codex/worktrees/registration-ui-20261017/문제생성기/artifacts/difficulty-v121/shindong-m2-three-stage-20261020';
let prompt=fs.readFileSync(path.join(parent,'canonical-prompt.txt'),'utf8').split('아래 JSON Schema를 따른다.')[0];
// Keep the existing student/axis/numerical rubric. Remove named historical
// outcomes and superseded verbatim-copy requirements, never tune score bands.
prompt=prompt.split('\n').filter(line=>!/(?:신구중|신동중|4\.8\s*\/\s*T2|5caaf1eaecc)/.test(line)).join('\n');
prompt=prompt.replaceAll('m2-required-projection-r1','difficulty-v1.2.2-rc1')
 .replaceAll('실제로 사용한 부분을 그대로 짧게 인용한다','실제로 사용한 부분의 source ID를 기록한다')
 .replaceAll('실제 사용한 부분을 그대로 짧게 인용한다','실제 사용한 부분의 source ID를 기록한다')
 .replaceAll('원문을 그대로 인용한다','source ID를 기록하고 인용문은 표시용으로 쓴다')
 .replaceAll('해당 목표를 정확히 짧게 인용한다','해당 목표 source ID를 고르고 인용문은 표시용으로 쓴다')
 .replace('targets의 target_statement_id는 원문의 실제 독립 보기/소문항 라벨(예: ㄱ, ⑤, (1)) 또는 단일 목표 main이다.','targets의 target_statement_id는 source_registry.targets에서 제공한 ID다.');
prompt+='\n\n# source ID 계약 (최종 권한)\n'+
 '제공된 source_registry 안의 ID만 사용한다. approved_route_id와 target_statement_id는 제공된 ID를 그대로 선택한다. 발견 id는 route 안에서 고유하게 붙인다. 먼저 critical_discoveries에 실제 발견을 선언한다. targets의 conclusion_discovery_id는 그 목록에서 같은 target_statement_id를 가진 실제 마지막 발견의 id를 그대로 선택한다. 참조 전용 새 ID를 만들지 않는다. 입력 target_conclusion_relations의 collection과 match_target_statement_id 및 match_approved_route_id 관계를 지킨다. targets에는 conclusion_ids 배열 대신 conclusion_discovery_id 하나를 기록한다. 보기 ID는 발견 ID가 아니다.\n'+
 '각 발견에 basis_step_ids, source_span_ids 및 역할에 맞는 shared_premise_ids/optional_explanation_ids/answer_aggregation_ids를 기록한다. 해당 없는 역할 참조는 빈 배열이다. source manifest의 allowed_roles와 allowed_target_ids를 지킨다. targets에는 source_span_id도 기록한다.\n'+
 'basis_quote/source_quote/compression_basis_quote는 사람이 읽는 표시용이다. 문구 복제나 표현 동치성은 구조 검증 조건이 아니다. 승인된 압축이 있다면 compression_basis_step_ids로 원천 단계를 지정한다. 없으면 빈 배열이다.\n'+
 'source_manifest_hash는 모델 출력이 아닌 request-bound 시스템 필드다. 출력에 넣지 않는다. 시스템은 호출 전 고정한 question/revision/basis/source manifest 연결을 검증하고 결과에 저장한다. independent 보기의 답 모음은 수학적 합류가 아니다. shared premise 별칭은 원본 노드를 가리키고 작업량은0이다.\n'+
 '도구 이름만으로 승인 route를 제외하지 않는다. 실제 핵심 발견 우회로 제외된 경로는 입력의 승인 route eligibility에만 따른다.\n';
fs.writeFileSync(path.join(dir,'prompt.json'),JSON.stringify({instructions:prompt},null,2)+'\n');
const schema=require(path.join(dir,'schema.cjs')).modelSchema();
fs.writeFileSync(path.join(dir,'schema.json'),JSON.stringify(schema,null,2)+'\n');
const names=fs.readdirSync(dir).filter(n=>/\.(?:cjs|json)$/.test(n)&&n!=='candidate-versions.json').sort();
const hashes=Object.fromEntries(names.map(n=>[n,C.bytesHash(fs.readFileSync(path.join(dir,n)))]));
const versions={prompt_hash:hashes['prompt.json'],schema_hash:hashes['schema.json'],projection_hash:hashes['projection.cjs'],validator_hash:C.hash([hashes['validate.cjs'],hashes['references.cjs'],hashes['response-contract.cjs']]),scorer_hash:hashes['scorer.cjs'],source_builder_hash:hashes['source.cjs'],criteria_payload_hash:C.hash(hashes)};
fs.writeFileSync(path.join(dir,'candidate-versions.json'),JSON.stringify({status:'unfrozen_candidate',versions,files:hashes},null,2)+'\n');
console.log(JSON.stringify({status:'unfrozen_candidate',files:names.length,AIcalls:0}));
