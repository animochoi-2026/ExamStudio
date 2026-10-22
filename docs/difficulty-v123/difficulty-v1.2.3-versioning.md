# v1.2.3 버전 분리

| 구분 | 버전 또는 hash |
|---|---|
| mathematical_criteria_hash | fa40bb4c535155df6b61ab27f91f7a8bd9a421b49d11f6f41b74997c68c75605 |
| mathematical_criteria_version | difficulty-v1.2.2-frozen |
| normalizer_version | explicit-alias-source-bound-r1 |
| output_budget_policy_version | provider-default-or-model-max-no-artificial-cap-r1 |
| persistence_policy_version | failure-envelope-v3 |
| projection_semantics_hash | 11f9f830e6a2dc681e0bac98a9c6616ade9625f5568b13c9785f5cbd7664c0ab |
| projection_semantics_version | m2-required-projection-r2 |
| recovery_policy_version | reviewed-provenance-v2 |
| routing_policy_version | luna-medium-sol-medium-structural-high-r4 |
| scorer_hash | 4721c5a5a6067eb905535cb2ba30df75bae6a31c149d0fd5d207924081eb9722 |
| scorer_version | m2-required-projection-r2 |
| source_relation_contract_version | difficulty-evidence-relation-r3 |
| spec_revision | difficulty-v1.2.3-rc1 |
| stage_authority_policy_version | earliest-valid-or-fresh-rescue-r2 |
| validator_version | source-bound-dag-v123-r1 |
| wire_contract_version | difficulty-wire-r4 |

공통 manifest hash: 4643246252e2e848db13268f9f7446016d57bd32d3ceebee4bb539296029aa80. 내부 보존된 수학 schema revision은 과거 결과와 같은 값을 유지하며 외부 계약 spec_revision과 구분한다. 평가 key에는 새 전송 계약 hash가 들어가므로 구형 요청/캐시를 새 호출로 위장하지 않는다. 과거 결과는 compatibility manifest를 통해서만 병합한다.
