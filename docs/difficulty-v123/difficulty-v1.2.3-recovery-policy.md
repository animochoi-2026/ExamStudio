# v1.2.3 저장 응답 복구와 단계 권위

1. 기존 정상 1,215건은 byte 그대로 successor에 복사한다. 이미 정상인 문항에 새 AI 호출은 없다.
2. exact-compatible historical 성공은 raw·validation·score·tier·promotions 재생 후 채택한다. 과거 점수 fallback이 아니다.
3. alias registry는 question/revision/content/image/basis/route/source/scorer/projection 및 raw/정규화 전후 hash에 묶는다. 등록되지 않은 mapping, fuzzy matching, role 변경, node 삭제·추가, 축·depends_on·work 변경은 거부한다.
4. 과거 S2의 완성 응답에서 기술적 alias만 복구하고 수학적 graph 요소가 모두 불변이면 S2를 채택한다. 이 때문에 불필요하게 실행된 과거 S3는 대안으로 보존한다.
5. 같은 score/tier라도 projection·promotions·workload가 다르면 earliest라는 이유만으로 채택하지 않는다. 이번 해당 4건은 새 explicit 평가로 처리했다.
6. 새 valid rescue는 새 결과로 채택하되 과거 S2/S3를 지우지 않는다. 평균·최댓값·최신 stage 선택으로 충돌을 해결하지 않는다.
7. 불명 결과는 자동 재호출하지 않는다. 경원중 20번은 call_saved 부재 조건을 만족하지 않아 미확인으로 남는다. 언북중 8번은 실제 완성 raw를 발견하고 alias만 복구해 호출 없이 채택했다.
8. staging 병합은 같은 question+revision을 정확히 한 번만 포함한다. 후보는 운영 활성화 승인이 아니다.

현재 exact alias registry는 기존 29건 + 이번 12건 = 41건이다. 동일 basis 문단의 다른 연산을 같은 결과로 합치지 않았고 복구 전후 hash 및 변조 거부를 검사했다.

이번 결과: 정상 1251, 실패 0, 미확인 1. 추가 복구 36건. 상세 근거: C:\Users\reals\.codex\worktrees\difficulty-v123-max-recovery\문제생성기\artifacts\integrated-staging-max-recovery-20261022-0ee4033d5d27.
