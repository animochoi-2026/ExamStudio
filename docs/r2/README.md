> 최신 후속 검증/후보/장애물: [readiness-20261010.md](readiness-20261010.md). 아래 기록은 이전 실행 결과를 포함합니다.

# 문제공방 R2 이전 준비 및 실행 절차

2026년 10월 10일 사전 준비본. 운영 기본값은 Supabase이며 DB와 로그인은 계속 Supabase를 사용한다. 이 문서의 복사·SQL 적용·설정 전환·배포 명령은 **오늘 밤 별도 승인 후** 실행한다. 이번 작업에서는 운영 파일 내용을 내려받거나 복사하지 않았고, 운영 SQL·설정·배포·삭제를 실행하지 않았다.

후보 작업 폴더는 `C:\Users\reals\.codex\worktrees\r2-storage-preparation\문제생성기`, 브랜치는 `codex/r2-storage-preparation`이다. 기존 작업 폴더의 당시 미커밋 변경도 기반으로 보존한 사본이다. 전체 diff를 무조건 병합하지 말고 [변경 파일 목록](modified-files.json)의 R2 변경을 기준으로 통합한다. 기본 브랜치 병합, push, PR 생성은 실행하지 않았다.

최신 실제 실행 결과와 현재 인증 장애물은 [계정 설정 진행 기록](setup-status.md)을 먼저 확인한다. 아래 최초 조사 수치는 과거 관측값이며 최종 이전 목록이 아니다.

## 확인된 현재 구조

| 항목 | 확인 결과 |
| --- | --- |
| 웹 | 바닐라 JavaScript, Supabase JS, esbuild, KaTeX. Cloudflare Pages 정적 배포 |
| 실제 사이트 | https://examstudio-shared-bank.pages.dev/ 에서 HTTP 200 및 `server: cloudflare` 확인 |
| 실제 웹 설정 | Supabase 프로젝트 `bjxxqdbftefughjkcrqj`, 기존 공개 설정 필드는 url·spaceId·publishableKey |
| DB와 인증 | Supabase PostgreSQL 17, Google 로그인과 Auth JWT, DB RLS 및 개별 권한 RPC |
| 파일 서버 | Supabase Storage 비공개 `question-bank` 버킷, 조각당 최대 6,291,456 bytes |
| 객체 경로 | `space_id/file_id/000`, `001` 등. 원래 PDF·이미지 이름은 DB `bank_entries.name`과 파일 descriptor에 보존 |
| 데스크톱 | Electron 44.3.0, Node.js CJS. `SharedBankStorage`가 파일 전송과 SHA-256·MD5 검증 수행 |
| 서버 실행 | Supabase Edge Functions의 Deno 런타임. Pages에는 현재 별도 Node 서버가 없음 |
| 운영 Edge Functions | bank-verify v5, bank-delete-question v2, bank-image-transition v2, bank-invite-mail v1 확인 |
| 웹 배포 작업 | `.github/workflows/deploy-pages.yml` 수동 실행, 기본 deploy=false. 준비 브랜치에는 v0.4.21 고정 ZIP. 19시대 갱신된 원격 main은 web-mock-recovery-20261010 고정 ZIP. 두 경로 모두 이번 R2 배포에 사용하지 않음 |

2026-10-10 **19:24:20 KST 재조회** 읽기 전용 집계: 물리 객체 **2,463개 / 830,696,517 bytes**. 크기 미상 0개, 경로 형식 불일치 0개, 최대 조각 6 MiB. 모두 `application/octet-stream`이며 사용자 지정 객체 메타데이터는 0개였다. 밤의 확정 목록은 다시 만들어야 한다. DB 파일 2,418개와 물리 조각 2,463개는 서로 다른 집계다.

| DB 역할 | 논리 파일 수 | 논리 bytes |
| --- | ---: | ---: |
| asset | 438 | 578211833 |
| commit | 544 | 13468855 |
| data | 544 | 43129161 |
| docx | 436 | 52119776 |
| preview | 436 | 8661041 |
| source | 20 | 135105851 |

최초 조사 때(18시대) 운영 app.js SHA-256은 `0b9bd71b7bea662f843da06de786ceb4f70b22f650bff07fdbbb2fcef599f485`였다. 현재 운영 파일과 저장소의 과거 배포 manifest가 같다고 가정하면 안 된다.

## 파일 참조와 권한

DB에는 파일 ID, size, sha256, md5, chunks, props, revision 관계를 저장한다. `app/bank-model.cjs`는 로컬 자산 경로를 `bank-asset:<key>`로 치환하며, native JSON의 descriptor가 실제 파일 ID와 연결된다. R2 객체 이름도 기존 조각 경로 그대로 사용한다. 만료 URL은 메모리에서 다운로드할 때만 사용하며 DB에 저장하지 않는다.

읽기 전용으로 전체 `bank_entries`, `bank_catalog`, `bank_exam_drafts`, `bank_exam_history`, `bank_mock_exams` JSON을 검사한 결과 Supabase Storage URL 또는 r2.dev 참조는 0건이었다. 파일로 저장된 native JSON·commit 자체는 이번에 다운로드하지 않았다. 복사·검증 시 내용 스캔에서 저장소 URL이 발견되면 `EMBEDDED_STORAGE_URL_REVIEW_REQUIRED`로 전환을 막는다. 이러한 예외는 백업 후 별도 참조 변경안을 검토해야 하며 자동 문자열 치환하지 않는다.

공개 버킷이 아니다. 단순 로그인만으로 읽을 수 없다. `bank_object_allowed` → `bank_read_entry` → `bank_read_revision`에서 활성 회원, 파일 소유자, 커밋 완료 여부, private/shared_pending/approved 상태, 보관 문항의 시험지 참조 권한을 확인한다. 쓰기는 해당 업로더의 미검증 파일에만 가능하다. 삭제는 owner 권한과 확정된 deletion/prune 작업 범위를 확인한다. 신규 gateway는 Auth 사용자 확인 뒤 **같은 호출자 JWT**로 이 판정을 다시 수행한다. R2 service 키로 권한 판정을 우회하지 않는다.

읽기 URL은 60초간 bearer capability로 동작하므로 권한 취소 반영에는 최대 그 기간의 여지가 있다. 페이지 캐시와 브라우저 파일 데이터는 기존처럼 로컬 메모리에만 남는다. CORS는 사용자·파일 권한을 부여하지 않는다.

## 조사 및 연결한 기능

| 기능 | 코드와 연결 방식 |
| --- | --- |
| 업로드·조각 복구·다운로드 | `app/shared-bank-storage.cjs` → gateway 선택 지원. 기존 SHA-256 검증·중복 충돌 동작 유지 |
| 웹 미리보기 | `web-bank/app.js`, `web-bank/file-storage.js` → 권한 확인 후 R2 GET → Blob |
| 문제 본문·문제 이미지·출제·인쇄 | `web-bank/question-renderer.js`의 공통 bytes 경로 → 시험지·PDF·DOCX 출력에서 사용 |
| 원본시험지·기존 학교 화면 | `web-bank/original-exams.js`와 app.js가 `bank_source_exams`, `bank_source_questions`, `bank_source_progress_get` RPC로 등록 자료 조회. 파일 버킷 목록을 학교 목록으로 사용하지 않음. 복원 시 공통 reader 이용 |
| 등록일·학교 연결·수정 이력 | DB와 descriptor를 변경하지 않음. R2 복사일은 등록일로 쓰지 않음 |
| 업로드 완료 검증 | `bank-verify`, `_shared/lossless-upload-server.mjs` → 동일 저장소 adapter로 조각 읽기 |
| 기존 이미지 변환 | 운영에서 내려받은 코드 `bank-image-transition`도 adapter 연결. 원래 로컬 체크아웃에는 없었음 |
| 문항 삭제 | `bank-delete-question` → R2에서 승인된 정확한 객체만 삭제 후 HEAD 404 확인·서버 전용 receipt 기록 |
| 수정 이력 payload 정리 | `app/revision-payload-prune.cjs` → gateway. 기존 승인 manifest·한도·토큰 유지 |
| 파일 수·용량 | `web-bank/usage-panel.js` → 관리자 RPC 확인 뒤 R2 경로 전체 페이지 집계. Supabase 보관 원본 용량도 따로 표시 |
| 백업·복원·유지보수 | bank-transfer, bank-maintenance, question-bank는 SharedBankStorage 사용. 동일 경로로 연결 |
| 사고 백업 스크립트 | `scripts/backup-incident-storage.cjs`는 Supabase 원본 전용으로 유지. R2 전환 후 일상 백업 도구로 오인하지 말 것 |

원격 main `3e9e389`의 새 `school-sources.js`도 읽기 확인했다. `bank_school_sources` RPC의 등록 정보와 `last_registered_at`으로 학교 목록·최근 등록순을 구성하며 PDF·문제 본문·이미지를 직접 요청하지 않는다. 해당 화면은 준비 체크아웃 생성 이후 main에 추가되었고 이번 후속 작업에서 최신 main 파일 변경을 후보에 통합하며 보존했다. 물리 복사 시간으로 정렬 키를 바꾸지 않는다.

## 계정 설정 및 자동화

R2 활성화, 비공개 Standard/APAC `examstudio-files-prep` 생성, CORS 적용, 버킷 제한 Object Read & Write 키의 DPAPI/GitHub 저장 및 실제 인공 파일 연결 시험을 완료했다. 실제 Chrome 미리보기·다운로드와 패키징 Electron reader 확인도 완료했다. 원본 CLI 인증, 격리 Supabase Auth/권한 통합 시험, 운영 검증 함수 소스 확인은 남아 있다. 최신 실제 상태는 [setup-status.md](setup-status.md)와 [validation.json](validation.json)을 기준으로 한다. 운영 설정은 변경하지 않았다.

자동 적용 권한이 없을 때만 버킷 **Settings → CORS policy → Add/Edit CORS policy**에서 [cors.json](cors.json)을 사용한다. Wrangler에는 별도 형식인 [cors-wrangler.json](cors-wrangler.json)을 사용해야 한다. 공식 도움말로 다음 형식을 확인했다. 현재는 CLI 권한이 제한되어 Dashboard로 실제 적용·재조회했으며 아래 명령을 다시 실행할 필요가 없다.

```powershell
# 참고용 CLI 형식. 현재 버킷은 이미 생성되어 있으므로 create를 다시 실행하지 않는다.
npx --yes wrangler@4.149.0 r2 bucket create examstudio-files-prep --storage-class Standard
npx --yes wrangler@4.149.0 r2 bucket cors set examstudio-files-prep --file docs/r2/cors-wrangler.json
npx --yes wrangler@4.149.0 r2 bucket cors list examstudio-files-prep
```

비공개 Standard와 r2.dev 비활성 상태를 재조회한다. 자동 삭제 규칙은 추가하지 않는다. 파일 접근 키는 대상 버킷 하나의 Object Read & Write로 제한한다. 버킷 관리 인증과 파일 키는 구분한다. [Cloudflare 인증 문서](https://developers.cloudflare.com/r2/api/tokens/) · [CORS 문서](https://developers.cloudflare.com/r2/buckets/cors/)

브라우저는 R2에 GET만 하고 업로드 POST는 Supabase Edge Function에 한다. 따라서 버킷 CORS는 GET·HEAD와 Range만 허용한다. Edge CORS는 POST·OPTIONS, authorization/apikey/content-type/x-client-info/x-bank-object를 허용한다. Pages CSP에도 R2 S3 endpoint 접속을 허용했다. 외부 R2로 Supabase JWT를 전달하지 않는다.

## 환경변수와 비밀 입력 위치

GitHub 위치는 저장소 **Settings → Environments → storage-migration**이다. 필수 승인자 `animochoi-2026`, main만 허용하는 branch 규칙을 실제 생성·재조회했다. MIGRATION_STATE_KEY/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY Secrets 및 SOURCE_MODE/SUPABASE_URL/R2_ENDPOINT/R2_BUCKET Variables 등록을 완료했다. R2 키는 준비 전용 1주 유효 기간이므로 운영 상시 키로 사용하지 않는다. 실제 서버는 **Supabase 프로젝트 → Edge Functions → Secrets**이다. Cloudflare Pages의 정적 빌드 환경에는 아래 비밀키를 넣지 않는다.

| 이름 | 확인 위치 또는 값 | Actions | 실제 웹 서버 또는 로컬 |
| --- | --- | --- | --- |
| `R2_ENDPOINT` | 버킷 Overview S3 API. `https://<account-id>.r2.cloudflarestorage.com` | Variable | Edge Secret 설정, 로컬 프로세스 환경 |
| `R2_BUCKET` | 직접 만든 비공개 Standard 버킷 이름 | Variable | Edge Secret 설정, 로컬 .env |
| `R2_ACCESS_KEY_ID` | R2 API token 생성 결과 | Secret | 운영 승인 후 Edge Secrets, 현재 로컬 DPAPI 보관함 |
| `R2_SECRET_ACCESS_KEY` | 위 생성 결과의 비밀키. 재조회 불가 시 사용자 재발급 | Secret | 운영 승인 후 Edge Secrets, 현재 로컬 DPAPI 보관함 |
| `SOURCE_MODE` | `rest` 기본, 기존 S3 연결이 있으면 `s3` | Variable | 이전 CLI만 |
| `SUPABASE_URL` | 프로젝트 Connect/API URL | Variable | Edge 자동 제공, 로컬 .env |
| `SUPABASE_READ_KEY` | 기존 안전한 서버 secret/service_role 읽기 연결 재사용. 완전한 목록 접근 필요 | Secret | 이전 CLI만. 프런트엔드 금지 |
| `SOURCE_BUCKET` | 현재 `question-bank` | workflow 고정 | 로컬 .env |
| `SOURCE_S3_ENDPOINT` | Supabase Storage → Settings → S3 connection | S3 선택 때만 Variable | 이전 CLI만 |
| `SOURCE_S3_REGION` | 같은 화면의 region | S3 선택 때만 Variable | 이전 CLI만 |
| `SOURCE_S3_ACCESS_KEY_ID` | 이미 보유한 안전한 S3 연결의 ID | S3 선택 때만 Secret | 이전 CLI만 |
| `SOURCE_S3_SECRET_ACCESS_KEY` | 같은 연결 비밀키 | S3 선택 때만 Secret | 이전 CLI만 |
| `MIGRATION_STATE_KEY` | 이번 실행에서 생성한 32-byte 난수의 64자리 hex. 로컬 DPAPI와 이전 전용 GitHub Secret에 보관 | Secret | 이전 CLI만. 분실하면 원격 기록 해독 불가 |
| `MIGRATION_JOB` | 준비용 `prep-20261010`, 밤 최종 `night-20261010` 등 | 실행 입력 job | 로컬 .env. 재개 시 동일 값 |
| `MIGRATION_WRITES_FROZEN` | 실제 모든 쓰기를 멈춘 뒤만 `true` | 실행 입력 writes_frozen | 로컬 .env |
| `BANK_STORAGE_PROVIDER` | 준비 기간 `supabase` 또는 미설정 | 이전 작업에 불필요 | Edge Secrets. 전환 승인 후만 `r2` |
| `BANK_FILE_ORIGINS` | production origin와 정확한 테스트 origin을 쉼표로 구분 | 불필요 | Edge Secrets. 기본 production origin만 |
| `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase Edge 자동 제공 | 자동 제공되지 않음 | 기존 서버 값 그대로. 사용자 신규 발급 불필요 |
| `SUPABASE_RESTORE_KEY` | 복구 시 별도로 승인된 기존 서버 업로드 키 | 복사 workflow에는 제공 안 함 | 로컬 역복사에서만 |
| `SUPABASE_ACCESS_TOKEN` | 기존 Supabase CLI 로그인 재사용 | 이 workflow에는 불필요 | Edge 배포를 승인받은 때 CLI 인증에만 |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | 기존 Pages 배포 인증 | 기존 배포 workflow만 | Pages 배포 시에만. R2 Object 키와 별개 |

이번 세션의 Supabase MCP 연결로 DB·정책·목록 집계·Edge 소스 조회는 가능했다. 로컬 환경에 R2/Supabase 파일 전송용 비밀 환경변수는 없었다. MCP 인증을 추출하지 않는다. 기존 Actions/서버의 안전한 읽기 연결이 있다면 재사용하고, 그 연결이 없을 때만 필요한 원본 인증을 설정한다. 파일 본문 전송은 S3와 REST 중 하나만 사용한다. 다만 새 DB 참조 대조에는 S3 모드에서도 SUPABASE_URL/SUPABASE_READ_KEY가 필요하다. 현재 완전한 프로젝트 조회용 server key를 CLI에 요구하는 구현이므로, 기존 안전한 키가 없으면 새 고권한 키를 임의 발급하지 말고 별도 권한 검토가 필요하다. MCP의 읽기 전용 SQL로 수행한 집계/참조 대조는 이미 완료했다. S3 호환 범위는 [Supabase 공식 문서](https://supabase.com/docs/guides/storage/s3/compatibility)를 따른다.

이전 도구 템플릿은 [tools/storage-migration/.env.example](../../tools/storage-migration/.env.example), Edge 전용 템플릿은 [supabase/functions/.env.example](../../supabase/functions/.env.example)이다. Windows 로컬은 새 [vault.ps1](../../tools/storage-migration/vault.ps1)의 DPAPI 보관함을 우선 사용한다. `.env` 방식은 제한된 권한으로 사용자가 직접 관리하는 대안이다. `.env*`, `.private/`는 git에서 제외된다. 명령 인자·채팅·로그·테스트 결과에 키를 붙여 넣지 않는다. 프런트엔드 공개 config에는 기존 세 필드와 선택적 `storageGateway: true`만 들어간다.

## 이전 도구의 안전장치

`preflight`는 REST의 모든 폴더와 1,000개 단위 페이지 또는 S3 continuation token을 끝까지 읽는다. 파일 내용 GET은 하지 않는다. 원본·대상 식별자, 경로·크기·유형·생성/수정 메타데이터와 목록 해시를 기록한다. bank_entries의 모든 파일을 exact count와 실제 페이지 길이로 순회하고 예상 조각 경로/크기와 대조한다. 누락·미참조·크기 불일치는 암호화 manifest에 기록하고 실패 종료한다. copy/verify 전후 DB 참조 fingerprint도 다시 확인한다. 원본 버킷이 추가되어 있거나 크기 미상·중복 경로가 있으면 중지한다. 사용자 지정 metadata나 Content-Encoding이 필요한 REST 원본은 S3 또는 별도 검토로 넘겨 무손실 복사를 보장한다.

`copy`는 원본 삭제 API가 없는 adapter로 읽고 대상에 `If-None-Match: *`로만 쓴다. 기존 대상도 실제 내용을 내려받아 SHA-256·크기·Content-Type 및 관련 메타데이터를 비교한다. 다른 내용이면 덮어쓰지 않는다. 429/5xx 등 읽기는 제한 재시도하며 PUT의 불명확한 결과는 먼저 실제 내용을 확인한 후에만 재시도한다. `verify`는 별도 전체 내용 비교이며 합계만으로 성공하지 않는다. 서로 다른 저장소 ETag를 체크섬으로 비교하지 않는다.

제어 기록은 비공개 R2의 `__migration/<job>/`와 로컬 `.private/<job>/`에 AES-256-GCM 암호문으로 남는다. 파일별 검증 후 체크포인트를 저장하고, 재개할 때도 실제 파일을 다시 검사한다. 파일명·상세 목록은 공개 artifact나 로그로 출력하지 않는다. `__migration/global.lock`의 조건부 생성으로 로컬/Actions 전체에 동시 실행을 막는다. 정상 종료는 자신이 만든 lock만 삭제한다. 강제 종료로 남은 lock은 **모든 실행이 종료됐음을 확인한 사용자**가 Dashboard에서 그 정확한 lock 객체만 제거한 뒤 동일 job으로 재개한다. 자동 만료나 잠금 탈취는 없다.

`test`는 이번 실행에서 만든 UUID 경로 아래 작은 인공 PDF와 SVG 이미지 두 개만 PUT·GET·SHA 검증·DELETE·404 확인한다. 서명 GET, 익명 거부, CORS 응답 및 62초 후 만료/재발급도 확인한다. 다른 테스트 파일이나 폴더 전체를 삭제하지 않는다. 실제 Chrome CORS·미리보기·다운로드는 로컬 인공 파일 signer로 확인했다. 실제 Auth/파일별 권한을 포함한 서버 gateway 통합 검증은 별도 테스트 Supabase 프로젝트의 인공 데이터로 한다. 운영 DB에 가짜 문제·시험지는 만들지 않는다.

실제 브라우저 시험은 별도 테스트 Supabase 프로젝트·테스트 R2 버킷을 지정한 공개 config를 `web-bank/config.test.json`으로 준비하고 다음처럼 실행한다. 운영 프로젝트 설정을 테스트 설정에 복사하지 않는다. localhost:4173 origin은 제공한 CORS와 일치한다. 테스트 로그인과 DB 데이터는 그 테스트 프로젝트에만 만들고, 파일은 직접 생성한 작은 인공 PDF/이미지만 쓴다. 이번에는 프로젝트 생성·결제·실제 업로드를 실행하지 않았다.

```powershell
node scripts/build-bank-web.cjs web-bank/config.test.json tests/artifacts/r2/staging-web
python -m http.server 4173 --bind 127.0.0.1 --directory tests/artifacts/r2/staging-web
```

테스트 환경에서는 owner 업로드→서버 해시 검증→동료 읽기→권한 없는 사용자 거부→미리보기/출제/PDF 생성→정확한 파일 삭제 순서로 확인한다. Origin 헤더 테스트만으로 CORS 성공을 선언하지 말고 실제 브라우저 개발자 도구에서 preflight와 GET 응답을 확인한다.

## 오늘 밤 실행 순서

다음은 별도 승인 이후의 절차다. 어느 단계든 실패·누락·충돌이면 읽기/쓰기 제공자를 전환하지 않는다.

1. DB schema·public 데이터·RLS·RPC 정의, 현재 public config, Edge 코드·설정, Pages deployment ID와 실제 asset 해시, 데스크톱 버전·연결 설정을 비공개 위치에 백업한다. DB backup은 파일 payload 백업이 아니다. 원본 Storage는 그대로 남긴다. DB의 `bank_entries`, `bank_revision_files`, catalog, questions/revisions, 학교/원본 연결, 시험지 초안/이력, teacher/review 필드를 포함한다.
2. [schema-proposal.sql](schema-proposal.sql)을 검토하고 테스트 프로젝트에서 먼저 적용한다. 운영 적용은 승인 후 별도로 한다. 자동 migrations 디렉터리에 넣지 않았다. 원래 함수 정의를 private schema에 저장하고, 초기 provider는 Supabase다. `storage.objects`를 수정/삭제하지 않는다.
3. 신규 `bank-storage`, 수정된 `bank-verify`, `bank-delete-question`, `bank-image-transition`과 프런트엔드·데스크톱 후보를 검토·배포한다. 서버 provider는 계속 Supabase, 클라이언트는 `storageGateway: true`로 우선 동일 동작을 확인한다. 구버전 데스크톱도 모두 정지·업데이트 대상으로 확인한다.
4. 새 업로드, 파일 교체, 삭제, 이미지 변환, revision prune, 재평가 재업로드, 대기열·maintenance 작업을 모두 일시 중지한다. 실행 중 요청이 끝난 것을 확인한다. 모든 파일 변화를 멈춘 상태를 운영자가 확인한다. 아래 SQL의 frozen 설정은 추가 방어이며, 데스크톱/백그라운드 작업 중지를 대신하지 않는다.
5. frozen=true, 새 최종 job으로 `preflight` 실행. 파일 수·bytes·목록 해시·현재 앱과 Edge/DB 버전을 기록한다. 지금 실측한 2,463개를 확정값으로 재사용하지 않는다.
6. 같은 job으로 `copy`를 명시적 확인 문자열과 함께 실행한다. 완료 후 `verify`를 별도로 실행한다. 종료 코드 0, verified=true, 실패/누락/충돌 0, 최종 목록 불변이어야 한다. 공개 로그에 개수·합계·해시만 남는다.
7. 검증 성공 후에만 유지보수 상태에서 DB provider와 Edge의 BANK_STORAGE_PROVIDER를 함께 `r2`로 바꾼다. 네 Edge Function 모두 새 설정 적용을 확인한다. immutable 파일 ID 참조라 DB 파일 주소 변경은 보통 필요 없다. 내장 URL 예외가 있으면 참조 백업 후 별도 검토 변경·재검증을 끝내기 전에는 전환하지 않는다.
8. 기존 실제 자료를 읽기만 하여 원본시험지·학교 목록·이미지 미리보기·다운로드·문제 출제·PDF/DOCX 생성을 확인한다. 작성자, 허용된 동료, 미초대/권한 없는 사용자, 비공개/보관 문항을 구분해 확인한다. 기존 등록일·업로드일·학교 연결·수정 이력을 비교한다. 테스트 프로젝트에서 새 업로드·중복 업로드·수정·삭제를 검증한다.
9. 전체 성공 후 frozen=false로 하고 쓰기를 재개한다. 사용자가 실제로 등록하려던 첫 파일의 정상 업로드/검증/다운로드를 확인한다. 가짜 운영 문항을 만들지 않는다. 문제가 있으면 즉시 다시 쓰기를 멈추고 아래 복구 절차를 따른다.

SQL Editor에서 승인 후 사용할 동결/전환 명령:

```sql
-- 준비 schema 적용 이후, 실제 작업 중지를 확인한 뒤
update bank_storage_private.settings set frozen=true where singleton;
-- 전체 copy + verify 성공 후에만
update bank_storage_private.settings set provider='r2' where singleton;
-- Edge 설정 일치와 사용자 기능 확인 후에만
update bank_storage_private.settings set frozen=false where singleton;
```

이 도구에는 운영 전환이나 원본 삭제 명령이 없다. SQL/Edge 변경을 copy workflow에 묶지 않았다.

동결 초안은 파일 저장소 정책뿐 아니라 public의 bank 데이터 테이블에 statement trigger를 두어 오래된 Electron·RPC·백그라운드의 예약/수정/삭제도 차단한다. 회원 로그인 테이블과 감사 로그는 예외다. 설정 행 SHARE lock으로 진행 중 DB 트랜잭션 완료를 기다린다. 이미 인가되어 전송 중인 외부 요청은 별도로 종료/배출해야 하므로 모든 클라이언트·작업 중지 후 전송 timeout(최소 120초) 이상 기다리고 미완료 작업/목록 변화를 확인한다. frozen=true 환경변수만으로는 부족하며 CLI가 bank_storage_status의 실제 frozen/provider를 확인한다. SQL 초안은 이번에 운영 적용하지 않았다.

## 로컬 실행 명령

PowerShell에서 후보 폴더로 이동한다. Node.js 24를 사용한다. 최초 설치와 모의 테스트는 비밀키 없이 실행할 수 있다.

```powershell
Set-Location 'C:\Users\reals\.codex\worktrees\r2-storage-preparation\문제생성기'
npm ci --prefix tools/storage-migration --ignore-scripts --no-audit --no-fund
npm test --prefix tools/storage-migration
```

권장 DPAPI 실행 명령은 [setup-status.md](setup-status.md)에 있다. 아래는 선택적인 .env 방식이다. 사용자가 템플릿을 `.env`로 복사해 비밀값을 직접 입력한다. 준비용 job의 preflight/test는 아래와 같다. preflight는 파일 내용 대신 암호화된 목록과 lock 같은 제어 파일만 대상에 기록한다.

```powershell
node --env-file=tools/storage-migration/.env tools/storage-migration/cli.mjs preflight
node --env-file=tools/storage-migration/.env tools/storage-migration/cli.mjs test
```

밤에 실제 쓰기 중지 후 `.env`에서 `MIGRATION_JOB=night-20261010`, `MIGRATION_WRITES_FROZEN=true`로 바꾼다. 복사 승인을 받은 뒤만 순서대로 실행한다.

```powershell
node --env-file=tools/storage-migration/.env tools/storage-migration/cli.mjs preflight
node --env-file=tools/storage-migration/.env tools/storage-migration/cli.mjs copy COPY_FILES_NO_DELETE
node --env-file=tools/storage-migration/.env tools/storage-migration/cli.mjs verify
```

재개는 같은 job과 같은 명령을 사용한다. 이미 시작한 job의 manifest를 새 preflight로 덮어쓰지 못한다. 원본 목록이 바뀌면 다시 동결하고 새 job으로 검토한다. 이전 상태 복호화키는 같은 값을 유지한다.

## Actions 수동 버튼

[수동 workflow](../../.github/workflows/storage-migration.yml)는 workflow_dispatch만 있으며 push·pull_request·schedule 트리거가 없다. 코드가 **기본 브랜치 main에 승인되어 반영된 뒤** GitHub → Actions → **Storage preparation and migration (manual only)** → **Run workflow** 버튼이 나타난다. main과 원래 저장소만 실행하며, checkout은 그 실행의 정확한 commit이다. Actions 의존성은 확인한 commit SHA로 고정했다. Environment 승인과 main 보호를 설정한다.

| 실행 순서 | operation | job | writes_frozen | confirmation |
| --- | --- | --- | --- | --- |
| 준비 목록 | preflight | prep-20261010 | false | 빈칸 |
| 작은 연결 테스트 | test | prep-20261010 | false | 빈칸 |
| 밤 최종 목록 | preflight | night-20261010 | true | 빈칸 |
| 실제 복사 | copy | night-20261010 | true | COPY_FILES_NO_DELETE |
| 전체 검증 | verify | night-20261010 | true | 빈칸 |

코드는 미병합이므로 **지금은 실제 버튼이 아직 없다**. 지금 기본 브랜치에 병합하거나 운영 배포하지 않았다. Actions가 불가능하면 위 로컬 명령이 동일 코어를 사용한다. Actions 작업은 330분 timeout이며 끝나지 않으면 lock 소유 실행 종료를 확인 후 재개한다.

기존 `deploy-pages.yml`은 자동 push 배포가 아니지만 **오래된 고정 ZIP**을 사용하므로 이번 배포에 그대로 쓰면 안 된다. 소스 검토 후 새 bundle·manifest·공개 파일 해시를 준비해 수동 배포하거나 아래 명령을 별도 배포 승인 후 사용한다. export-contract는 push/PR 검사만 수행한다. Supabase 인증·Pages 인증은 기존 안전한 CLI 로그인이나 배포 비밀 설정을 재사용한다.

```powershell
# 각각 운영 배포를 별도 승인받은 뒤만 실행. CLI 도움말 확인 버전 고정.
npx --yes supabase@2.120.0 functions deploy bank-storage bank-verify bank-delete-question bank-image-transition --project-ref bjxxqdbftefughjkcrqj --no-verify-jwt
# 공개 config.json에는 비밀키를 넣지 않는다. 초기 storageGateway=true, 서버 provider=supabase.
node scripts/build-bank-web.cjs web-bank/config.json web-bank/dist
npx --yes wrangler@4.149.0 pages deploy web-bank/dist --project-name examstudio-shared-bank --branch main
```

Edge 키는 Dashboard에서 사용자 직접 입력을 우선한다. CLI를 사용할 때도 비공개 파일을 사용한다: `npx --yes supabase@2.120.0 secrets set --project-ref bjxxqdbftefughjkcrqj --env-file <비공개 Edge 환경파일>` . 원문 키를 인자로 쓰지 않는다. 은행 외 함수가 삭제될 수 있는 `--prune` 옵션은 사용하지 않는다.

## 자료를 잃지 않는 복구

전환 직후 새 쓰기가 전혀 없고 검증 기준과 DB 참조가 동일하면 쓰기를 멈춘 채 Edge/DB provider를 Supabase로 돌린 후 읽기 기능을 확인하고 재개할 수 있다. 원본은 그대로 있다.

**R2에만 새 파일이 생겼다면 먼저 Supabase로 되돌리지 않는다.** 새 파일의 DB 참조는 보존한 채 gateway의 읽기를 R2로 유지하고 모든 쓰기를 멈춘다. 현재 DB·R2 목록·암호화 이전 기록을 백업한다. 그다음 현재 R2 파일 전체를 원본 Supabase에 역복사하고 검증한다. 이전 DB snapshot을 덮어씌우면 새 등록/수정 이력이 사라지므로 사용하지 않는다.

로컬 `.env`에 새 복구 job(예: `restore-20261010`), `SOURCE_MODE=rest`, 원본의 기존 안전한 읽기 키, 별도 승인된 `SUPABASE_RESTORE_KEY`, `MIGRATION_WRITES_FROZEN=true`를 설정한다. 복구도 별도 승인을 받은 후 아래 명령을 실행한다.

```powershell
node --env-file=tools/storage-migration/.env tools/storage-migration/cli.mjs restore-plan
node --env-file=tools/storage-migration/.env tools/storage-migration/cli.mjs restore-copy RESTORE_FILES_NO_DELETE
node --env-file=tools/storage-migration/.env tools/storage-migration/cli.mjs restore-verify
```

역복사는 R2의 제어/테스트 경로를 제외한 모든 실제 객체를 원래 경로로 복사한다. 원본 Supabase에 남은 추가 백업 객체는 삭제하지 않는다. 이미 존재하는 객체는 내용·메타데이터를 검증하며, 새 객체는 x-upsert=false로만 업로드한다. 충돌이나 표현할 수 없는 메타데이터가 있으면 중지하고 읽기는 R2에 유지한다. R2 원본도 삭제하지 않는다.

역검증이 성공하고 현재 DB가 참조하는 신규 파일도 존재하는 것을 확인한 후 DB provider와 Edge provider를 Supabase로 바꾼다. 신규 문항·수정 이력·학교 연결·출력을 확인한 뒤 쓰기를 재개한다. schema까지 되돌릴 때만 [schema-rollback.sql](schema-rollback.sql)을 frozen 상태에서 적용한다. private receipt와 함수 백업은 보존한다.

Supabase 원본 정리는 별도 백업·검증·사용자 삭제 승인이 있을 때만 별도 진행한다. `storage.objects` 등 메타데이터 테이블을 SQL로 지워 용량을 줄이지 않는다.

## 비용 확인

R2 Standard 무료 제공량은 월 **10 GB-month**, Class A **100만 요청**, Class B **1,000만 요청**이며 인터넷 egress는 무료다. 계정의 다른 R2 사용량과 공유되며 무료 제공량 초과와 요청 반올림 과금에 유의한다. Infrequent Access에는 이 무료 제공량이 적용되지 않는다. [R2 가격](https://developers.cloudflare.com/r2/pricing/)

현재 약 0.831 GB가 저장 무료 범위보다 작아도 전체 비용 0원을 보장하지 않는다. copy와 verify가 각각 원본을 읽으므로 Supabase egress가 대략 원본 용량의 2배 이상 발생할 수 있고, 대상 확인·재시도·역복구·저널 기록에도 요청이 든다. Edge Functions 요청·실행, Supabase 플랜, 다른 버킷 사용량도 확인한다.

GitHub 계정의 Settings → Billing and licensing/Billing → Usage/Budgets에서 Actions 포함 시간·남은 사용량·스토리지·지출 한도를 확인한다. private/public 저장소, 계정 플랜, runner 종류에 따라 달라진다. 이 workflow는 ubuntu 기본 runner와 artifact 미업로드를 사용하지만 실제 계정 잔여 무료량은 이번에 확인하지 않았다. [GitHub Actions 과금](https://docs.github.com/en/billing/concepts/product-billing/github-actions)

## 실제 검증 결과와 남은 준비

최신 상세 상태는 [setup-status.md](setup-status.md), 기계 판독 결과는 [validation.json](validation.json)에 기록했다.

- R2 모의 검사 44/44, 기존 관련 검사 13/13 통과. 이전 upload→restore 실패는 세부 유형이 빠진 테스트 데이터 문제였으며 정상 분류를 넣어 전체 흐름을 통과시켰다.
- R2 설정 없이 웹 빌드 및 네 Edge bundle 컴파일 통과. Windows Electron 패키징과 패키지 안 실제 adapter 실행의 모의 만료/재발급 검사 통과. GUI의 실제 R2 연결 시험은 아니다.
- Cloudflare 계정·Pages 실제 조회, GitHub 이전 Environment 보호 규칙·암호화키 Secret 등록/재조회 완료. R2 버킷/CORS/키 설정, 실제 인공 파일 연결·만료·Chrome 미리보기/다운로드·Electron reader 시험 완료. 격리 Supabase Auth/파일별 권한 통합 시험은 아직 미완료다.
- 실제 운영 원본 파일 내용 다운로드, 복사/역복사, 전체 내용 검증, 운영 DB/Secrets 변경, merge/push/배포/전환/원본 삭제는 미실행이다.
- 운영 bank-verify bundle 조회는 재시도해도 API 오류였다. 소스 일치 확인이 남아 있다. 새 main 파일 통합과 관련 회귀 검사는 완료했지만 검토 커밋 확정과 실제 R2 통합 시험 후에만 배포를 검토한다.
