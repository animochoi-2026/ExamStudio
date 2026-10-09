# 문제공방 (ExamStudio)

공동 문제은행, 시험지 자동 구성, DOCX·PDF·HWPX 출력을 제공하는 Windows 앱과 웹입니다.

- [운영 웹](https://examstudio-shared-bank.pages.dev/)
- [공식 Release](https://github.com/animochoi-2026/ExamStudio/releases/tag/v0.4.21)
- [기준 소스·빌드·배포·복구 안내](release/README.md)
- [공유 문제은행 설정](SHARED-BANK-SETUP.md)

현재 공식 버전은 **0.4.21**입니다. 이 저장소 루트가 웹·데스크톱의 canonical source입니다.
`release/stable.json`이 실제 운영 웹과 실행 앱의 파일 해시를 기록합니다.
사용자 데이터·프로필·인증 정보는 공개 저장소와 배포 ZIP에 포함하지 않습니다.

개발 준비: `npm ci`, 앱 실행: `npm start`. 일반 개발 검사는 `npm test`를 사용합니다.
운영 자료에서 캡처한 비공개 회귀 입력은 공개 저장소에 포함하지 않으므로 해당 검사는 `release/private-fixtures.json`의 로컬 자료가 필요합니다.

기존 앱을 업데이트할 때에는 데이터 경로를 유지하고, 실행 중인 작업을 강제 종료하지 마세요.
