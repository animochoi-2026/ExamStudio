# v1.2.1 데스크톱 적용 및 운영 전환

## 완료 상태

- 코드: 데스크톱 `2950603`, 서버 보호 검사 개선 `54aac72`.
- 설치: 이 PC의 문제공방 **0.4.54**, 표준 ZIP 업데이트. 3,978개 설치 파일이 ZIP과 일치하고 설치 전후 사용자 데이터 16,265개가 동일하다. 앱·업로드 대기열은 자동 실행하지 않았다.
- 운영: 배치 `0bf71658-c3a8-45dd-9721-9aa808c55b28`의 **1,266건을 한 트랜잭션으로 활성화**했다. DB 활성화 시각 필드는 2026-10-20 00:18:23 KST이며 트랜잭션 시작 시각이다. 커밋 후 별도 조회로 완료를 확인했다.
- 실제 AI 호출, 기존 문항 재평가, Computer Use, 운영 문제 본문·정답·해설·그림 수정: 모두 0.

## 역사적 예외와 출처 보존

| 보존 항목 | 결과 |
|---|---:|
| 일반 프롬프트 `90de3a53…` | 1,259건 |
| 출제 의도 프롬프트 `779f1adc…` | 7건 |
| 실제 평가 normalizer 6 | 1,201건 |
| 실제 평가 normalizer 7 | 65건 |
| 별도 승인 production review envelope | 14건 |

14건에는 원래 runner의 실패 13건·결과 미확인 1건을 그대로 넣고, 승인된 후속 결과를 별도 최종 결과로 연결했다. 검토 단계의 normalizer 7은 `validation_normalizer_version`에 별도 기록한다. 원래 평가 버전을 소급 변경하지 않았다.

`question_content_hash`, `original_evaluation_input_hash`, `reviewed_evaluation_input_hash`, 운영 `source_content_hash` 및 파일 해시를 구분했다. 로컬 교정 3건과 출제 의도 해석을 운영 본문에 복사하지 않았다. 원문 경고·해석·원래 호출·이전 실패 기록을 보존하며 난이도 평가 완료를 교사 검수 완료로 바꾸지 않았다.

고정 candidate manifest SHA256: `dfa9dbd325a7bfc84309271813b791d2bfb4ff918ee3589d3a919629fe324237`. 원본 3,770개 증거 해시를 다시 검사했고 준비 결과 SHA256도 변하지 않았다. 구형 bulk import는 사용하지 않았다.

## 신규 데스크톱 평가

새 문항은 공통 출제 의도 프롬프트와 `v121-normalizer-7`만 사용한다. Luna medium → GPT 6.1 Sol medium → GPT 6.1 Sol high 순서이며, 유효한 T2 이하만 1단계에서 확정한다. 확정된 호출 실패는 다음 단계로 넘기고 결과 미확인·타임아웃은 중복 호출하지 않는다. 3단계 실패는 null/failed로 저장하며 과거 점수로 대체하지 않는다.

문제풀이 모델 설정은 변경하지 않았다. 내용·그림·정답·정책이 같은 경우 파일명이나 새 ID만 달라져도 저장 평가를 재사용한다. 재연결 출처와 이전 로컬 난이도는 보존한다. UI 디자인과 새 확인 게이트를 추가하지 않았다. 향후 교사 점수 조정은 유지한다.

## 운영 검증

- 활성 결과 1,266건, 점수/등급 누락 0, 중복 활성 0, spec/model policy 불일치 0.
- 최종 저장 결과·표시 점수 불일치 0, 파생 집계 대상 1,266건·점수 불일치 0, 미처리 집계 0.
- 대상의 과거 자동 점수와 수동 override 활성 필드는 제거했고 복구 스냅샷에 보존했다. 이후 교사 조정은 기존 기능으로 가능하다.
- 실제 로그인 세션의 검색 API: 하 715, 중 550, 상 1, 킬러 1(상에 포함), 미평가 0. 홈 API와 동일하다. 임계값은 바꾸지 않았다.
- 운영 전체 원문/파일 해시와 난이도 외 메타데이터/검수 해시가 전환 전후 동일하다. 대상 밖 363개 과거·보관 기록 전체 해시도 동일하며 누락된 현재 문항은 0건이다.
- 기존 웹 배포 `e7f58c4`의 실제 app.js/출제 worker 해시와 v1.2.1 지원을 확인했다. 웹 재배포는 필요하지 않았다.

처음 두 전환은 120초 시간 초과로 전부 롤백됐고 활성 0건·잔류 트랜잭션 0을 확인했다. 로그로 기존 revision 보호 트리거의 반복 JSON 탐색이 원인임을 확인했다. 문자열별 반복 탐색을 동일한 문자열 집합 차이 검사로 변경했고, 보호 잠금·파일 검사·권한·원본은 그대로 유지했다. 격리 비교에서 615ms → 53ms, 보관된 새 참조 및 실제 파일 차단을 검증한 뒤 전환에 성공했다. 불명 상태의 요청을 중복 실행하지 않았다.

적용 migration: `difficulty_v121_review_activation`(서버 20261019145645), `difficulty_v121_reference_scan`(서버 20261019151745). 전환/rollback 함수는 일반 회원이 호출할 수 없고, 준비 테이블 직접 조회도 불가하다. 구형 앱의 자동 점수 저장은 `difficulty_policy_upgrade_required`로 차단한다.

## 검증 범위와 복구

공통 회귀 84개 및 출력 계약 통과. 단계 라우팅·저장 결과 재사용·1,266건 원자적 전환/rollback·동시 검수 충돌·교사 조정·구형 저장 차단·보호 참조 검사를 격리 환경에서 수행했다. 실제 AI 요청과 앱 GUI/모바일 전수 검사는 수행하지 않았다. 추가 과거 정리 승인서 검사 1개는 이 checkout에 `tmp/approved-history-cleanup-20261003/approved-manifest.json`이 없어 ENOENT로 실패했으며, 기대값이나 검사를 변경하지 않았다. 해당 검사는 이번 평가/전환 자료를 사용하지 않는 과거 승인서 검사다.

보안 advisor의 [정책 없는 RLS 안내](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)는 비공개 준비/복구 테이블을 일반 회원에게 차단하기 위한 설정이다. [인증 사용자 SECURITY DEFINER 안내](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)는 회원/편집 권한을 검사하는 준비 RPC에 해당하며 활성화 권한은 별개다. 공개/일반 회원 활성화 권한이 없음을 DB에서 확인했다.

복구 자료: `artifacts/difficulty-v121/production-20261019/current-snapshot.json`, DB `bank_v121.activation_results.snapshot`, 설치 이전 파일 `production-20261019/install/backup`. 점수 rollback은 `bank_v121.rollback_reviewed`이며 이후 교사 수정이 있으면 자동 복구하지 않고 거절한다. 원본 평가 파일과 candidate manifest는 그대로 남아 있다.

상세 기계 검증 기록은 `release-records/difficulty-v121-production-20261020.json`과 `artifacts/difficulty-v121/production-20261019`에 있다.
