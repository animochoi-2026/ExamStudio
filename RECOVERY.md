# 문제공방 복구 안내

이 저장소는 개발 PC 복구용 비공개 소스 백업이다. 운영 DB, R2 객체, 사용자 자료, 실제 비밀값은 포함하지 않는다. 데스크톱 정식 설치본은 Release의 0.4.39 ZIP이다.

## GitHub에서 복구

Windows 10/11 x64, Git, Node.js 22 이상(검증 환경 Node 24), npm, Python 3.12 및 python-docx/lxml 출력 라이브러리가 필요하다. Desktop은 Electron 44.3.0을 잠금 파일로 설치한다.

```powershell
git clone https://github.com/animochoi-2026/munjegongbang-recovery-backup.git
cd munjegongbang-recovery-backup
git checkout <Release에 표시된 recovery 태그>
npm ci
python -m pip install python-docx lxml
node --test tests/replacement-stages.test.cjs tests/replacement-model.test.cjs tests/mock-round-edit.test.cjs
npm test
```

`npm test` 전체에는 별도로 보관하는 비공개 검수 자료를 요구하는 검사가 있을 수 있다. 해당 자료는 GitHub에 없다. 웹 소스의 비운영 번들 검사는 `npx esbuild web-bank/app.js --bundle --format=esm --platform=browser --outfile=artifacts/recovery-app.js`로 수행할 수 있다. 정식 웹 빌드는 `node scripts/build-bank-web.cjs config/public-bank.json artifacts/web`이고 데스크톱 빌드는 `npm run package`이다. Python 출력 엔진 및 vendor/codex-runtime 준비 방법은 기존 빌드 문서를 함께 따른다.

## 이력의 보존 범위와 배포 보호

기존 Git 이력에는 `release/private-fixtures.json`에서 사용자 자료로 분류한 docx_qa_snapshot.json, docx_qa_sample.hwp 및 파생 출력물이 남아 있다. 요청된 개인정보 제외 정책에 따라 원래 PC의 Git 이력은 그대로 유지하고, 복구 저장소에는 최종 소스 tree가 동일한 새 루트 커밋을 사용한다. 과거 브랜치·태그의 위험한 조상 이력은 업로드하지 않는다. 원래 소스 HEAD와 복구 HEAD는 Release 설명에 각각 기록한다.

따라서 기존 canonical.json에 기록된 과거 조상 커밋은 이 깨끗한 복구 이력에 없다. 정식 빌드·배포의 canonical 검사도 이를 이유로 중단한다. 이는 우회하지 않는다. 실제 운영 배포를 재개하기 전 오너가 Release의 source/tree/checksum 증거로 복구본을 확인하고 공식 기준을 새 PC에 명시적으로 설정해야 한다. 복구 시험은 이력 보호 검사를 임의 완화하지 않고 비운영 번들 및 합성 데이터 검사만 실행한다.

## bundle에서 복구

```powershell
git bundle verify repository.bundle
git clone repository.bundle restored
cd restored
git checkout <복구 태그>
git branch -a
git tag -n
```

bundle은 이 비공개 복구 저장소의 안전한 이력과 복구 태그를 포함한다. 원본 PC의 민감한 과거 이력을 담은 bundle은 업로드하지 않는다. `SHA256SUMS.txt`와 다운로드 파일의 `Get-FileHash -Algorithm SHA256` 값을 비교한다.

## 외부 서비스 재연결

- Supabase: 프로젝트 bjxxqdbftefughjkcrqj. 공개 연결은 config/public-bank.json 및 app/shared-bank-config.json. 서버의 SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY 등은 기존 보안 저장소에서 복구한다. Supabase CLI는 서버 관리에만 필요하며 복구 시험에서 db push를 실행하지 않는다.
- Cloudflare Pages/R2/Browser Run: 기존 계정 OAuth 또는 CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID와 서버 R2 자격정보는 기존 안전한 위치에서 복구한다. 실제 변수·바인딩 이름은 supabase/functions와 cloudflare 설정, docs/native-pdf-pipeline.md 및 저장소 문서를 확인한다. 비밀값은 GitHub에 없다.
- 웹 배포는 scripts/canonical-release.cjs deploy만 사용한다. 복구 저장소 Actions와 Pages는 비활성화한다. 이 저장소 push로 배포하지 않는다.
- 설치 ZIP의 사용자 데이터는 포함되지 않는다. 기존 사용자 프로필·대기열을 덮어쓰지 않고 정식 설치 경로로 복구한다.

## 포함 / 제외

포함: 현재 코드, 안전한 복구 이력과 태그, 전체 마이그레이션 SQL, 잠금 파일, 빌드·배포 설정, 비밀값 없는 설정 예시, Release의 최신 설치본.

제외: 운영 DB와 암호화 DB 백업, DB 복호화 키, R2 본문·민감한 목록, 실제 환경변수·토큰·쿠키, 회원 목록, 사용자 시험지·업로드 자료·운영 화면 캡처, 과거 사용자 검수 자료가 들어간 Git 이력.
