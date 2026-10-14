# Native PDF pipeline

The four web workflows use `native-pdf.js` to serialize the measured pages once.
Text, KaTeX and SVG remain native; original raster illustrations remain images.
Noto Sans KR regular/bold and KaTeX fonts are embedded as data resources. The
renderer blocks external requests and checks prepared fonts, images, page geometry
and per-question watermark positions. There is no full-page raster fallback.

`bank-native-pdf` validates the current account and delegates to the service-only
`bank_native_pdf_service`. Private slots are isolated by account, parent, variant,
section and answer mode. The signature includes document output settings, source
revision content/files, renderer version and watermark identifier. Parent access,
grade, expiry and the official download authorization are checked on every request.

The server reserves a pending object under a locked slot. Generation leases expire
after ten minutes. A verified R2 upload becomes active atomically; older objects
enter retryable cleanup. Parent deletion/archive/expiry invalidates slots, and the
minute cleanup job removes only keys in the native-pdf namespace. No original
question object is part of this cleanup. Existing v1 PDFs remain available to old
clients during the lazy migration.

The private Cloudflare renderer uses one Durable Object to serialize browser work
and reconnect to its own browser session. Each document uses a fresh isolated
browser context, closed after output. This avoids new-browser rate limits and
cross-user state. The idle session expires after sixty seconds. No HTML or PDF is
stored in the Durable Object; only the renderer session ID is retained.

Public web deployment remains `canonical-release.cjs deploy`. The separate private
backend deploy entry is `deploy-pdf-renderer.cjs`, which enforces the same baseline,
unchanged contracts, common tests, production asset check and shared release lock.
Its secret is server-side only. Apply only the two new PDF migrations, not db push.

Desktop output was already native Chromium PDF. Its new cache uses the same R2
gateway and account isolation, with a signature over selected questions, settings
and actual referenced file bytes. Unauthenticated local projects still use local
native output; they cannot store private PDFs in an authenticated cloud cache.
DOCX/HWPX retain their existing measurement and export contracts.

Validation evidence and production status are recorded separately in the release
record when deployment has been verified. Physical printer output is not implied
by PDF generation or browser tests.

## 2026-10-14 운영 반영·검증 보고

### 적용 상태

- 웹: `9363e05`, Pages `f683244e`. 배포 주소와 운영 주소의 자산 각각 342개 해시 일치.
- 서버 브라우저: Cloudflare Worker `57c696da-d171-4de0-bb8f-ce8fbca1726c`, 소스 `c8e7c0b`. 인증 없는 호출 403 확인.
- PDF API: Supabase `bank-native-pdf` v1. 실제 운영 계정으로 생성·저장·재사용 확인.
- 데스크톱: `057994ee97da4a516d28b6e55452b264315dabce`, 0.4.39. 정식 ZIP 업데이트 경로로 설치. 패키지 파일 3,928개 일치, 사용자 데이터 5,649개 해시 불변. 앱·대기열 자동 재시작 없음.
- 초대 화면: 앞서 이메일 입력·메일 발송 선택을 제거한 링크 전용 초대를 그대로 포함한다. 가입자의 이메일 인증과 프로필 입력은 유지한다.
- GitHub 릴리스 게시와 기존 Codex 클라우드 작업 갱신은 이번 PDF 반영에 포함하지 않았다.

### 원인·수정 영역

기존 웹 `web-bank/web-export.js`의 페이지 캔버스→PDF 삽입 경로가 글자·수식까지 이미지로 만들었다. 새 기본 PDF 경로는 Chromium 인쇄이며 전체 페이지 이미지 대체 경로로 조용히 되돌아가지 않는다. 원래 이미지인 스캔·삽화만 이미지로 남긴다. 데스크톱 `app/pdf-export.cjs`는 이미 Chromium 출력이어서 렌더러를 교체하지 않고 인증된 저장 PDF 재사용을 연결했다.

| 영역 | 주요 파일 | 변경 |
|---|---|---|
| 공통 출력 | `web-bank/native-pdf.js`, `web-export.js` | 배치된 문서 1회 직렬화, 폰트·이미지·수식·기하 검사, 텍스트/SVG 유지 |
| 저장·재다운로드 | `native-pdf-cache.js`, `saved-pdf.js`, `exam-library.js` | 최신 파일 확인을 배치 준비보다 먼저 실행, 같은 파일 열기·인쇄 |
| 네 기능 연결 | `exam-editor.js`, `mock-exams.js`, `past-print.js`, `past-print-render.js`, `app.js` | 문제지·빠른정답·상세풀이·저장 자료 경로 연결 |
| 준비 최적화 | `print-prefetch.js` | 최대 4개 동시 조회, 원래 문제 순서 보존, 실패·취소 중 조회 정리 |
| 글꼴·폼 | `exam-form.js`, `style.css`, `runtime/noto-sans-kr/` | 승인한 Noto Sans KR 및 KaTeX 내장, SVG 폼의 글꼴 준비 |
| 서버 | `services/pdf-renderer/`, `supabase/functions/_shared/native-pdf.mjs` | 격리 브라우저, PDF 객체 스트림 압축, 검증된 R2 파일 저장 |
| 데스크톱 | `app/native-pdf-cache.cjs`, `bank-main.cjs`, `main.cjs` | 저장·미리보기 모두 캐시, PDF만 출력할 때 중복 측정 제거 |

폰트는 Chromium의 서브셋을 사용한다. 사진·스캔을 포함한 모든 요소를 일괄 JPEG로 바꾸거나 저해상도로 낮추지 않는다. 원래의 작은 이미지와 SVG 도형을 유지한다. 별도 고비용 압축 도구는 추가하지 않았다. 기존 캔버스 보조 기능은 다른 용도로 남아 있으나 기본 PDF 생성 경로에서는 사용하지 않는다. DOCX/HWPX 출력 계약은 변경하지 않았다.

### DB·R2·보안

이번 신규 SQL 두 개만 적용했다. 로컬 파일명과 실제 원격 버전은 각각 `20261014081620_native_pdf_cache.sql`, `20261014081735_paper_retention_schedule_native_pdf.sql`로 일치한다. 전체 db push 및 과거 이력 repair는 하지 않았다.

- 비공개 `bank_ops.native_pdf_slots`, `native_pdf_objects`, `native_pdf_renderer_config` 추가. 일반 계정의 직접 테이블 접근을 열지 않았다.
- `bank_native_pdf_service` 실행 권한 실측: anon 불가, authenticated 불가, service_role 가능. Edge API는 사용자 인증과 현재 부모 시험지 권한을 검사한다.
- 저장 위치: 기존 R2 버킷 내 `<space>/native-pdf/<slot>/<uuid>.pdf`. 공개 고정 URL을 제공하지 않는다. 다운로드마다 권한·학년·만료·기존 다운로드 승인 확인 후 짧은 유효기간의 주소를 제공한다.
- 슬롯은 사용자·부모 시험지·변형·문제/답지·답안 모드로 분리한다. 서명에는 실제 출력 데이터, 문제 revision/파일, 순서·배점·제목·폼·출력 설정·생성기 버전·워터마크 식별자가 들어간다. 단순 열람 시간은 제외한다.
- 생성 중 슬롯 잠금과 10분 임대, 클라이언트 중복 요청 공유를 사용한다. 실패·임대 만료 후 재시도 가능하다.
- 새 객체를 먼저 완전히 올리고 크기·체크섬을 검증한 뒤 DB의 활성 파일 포인터를 원자적으로 바꾼다. 이전 파일은 재시도 가능한 정리 대상으로 전환한다. 생성 실패 시 오래된 파일을 최신이라고 제공하지 않는다.
- 1분 주기 `examstudio-native-pdf-cleanup` 작업으로 교체·삭제·만료된 객체를 정리한다. R2 삭제 및 404 확인 후 메타데이터를 정리한다. 원본 문제 파일은 대상이 아니다.
- 기존 PDF는 구형 클라이언트 호환을 위해 즉시 일괄 삭제하지 않았다. 새 방식은 다운로드할 때 전환한다.

격리 SQL 테스트에서 다른 그룹 차단·같은 그룹 허용·개인별 워터마크 분리·수정 무효화·실패 원자성·부모 삭제/만료·원본 보존을 검증했다. 운영에서는 실제 인증 다운로드, 동시 요청 1회 생성, 임시 테스트 PDF 삭제 후 R2/메타데이터 정리를 확인했다. 실사용 회원 그룹을 바꾸거나 다른 회원의 시험지를 삭제해 시험하지 않았다. 운영의 여러 실제 그룹 계정 전체 조합 검증은 미확인이다.

### 기능별 적용과 검증 구분

| 기능 | 문제지·빠른정답·상세풀이 | 최초/수정 후 생성 | 저장 PDF 재사용·열기/인쇄 | 실제 검증 |
|---|---|---|---|---|
| 일반 시험지 | 공통 새 경로 적용 | 적용 | 적용 | 합성 폼 출력 및 실제 저장 25문항 자료 문제/상세풀이 생성·재사용 |
| 실전모의고사 | 공통 새 경로 적용 | 적용 | 그룹 권한 확인 후 적용 | 합성 출제 흐름 24개 PDF, SQL 권한/서명 검사. 현재 운영 모의고사 레코드가 없어 실제 그룹 회차 재다운로드는 미확인 |
| 기출복원 | 공통 새 경로 적용 | 적용 | 적용 | 합성 복원 텍스트/이미지 출력. 실사용 복원 자료 전체 생성·저장·재열기 흐름은 미확인 |
| 직전대비 프린트 | 공통 새 경로 적용 | 적용 | 적용 | 실제 청담중 60문항, 운영 PC/모바일 화면 다운로드·PDF 열기 확인 |

네 기능 × PC/모바일 폭 × 기본/모의고사/대표 사용자 폼 × 문제/답지 × 빠른/상세 모드를 조합한 실제 PDF 96개를 검사했다. 두 내장 폼과 대표 사용자 폼은 검사했지만 모든 회원의 임의 사용자 폼을 전수 검사한 것은 아니다. 문제 교체·순서·배점·폼·해설 변화의 서명 무효화는 자동 검사, 실제 데스크톱 제목 변경 후 1회 재생성은 운영 R2 경로로 확인했다. 실사용 문제를 임의 교체해서 저장하지 않았다.

### 성능: 청담중 표본과 추가 저장 시험지

MB는 1,000,000바이트다. 동일 PC의 기존 실측 기록과 새 출력 비교이며 네트워크 상태는 시점에 따라 달라질 수 있다.

| 기능·문서 | 페이지 | 기존 용량 | 새 용량 | 감소율 | 기존 총 생성 | 새 총 생성 | 재다운로드 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 청담중 기출프린트 문제지 | 19→19 | 6.881MB | 0.979MB | 85.8% | 91.238초 | 28.327초 | 1.782초 |
| 청담중 기출프린트 상세풀이 | 34→34 | 21.186MB | 0.920MB | 95.7% | 185.929초 | 49.183초 | 1.732초 |
| 일반 저장 시험지 25문항 문제지 | 7 | 미측정 | 0.379MB | 미측정 | 미측정 | 26.160초 | 1.675초 |
| 일반 저장 시험지 25문항 상세풀이 | 13 | 미측정 | 0.391MB | 미측정 | 미측정 | 29.816초 | 2.832초 |
| 실전모의고사·기출복원 합성 자료 | 폼별 상이 | 미측정 | 개별 결과 파일 참조 | 미측정 | 미측정 | 동등 조건 전후 비교 미측정 | 실제 운영 부모 자료 미확인 |

청담중 두 번째 요청은 문제 조회 0회, PDF render 요청 0회이며 최초 파일과 SHA256이 같다. 최종 운영 URL의 PC·모바일 크기에서 재측정한 캐시 응답도 약 1.3~2.7초였다. PDF 열기·인쇄 버튼은 같은 저장 파일의 브라우저 PDF 뷰어를 열었다.

### 단계별 측정

아래 수치는 서로 다른 진단 실행이다. 서로 합쳐 운영 총시간이라고 계산하지 않는다.

| 준비 단계: 청담중 읽기 전용 재측정 | 시간 |
|---|---:|
| 문제·해설 데이터 조회 | 8.077초 |
| 문제 DOM 구성·폰트/이미지 측정 | 0.413초 |
| 페이지 배치 | 0.012초 |
| 답지 DOM·페이지 준비 | 2.528초 |
| 준비 내부 총시간 / UI 전체 준비 | 12.454초 / 13.290초 |

| 변환 단계 | 로컬 문제지 | 로컬 상세풀이 | Cloudflare 문제지 | Cloudflare 상세풀이 |
|---|---:|---:|---:|---:|
| HTML 구성·브라우저 로드 | 1.276초 | 1.131초 | 6.292초 | 3.712초 |
| 자원 준비 확인 | 0.108초 | 0.335초 | 0.188초 | 0.310초 |
| PDF 변환 | 1.631초 | 4.013초 | 4.021초 | 6.187초 |
| 객체 후처리 | 0.535초 | 0.405초 | 0.358초 | 0.654초 |

클라이언트 직렬화는 별도 로컬 측정에서 문제지 2.086초, 답지 0.964초였다. 운영 업로드 시간·첫 응답 대기시간을 각각 분리한 최초 실행 로그는 없어 미확인이다. 최초 생성의 남은 시간은 데이터/네트워크·브라우저 로드·변환에 있으며 재다운로드는 이를 생략한다.

같은 PC PDFium 3회 중앙값: 문제지 첫 내용 페이지 렌더 61.96→17.51ms, 전체 렌더 1149.38→225.36ms. 상세풀이 첫 페이지 61.74→19.27ms, 전체 2126.41→498.85ms. 파일 메타데이터 열기는 양쪽 모두 약 1~2ms여서 이를 큰 속도 개선으로 주장하지 않는다. 이 수치는 브라우저 인쇄 대화상자나 프린터 속도가 아니다.

### 품질·재사용·검사 증거

- 청담중 문제지 19쪽/상세풀이 34쪽 유지. 60문항 워터마크 각 60개. 모든 페이지 축소판과 대표 고해상도 페이지를 확인했다. 문제지에는 원본 작은 이미지 5개, 상세풀이에는 래스터 이미지 0개다. 전체 페이지 이미지가 없다.
- 한글·KaTeX 글꼴 내장, 텍스트 추출 확인. 분수·루트·첨자·행렬·정렬식·도형·표·스캔·SVG 그래프를 합성 폼에서 확인했다. 원래 없는 그림을 재생성하지 않았다. Noto 전환으로 맑은 고딕과 글자 모양 자체는 다르다.
- PC 웹 및 모바일 에뮬레이션에서 실제 포인터로 PDF 다운로드/열기. 하단 내비게이션에 버튼 가림 없음. 실제 휴대전화 하드웨어 검증은 미확인.
- 데스크톱 실제 인증 캐시: 최초 2.524초, 반복 1.432초로 생성 횟수 1 유지. 제목 변경 1.924초로 생성 횟수 2. 동시 두 요청도 한 번만 생성하고 같은 SHA256 수신.
- 공통 검사 84개와 신규 테스트 5개 통과. 데스크톱 미리보기 PDF와 저장 PDF의 페이지/텍스트 위치 일치 검사 통과.
- 별도 기존 `desktop-pagination-font.cjs`는 이름 머리말 y=812.67에 대해 y≤810을 요구하는 검사에서 실패했다. 공식 기준 `59403bf`에서도 동일하게 재현됐다. PDF는 A4 높이 842 안에 있고 미리보기/저장 위치는 같다. 기대값을 완화하거나 이 기존 실패를 통과로 보고하지 않았다. 그 뒤의 UI 단계는 이 검사에서 실행되지 않았다.
- 시험용 PDF 슬롯 2건은 정리 작업으로 제거되고 객체 메타데이터 0건 확인. 정상 저장 사용자 PDF 4건은 유지. 부모 삭제·6개월 만료의 전체 DB/R2 연계는 격리 테스트로 확인했으며 실사용 부모 삭제 실험은 하지 않았다.

증거 폴더: `C:/Users/reals/.codex/worktrees/pdf-pipeline-20261014/artifacts/pdf-pipeline/`.
주요 파일: `live-cache-results.json`, `live-inspection.json`, `preparation-phases.json`, `native-results.json`, `cloud-results.json`, `pdf-view-results.json`, `forms-results.json`, `forms-detailed-results.json`, `mock-pdf-results.json`, `past-forms-results.json`, `production-desktop-results.json`, `production-mobile-results.json`, `desktop-install-result.json`, `desktop-preview-parity-baseline.txt`.

### 무변경 확인·남은 한계

원본 문제·원본 기출·회원·그룹·문제 순서·배점·교체 기록·모의고사 중복 기록·과거 마이그레이션 이력은 변경하지 않았다. 기존 권한과 다운로드 보안 검사를 재사용한다. PDF 전용 새 데이터와 테스트 파일만 생성·정리했다. R2 전체 업로드, 과거 PDF 일괄 변환, 유료 AI 호출은 하지 않았다.

PDF 생성 및 PDFium 렌더 성능은 확인했다. 브라우저 PDF 뷰어 열기는 확인했지만 인쇄 미리보기 준비시간·스풀 시간·가상 프린터 시간은 미확인이다. 실제 프린터 출력 속도와 종이 품질, 흑백/컬러 종이 출력은 미확인이다. 서버 동시 사용자 대규모 부하, 모든 외부 PDF 뷰어, 모든 사용자 폼도 미확인이다. 서버 브라우저 작업은 직렬화되어 혼잡할 때 대기할 수 있다.

로그인하지 않은 로컬 프로젝트는 기존 로컬 네이티브 PDF를 사용하며 R2 재사용 대상이 아니다. npm 감사에서 기존 sharp 및 brace-expansion 경고가 남아 있으며 이번 출력 수정으로 관련 없는 의존성을 강제 업그레이드하지 않았다.
