# 난이도 표시 매핑 적용 및 최소 점검 (2026-10-20)

코드 통합·자동 검사·서버/웹 배포·데스크톱 0.4.55 설치를 완료했다. 기존 평가 1,266건의 점수·티어·원시 응답을 변경하지 않았다.

1. **기존 매핑**: 숫자 점수 ≤3=하, <8=중, ≥8=상에 ≥9 킬러를 중복 집계했다. T3 86건이 중으로 표시되어 하715/중550/상1/킬러1이었다.
2. **공통 구현**: `app/difficulty-display-map.json`, `app/difficulty-display.cjs`를 공통 원본으로 사용한다. SQL `bank_v121.display_band`의 전체 티어 대응은 같은 원본과 비교 검사한다. `bank_v121.projection`, `bank_summary.row_difficulty/fact/composition/stats_section`, `bank_grade.home`, `bank_difficulty_band`, `bank_search_page`, `bank_question_page`, `bank_public_summary`, `bank_replacement_candidates`를 연결했다. 분류용 facts/buckets/statistics/home만 갱신했다.
3. **적용 메뉴**: 홈/문항찾기/검수 필터, 일반 시험지·실전모의고사 4분류 비중과 선택, 대체·보충 후보, 저장 시험지·요약 통계, 데스크톱 표시와 필터. 새 저장 시험지는 점수와 티어 스냅샷을 함께 보존한다. 숫자만 있는 과거 시험지는 별도 호환 경로다. 실제 GUI 클릭 검사는 하지 않았다.
4. **운영 API 결과**: 하715 · 중464 · 상86 · 킬러1. 홈·검색·목록·학교별 통계 합산이 일치한다.
5. **합계·중복·페이지**: 합계1,266, 고유 question/revision 각각1,266, 활성 매핑/호환 경로 불일치0. T3/T4 상과 T5 킬러는 배타적이다. 실제 두 목록 RPC의 각 분류 전체 count와 첫 페이지, 상 offset0/20/80의20/20/6개를 검증했다. 초기 전체 API 페이지 순회는 statement timeout 1회로 중단되어, 요청한 최소 count/경계 페이지 검사로 확인했다. 해당 재확인에서 오류·표본 중복은0이다.
6. **원시 티어**: T0=715, T1=0, T2=464, T3=86, T4=0, T5=1.
7. **T3 라우팅**: 일반 평가85건은 stage2 gpt-6.1-sol/medium83건, stage3 gpt-6.1-sol/high2건이다. 승인 review envelope1건은 stage2 gpt-6.1-sol/medium이다. stage1 확정0건.
8. **승급**: assembly0, literacy1, execution0, 중첩0, base T3+승급0, base T4=0, base T5=1. 유일한 literacy 승급은 기본 T5에서 상한 T5를 유지했다.
9. **원시 JSON 재계산**: canonical v1.2.1 scorer로1,266건을 읽기 전용 재생했다. score/tier/base/promotions/selected route/입력 검증/버전/승급 반영/라우팅 불일치 모두0건. 로컬 원시 결과와 운영 활성 집합 MD5는 `7e6ace34d098839f0e67e5bcc5d09479`로 동일하다.
10. **지정 앵커**: 아래8개 교재 기준 번호는 활성 학교기출1,266건의 저장 출처 식별자에 없다. 새 평가하지 않았다.
11. **T1·T4 부재**: 저장·라우팅·승급·계산 연결 오류가 발견되지 않았다. 현재 저장 결과의 분포로 유지한다. 이 결과만으로 모델 정책의 적정성을 추가 단정하지 않는다.
12. **데이터 보존**: 전체1,629개 카탈로그 해시 `a96dfb6bb8e2e977f290880c832050c5`, 대상1,266개 카탈로그 해시 `35de79f04dcd1861133dccbf35e9888b`가 전후 동일하다. final_score/tier, 본문/정답/해설/그림, 교사 검수, prompt/normalizer/review envelope, 원래 실패 기록·복구 스냅샷·candidate manifest는 변경하지 않았다. 스코어러/임계값 파일 변경 없음.
13. **AI 호출**:0회, 재평가0건. 저장 원시 JSON의 로컬 계산만 수행했다.
14. **Computer Use·브라우저 자동화**:0회. 기존 로그인 저장소를 이용한 읽기 전용 API 검사에 창 없는 Electron 프로세스만 사용했다. 앱 GUI/실제 시험지 생성 클릭은 미실시다.
15. **적용 버전**: 웹 `df50be46` / source `bfd839dc46f8c974477e0ade63043319e0600b1b`, 운영544자산·배포 변경3자산 해시 확인. 서버 한정 migration `20261019164955_difficulty_tier_display_mapping` (로컬 파일20261019163333), 전체 db push/repair 없음. 데스크톱0.4.55 / source `7fd52eb3e527b73d5fcba1469485c6ab5f40eb10`, 표준 ZIP 설치 3,980파일 일치, 사용자 자료 16,265파일 무변경. 공통87검사·보충4검사·출력 계약 통과.
16. **별도 점수 수정·승인 필요 사항**:없음. 청담/신구 원문3건 교정은 이 작업에서 하지 않았다.

| 기준 번호 | 활성 포함 | score | tier | base | promotions | stage | model | scorer | review |
|---|---|---|---|---|---|---|---|---|---|
| 1417 | 대상에 없음 | — | — | — | — | — | — | — | — |
| 1420 | 대상에 없음 | — | — | — | — | — | — | — | — |
| 1421 | 대상에 없음 | — | — | — | — | — | — | — | — |
| 1425 | 대상에 없음 | — | — | — | — | — | — | — | — |
| 1484 | 대상에 없음 | — | — | — | — | — | — | — | — |
| 1500 | 대상에 없음 | — | — | — | — | — | — | — | — |
| 1501 | 대상에 없음 | — | — | — | — | — | — | — | — |
| 1505 | 대상에 없음 | — | — | — | — | — | — | — | — |

## 증거와 복구

`artifacts/difficulty-v121/mapping-20261020/`의 audit.json(문항별 상세), before-db.json/after-db.json, api-verification.json, web-verification.json, installed-verification.json, 검사 로그를 보관한다. 기계 요약은 `release-records/difficulty-tier-mapping-20261020.json`이다. 원래 서버 함수 정의를 모은 `rollback-display-only.sql`은 복구 준비용이며 실행하지 않았다. 설치 전 앱은 표준 업데이트의 install/backup에 보관한다. 복구도 점수/원문을 수정하지 않는 표시 코드·캐시 범위다.
