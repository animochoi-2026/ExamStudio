# 직전대비 기출프린트 조회 지연 수정 — 2026-10-23

사용자: 범위와 학교를 선택한 후 시험지 목록 조회만 눌러도 시간 초과가 발생.

경로: past-print.js → 시험지별 bank_source_questions → bank_query.latest 및 bank_read_revision 반복. 기존 함수는 전체 후보마다 회원·읽기 권한을 중복 확인하고 큰 평가 메타데이터까지 정렬한다. 신구중 대표 원본 시험지 첫 페이지의 EXPLAIN ANALYZE 실행 시간 5809.576ms, 공유 버퍼 hit88047, 임시 블록197이었다.

수정: 요청에서 회원·보안 허용을 한 번 확인하고, committed/unarchived 조건 안에서 기존 bank_read_revision과 같은 actor/shared visibility 조건을 적용한다. 최신 가시 수정본은 ID만 정렬해 확정한 뒤 학년·원본·출처·페이지를 선택한다. 구형 수정본의 출처나 학년이 다시 나타나지 않도록 최신본 선택 전으로 필터를 이동하지 않는다. 응답 필드와 원문 번호 정렬·50개 페이지는 유지한다. 쿼리 시간 제한은 늘리지 않았다.

최소 검증:
- 수정 전후 대표 시험지 전체 JSON 내용/순서 일치. 수정본532.412ms, temp block0.
- rollback transaction에서 offset10/50/음수, 없는 출처, 다른 학년, 비회원·익명 거부 확인.
- 기존 기출프린트/원문 정렬 검사5개 통과.
- 운영 migration20261022213153 적용 후 3초 제한 안에서24문항 반환,771.301ms, 응답 MD5 f1e87c57d00d9b1dbbc4d42b85729dfc.
- 기존 anon 불가/authenticated 허용 유지. SECURITY DEFINER 알림은 기존 의도된 API이며 함수 안에서 회원·보안·가시성·학년을 검사한다.

서버 함수만 변경. 문항/평가/검수/시험지 데이터 수정0, AI0, Computer Use0. 웹 및 설치 앱은 기존 배포 유지. 실제 사용자 선택 조건과 휴대폰 클릭은 재현하지 않았으며 위 수치는 대표 운영 자료의 DB 실측이다. 배포/공통 기준 기록: release-records/source-query-performance-20261023.json.
