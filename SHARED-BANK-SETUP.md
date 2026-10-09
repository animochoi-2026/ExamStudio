# 문제공방 비공개 공동 문제은행 — 설치·운영 안내

2026-09-30. **Supabase·Google 로그인·Cloudflare Pages 실제 배포와 두 실제 계정 간 공동 저장/복원 검증을 완료했습니다.** 사이트는 https://examstudio-shared-bank.pages.dev/ 입니다. 다른 물리 PC의 HWP 출력·한글 수식 편집은 미검증입니다.

## 추천 구성과 비용

**사용자 소유 Cloudflare Pages Free + Supabase Free**를 추천합니다. Pages에는 로그인·검색·선택 화면만, Supabase에는 회원·DB·비공개 파일·검증 함수를 둡니다. 문항 편집과 HWP/DOCX/PDF 출력은 기존 문제공방 앱에서 합니다. 상시 개인 PC 서버, 유료 도메인, 유료 이메일 서비스가 필요하지 않습니다. 기본 pages.dev 주소를 사용합니다.

공식 문서 확인일은 2026-09-30입니다. 실제 신청 화면과 현재 프로젝트 사용량이 최종 기준입니다.

| 서비스 | 무료 범위·주요 제한 | 운영 시 주의 |
|---|---|---|
| Supabase Free | DB 500MB, Storage 1GB, 기본 egress 5GB, MAU 50,000, 개별 업로드 최대 50MB | 캐시 egress는 별도 지표이므로 모두 합쳐 마음대로 쓸 수 있다고 가정하지 않음. Edge Function 무료 호출·CPU/시간 한도도 존재 |
| Supabase Free | 낮은 활동량이 약 7일 지속되면 프로젝트 일시정지 가능, 자동 DB 백업 미제공 | 가짜 요청으로 일시정지를 피하지 않음. 대시보드에서 재개. 장기 중지 자료는 공식 복원 기한 확인 |
| Cloudflare Pages Free | 월 500회 빌드, 사이트당 20,000파일, 정적 파일당 25MiB | 앱 JS·CSS만 배포. 문항 파일을 여기에 공개하지 않음. Functions/Workers 유료 서비스를 추가하지 않음 |
| 유료 확장 | Supabase Pro 월 US$25부터, 초과 사용량·세금 등 추가 가능 | **소유자에게 예상 비용을 설명하고 승인받은 뒤 전환**. 자동 결제 설정하지 않음 |

Supabase와 Cloudflare 계정 가입 및 배포는 완료했습니다. 사용자 직접 가입 과정에서의 카드 입력 여부는 확인하지 않았습니다. 카드·결제를 요구하는 화면이 나오면 입력하지 말고 Free 선택부터 확인합니다. Cloudflare는 공식 Free 안내에서 카드 불필요를 명시하지만 실제 사용자 계정에서 Pages Direct Upload 배포에 성공했습니다. 이번 작업에서 카드 등록·결제 활성화는 하지 않았습니다.

## 관리자 멤버 초대

관리자 `animochoi@gmail.com`으로 웹사이트에 로그인한 뒤 우측 상단 작은 프로필 메뉴에서 **멤버 관리 → 초대하기**를 엽니다. 이름/관리 메모와 참여 이메일을 선택적으로 입력합니다. 링크는 기본 7일 동안 한 사람에게만 사용할 수 있습니다. 생성 화면에서 링크만 복사하거나 안내문과 함께 복사해 카카오톡 등에 직접 전달합니다. 이메일을 지정했다면 그 계정으로 로그인한 사람만 **참여하기**를 눌러 바로 가입합니다. 이메일을 비워 둔 링크는 상대가 신청한 뒤 관리자가 **승인**해야 이용할 수 있습니다. 링크 조회만으로 가입되지 않습니다. 취소나 재발급 시 이전 링크는 무효입니다. 가입한 회원은 링크가 만료돼도 계속 이용합니다.

링크 생성과 이메일 자동 발송은 별개입니다. 자동 발송에는 사용자 소유의 발신 도메인, 검증된 발신 주소, Resend API 키를 Edge Function 비밀 설정 `BANK_RESEND_API_KEY`, `BANK_INVITE_FROM`에 넣어야 합니다. `BANK_SITE_URL`은 `https://examstudio-shared-bank.pages.dev`로 설정합니다. 비밀키는 웹 빌드, Git, 데스크톱 앱에 넣지 않습니다. 발송 구성이 없으면 화면에 **메일 발송 미설정**을 표시하며 링크 복사와 가입은 계속 작동합니다. 발송 업체가 요청을 접수한 것과 상대가 실제 수신한 것은 구분합니다. 발신 도메인 등록이나 유료 서비스 이용을 자동으로 진행하지 않습니다. 관리자 계정의 Gmail 주소를 발신자로 임의 표기하지 않습니다.

## 모바일에서 저장하고 PC에서 이어 편집

같은 Google 계정으로 로그인한 뒤 **시험지 → 새 시험지 만들기**에서 문항을 담고 편집합니다. 제목·문항 순서·풀이공간 등을 바꾸면 잠시 후 자동 저장되며 **지금 서버에 저장**으로 즉시 저장할 수도 있습니다. 화면에 **서버 저장 완료**가 표시된 시험지만 다른 기기에서 보입니다. **로컬 임시 보관**은 이 기기에만 남은 변경이고, 재연결되면 다시 저장을 시도합니다. PC에서 **시험지 → 내 시험지 → 이어 편집**으로 같은 시험지 ID를 엽니다.

동시에 열어 수정해 서버 버전이 달라지면 오래된 저장을 막고 **최신 서버본 불러오기** 또는 **별도 사본으로 저장**을 선택하게 합니다. 완성 상태와 각 저장 버전은 서버 이력에 남습니다. 원문 문항의 최신본을 적용할 때만 **최신 문항 버전 확인·적용**을 눌러 확인합니다. 다운로드는 서버 저장 후 DOCX·PDF로 생성합니다. 현재 웹 호스팅에서는 Windows 한글 자동화를 실행할 수 없어 HWP 웹 다운로드는 제공하지 않으며, HWP는 기존 문제공방 PC 앱의 출력 경로를 사용합니다.

새 설치나 복구 시 기존 001~013을 이미 적용한 DB에는 `supabase/migrations/202610010014_member_invites.sql`만 추가 적용합니다. 웹은 `node scripts/build-bank-web.cjs app/shared-bank-config.json` 후 `web-bank/dist`를 Pages에 Direct Upload합니다. 메일 기능은 `bank-invite-mail` Edge Function을 `verify_jwt=false`로 배포하되 함수 내부에서 Auth 사용자 확인과 관리자 전용 RPC를 수행합니다. DB/Storage의 기존 회원 RLS는 유지합니다. 기존 문제공방 앱은 같은 `bank_join`을 사용하므로 가입 후 같은 Google 계정으로 연결합니다.

업체 약관을 확인했습니다. 무료 자료 공유라는 이유만으로 모든 약관이나 자료의 공동 이용 권한이 자동 충족되는 것은 아닙니다. 이번 구성은 선생님에게 서비스 관리자 계정을 나누는 대신 자체 앱 회원 권한을 부여합니다. 공동 승인 시 이용 가능 여부와 근거 메모를 기록합니다. 자료 권리, 적정 이용, 사용량 및 서비스 중단 조건은 운영자가 확인해야 합니다. 무료 플랜의 영구 유지나 무제한 사용을 약속하지 않습니다.

- 가격: https://supabase.com/pricing
- Supabase 약관: https://supabase.com/terms
- 일시정지: https://supabase.com/docs/guides/platform/free-project-pausing
- 과금 구조: https://supabase.com/docs/guides/platform/billing-on-supabase
- Storage 비용: https://supabase.com/docs/guides/storage/pricing
- Pages: https://www.cloudflare.com/products/pages/
- Pages 제한: https://developers.cloudflare.com/pages/platform/limits/
- Cloudflare 약관: https://www.cloudflare.com/terms/
- Free 안내: https://www.cloudflare.com/plans/

실제 측정 참고: 변경 전 사용자 데이터 백업 한 개는 722파일/130,988,119바이트(약124.92MiB), 기존 결과물 폴더는 38파일/12,730,679바이트(약12.14MiB)였습니다. 전체 운영 자료나 문항당 평균치가 아닙니다. 이 자료를 자동 업로드하지 않았습니다. 1GB 안에서 소수 대표 문항으로 시작하고 사용량을 확인합니다. 기존 AI 비용은 이 공동 저장비와 별도이며 개인 AI 키를 동료에게 배포하지 않습니다.

## 현재 초기 설정 진행 상황

Supabase 프로젝트 `bjxxqdbftefughjkcrqj`에 두 마이그레이션과 검증 함수를 적용했고, Google Cloud 프로젝트 `project-dc1dc9d0-acc2-492c-a0d`의 웹 OAuth 클라이언트를 연결했습니다. Cloudflare `examstudio-shared-bank` 프로젝트에 사이트를 배포했습니다. Site URL 및 허용 반환 주소는 `https://examstudio-shared-bank.pages.dev/`이고 데스크톱 반환 주소도 유지합니다. 아래 절차는 새 설치/이전 참고용이며 초기 SQL이나 프로젝트를 다시 만들지 않습니다.

관리자 `animochoi@gmail.com`, 승인된 일반 교사 `realspy1234@gmail.com`으로 실제 공동 문항 복원 및 API 권한 검증을 마쳤습니다. 앱의 공개 연결 설정은 `app/shared-bank-config.json`입니다. 관리자 로그인 토큰은 배포본에 포함하지 않습니다.

## 프로젝트·인증 준비 순서

1. Supabase에서 사용자 소유 **Free 조직 → New project**. 이름 `examstudio-question-bank`, 가까운 지역을 선택합니다. DB 비밀번호는 직접 입력해 비밀번호 관리자에 보관합니다. 교사를 Supabase 조직 관리자로 초대하지 않습니다.
2. SQL Editor에서 아래 두 파일을 **순서대로 한 번씩** 실행합니다. 초기 SQL을 이미 적용했다면 두 번째만 적용합니다. 운영 DB가 있다면 DB와 Storage 백업을 먼저 받습니다. 기존 데이터 삭제 SQL을 실행하지 않습니다.
   - `supabase/migrations/202609300001_shared_bank.sql`
   - `supabase/migrations/202609300002_collaboration.sql`
3. 첫 SQL의 초기 관리자 허용 이메일은 `animochoi@gmail.com`입니다. 실제 인증된 해당 Google 계정만 관리자 초대와 연결됩니다. 최초 가입자 자동 관리자 방식이 아닙니다. 계정을 바꿀 때는 실제 소유 확인 후 서버 설정을 바꿉니다.
4. Edge Functions에서 `bank-verify`를 배포합니다. 코드는 `supabase/functions/bank-verify/index.ts`. 플랫폼 Verify JWT 옵션은 끄되, 코드 내부 `/auth/v1/user`의 실제 토큰 검증을 유지합니다. 기본 서버 환경변수 `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`는 서버에서만 사용합니다. 동료 앱/웹에 service_role 키를 넣지 않습니다.
5. Google Cloud의 사용자 소유 프로젝트 → Google Auth Platform에서 앱 동의 화면과 OAuth 클라이언트를 준비합니다. 유형은 **웹 애플리케이션**. 리디렉션은 `https://<프로젝트 ID>.supabase.co/auth/v1/callback`. Client ID/secret은 Supabase **Authentication → Sign In / Providers → Google**에만 넣습니다. Drive 권한은 요청하지 않습니다. 개인 Drive용 데스크톱 OAuth JSON과 다릅니다.
6. Supabase **Authentication → URL Configuration → Redirect URLs**에 `http://127.0.0.1:53682/bank/callback**`를 등록합니다. 웹 배포 후 정확한 `https://<사이트>.pages.dev/`도 추가하고 Site URL로 지정합니다. 임의 도메인 전체를 허용하지 않습니다.
7. Google OAuth가 Testing이면 교사들의 계정을 테스트 사용자에 등록합니다. Google 테스트 사용자와 문제은행 승인 목록은 서로 다른 검사입니다. 운영 공개 상태·브랜드·도메인 검증 요건은 실제 Google 설정에서 확인합니다. 기본 프로필/이메일만 사용하는 로그인과 Drive 민감 권한의 테스트 만료 규칙을 혼동하지 않습니다.
8. Supabase Project URL과 **publishable 키**로 공개 연결 JSON을 만듭니다. legacy anon 키도 허용합니다. 그 외 필드나 secret/service_role 키는 앱과 웹 빌드가 거부합니다.

```json
{
  "url": "https://실제-프로젝트-ID.supabase.co",
  "publishableKey": "sb_publishable_실제공개키",
  "spaceId": "57fcd460-b526-487f-9075-5503e4d07145"
}
```

9. 앱 **문제은행 연결 → 공동 은행 연결 JSON 불러오기 → 내 Google 계정으로 로그인**. 시스템 브라우저에서 본인 계정을 선택합니다. Chrome에 로그인된 계정을 자동 승인하지 않습니다. 동료는 웹사이트의 관리자 **멤버 관리 → 초대하기**에서 만든 링크로 자기 계정에 참여한 뒤 같은 계정으로 앱에 로그인합니다. 발신 도메인을 설정하지 않은 현재 운영에서는 링크를 복사해 직접 전달하며 자동 이메일 발송은 미설정 상태로 표시됩니다.
10. **동료용 공개 연결 JSON 저장**을 전달합니다. 각 교사는 자기 PC와 자기 Google 계정으로 로그인합니다. 연결 해제는 로컬 인증을 지우며 자료를 삭제하지 않습니다. 운영체제 암호화 파일을 다른 PC로 복사하지 않습니다.

공식 인증 문서:
- https://supabase.com/docs/guides/auth/social-login/auth-google
- https://supabase.com/docs/guides/auth/redirect-urls
- https://supabase.com/docs/guides/functions/auth
- https://supabase.com/docs/guides/storage/security/access-control
- https://developers.google.com/identity/protocols/oauth2

CLI를 사용할 경우 소유자가 직접 `supabase login`한 다음 프로젝트를 연결해 마이그레이션을 적용합니다. 서버 함수 배포 명령은 `supabase functions deploy bank-verify --project-ref <프로젝트 ID> --no-verify-jwt`입니다. 마이그레이션이 적용된 프로젝트에 초기 SQL을 중복 실행하지 않습니다.

## 최소 웹사이트 빌드·배포

프로젝트에서 의존성을 설치한 뒤 공개 JSON을 지정합니다.

```powershell
npm ci
node scripts/build-bank-web.cjs "C:/안전한위치/문제공방-공동은행.json"
```

생성 폴더는 `web-bank/dist`입니다. 원본 자료·로컬 데이터·인증정보 없이 정적 화면과 검증된 공개 JSON만 들어갑니다.

Cloudflare 본인 계정 → **Workers & Pages → Create → Pages → Direct Upload**에서 이 폴더를 배포합니다. 무료 pages.dev 주소를 사용하고 도메인 구매/유료 Workers를 켜지 않습니다. 화면 이름이 달라졌다면 Pages의 정적 사이트 업로드 경로를 확인합니다. 최초 Cloudflare 가입과 약관 동의는 사용자가 직접 합니다. 현재 이 방식으로 https://examstudio-shared-bank.pages.dev/ 에 배포했습니다.

배포 주소를 Supabase의 Site URL/Redirect URLs에 넣은 뒤 Google 로그인부터 시험합니다. `_headers`의 CSP/프레임 차단 설정을 유지합니다. 웹은 검색·상세·검수·선택에 집중하며 문항 전체 편집기나 HWP 서버가 아닙니다.

앱 실행은 기존 `npm start`, 패키지는 기존 `npm run package` 경로를 유지합니다. 공개 설정을 배포본에 포함하려면 `app/shared-bank-config.json`으로 둘 수 있습니다. 패키지 생성기가 공개 필드와 키 유형을 검증합니다. 실제 로그인 토큰·user-data·결과물·웹 테스트 자료는 패키징 대상이 아닙니다.

## 교사 사용 방법과 권한

- 일반 교사: 승인된 공동 문항과 자신의 미검수/개인 문항을 봅니다. 자기 문항 등록·수정, 공동 문항 수정 제안이 가능합니다.
- 검수자: 공동 미검수 자료를 보고 공유 이용 근거·태그·난이도를 승인합니다. 다른 교사의 개인 초안은 보지 않습니다.
- 관리자: 이메일 승인·차단, 검수자 지정, 분류 기준 관리, 사용 중지·복구, 공동 자료 백업. 타인 개인 초안을 자동 공개하지 않습니다.
- DB와 Storage RLS가 실제 권한을 검사합니다. UI 버튼만 숨기는 방식이 아닙니다. 차단 후 기존 세션의 다음 원격 접근도 막습니다. 이미 다운로드된 로컬 자료를 원격 회수하지는 못합니다.

A교사: 기존처럼 변환 → 문제은행 **현재 문항 → 선택 문항 저장**. 자동 등록은 연결 후 별도로 켭니다. 미검수 상태라도 등록 가능합니다. 검수자가 공동 이용 가능 여부와 검수 내용을 승인하면 B교사 목록에 나타납니다.

B교사: **저장 문항 목록 → 검색 → 체크 → 선택 순서대로 불러오기**. 기존 편집·HWP/DOCX/PDF 출력을 사용합니다. B가 수정한 것을 등록하면 새 문항 ID의 복사본으로 저장하고 A 원문과 연결합니다. A 원문을 덮어쓰지 않습니다.

웹: Google 로그인 → 문항 찾기/필터/미리보기 → 선택 문항에서 순서 조정 → **앱에서 열 선택 목록 저장**. 앱의 **웹 선택 목록 가져오기**에서 JSON을 선택합니다. 목록에는 ID·버전·순서만 있으며 다운로드 때 다시 권한을 검사합니다.

난이도는 null 또는 소수점 한 자리입니다. 개인 제안, AI 추천, 생성 목표, 공동 확정은 분리합니다. 하 대표3.0/중 대표5.0/상8.0 이상만 안내하며 임의 구간·기본5점·옛 등급 점수 환산을 하지 않습니다. 공동 확정은 관리자/검수자만 변경합니다. 웹 개인 메모·즐겨찾기는 사용자별로 분리하고 공동 문항/백업에 넣지 않습니다. 앱의 기존 개인 메모는 로컬 보관이며 웹 개인 메모와 자동 동기화하지 않습니다.

## 기존 자료와 버전·오류 복구

이전 개인 Drive 자료/인증/대기열은 삭제하거나 자동 이전하지 않았습니다. 개인 Drive는 공동 저장소와 별개이며 현재 공동 UI에서는 노출하지 않습니다. Drive 관리자 자동 백업도 아직 연결하지 않았습니다.

이전 공동 v1 서버를 썼다면 두 번째 마이그레이션과 새 Edge Function 배포 후, 각 등록자가 **이전 등록 문항 목록 연결**을 누릅니다. 자기 완료 기록의 파일을 다시 검증해 검색 색인을 추가하며 원본 바이트는 바꾸지 않습니다. 미검수 자료는 공동 승인 후 다른 일반 교사에게 보입니다.

문항/출처/revision은 UUID, 파일 역할·크기·SHA-256·부모 버전은 완료 기록과 네이티브 JSON에 보관합니다. 원본은 같은 출처·해시 기준으로 재사용합니다. 표시용 출처 구조와 Storage ID 경로를 분리합니다. 제목·태그 변경으로 파일을 옮기거나 자동 삭제하지 않습니다.

6MiB 불변 조각 업로드는 중간 실패를 재시도할 수 있게 합니다. 내용/화질을 줄이지 않으며 총 저장·전송 용량은 그대로 계산됩니다. 앱 논리 파일 한도350MiB, 서버에서 모으는 네이티브 JSON20MiB, 완료 기록5MiB, 화면 미리보기12MiB 제한이 있습니다. 큰 파일의 Edge CPU/실행시간은 실클라우드에서 별도 검증해야 합니다. 실패 시 로컬 결과를 보존하고 자동으로 내용을 삭제하지 않습니다.

필수 DOCX·네이티브 데이터·첨부 검증이 모두 끝나야 완료가 됩니다. PNG 실패는 별도 상태입니다. 대기열은 재시작해도 남고, 계정이 다르면 원래 등록 계정이 돌아올 때까지 업로드하지 않습니다. 빠른 확정 수정은 묶어서 처리하며 중간 토큰마다 업로드하지 않습니다. 충돌·권한·용량 오류는 보류/오류로 표시하고 무한 재시도하지 않습니다.

## 백업·복원·이전

앱 관리자의 **관리자 공동 자료 백업**은 접근 가능한 완료된 공동 버전과 실제 파일, 메타데이터, 문항·버전 레코드, 분류표, 회원 역할 정보, 감사 이력을 함께 내보냅니다. 타인 개인 초안/개인 메모, 미완료 업로드, 토큰·비밀키는 제외합니다. 일반 교사의 **선택 문항 파일 내려받기**에는 회원·전체 감사 정보가 없습니다. 따라서 관리자 백업 폴더는 동료에게 통째로 배포하지 않습니다.

`backup.json`이 마지막에 생성되어야 완성된 백업입니다. `files` 폴더와 함께 보관합니다. 중간 실패 폴더를 완료 백업으로 취급하지 않습니다. **백업에서 로컬 복원**은 모든 해시를 먼저 검사하고 각 버전을 새 로컬 작업으로 엽니다. 기존 작업을 덮어쓰지 않습니다. ID·기여자·수정 이력은 백업에 보존됩니다.

이 백업은 전체 Supabase Auth 계정/DB 복구 도구가 아닙니다. 새 클라우드 서비스에 회원 ID를 대응해 전체 재등록하는 자동 이전 도구는 후속입니다. 운영 DB 전체와 Storage 전체를 보전하려면 소유자가 공식 DB 내보내기와 Storage 별도 백업도 수행해야 합니다. DB 덤프만으로 파일이 백업되지는 않습니다. 저장소 어댑터를 분리하여 향후 이전할 수 있게 했습니다.

사용량 화면의 Storage 바이트는 실제 object metadata 합계이고 예약 바이트는 예정 파일 크기입니다. 전송량·DB 용량·청구량은 Supabase 대시보드에서 확인합니다. 웹에서 저장1GB의80%부터 경고합니다. 무료 초과는 자동 결제로 해결하지 않습니다.

## 개통 전 실제 검사

1. 관리자 A 실계정 연결, 초대한 B 실계정 연결, 미초대 C 차단.
2. A 등록 → 공동 승인 → B 웹/앱 목록 → 캐시 없는 별도 PC로 복원.
3. DOCX 바이트/수식/도형/답/풀이 비교, 기존 HWP 출력 → 실제 한글에서 열고 수식 편집, PDF 비교.
4. B 직접 API 역할 상승/타인 수정/삭제 거부, 차단 직후 파일·미리보기 거부.
5. 실제 네트워크 끊김·앱 종료·재시도·동시 수정, 무료 한도/Edge 시간 확인.
6. 관리자 백업 다운로드와 캐시 없는 환경의 로컬 복원, Pages 보안 헤더/Google 리디렉션 확인.

로컬 SQL·브라우저·Electron 테스트 결과와 실제 클라우드 검사는 구분합니다. 위 실검사가 끝나기 전 공동 운영 완료로 안내하지 않습니다.
