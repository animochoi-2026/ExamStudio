# 학교 지역 확인 서버 설정

Google Cloud Console에서 프로젝트를 선택하고 결제를 연결한 뒤 **Places API (New)**를 활성화합니다. API 키를 만들고 API 제한을 Places API (New)로 설정합니다. 키는 브라우저 설정, Git, 채팅에 넣지 않습니다.

Supabase 프로젝트의 Edge Functions → Secrets에 `GOOGLE_MAPS_API_KEY` 이름으로 등록합니다. 사용량 알림과 쿼터를 설정하세요. 서버 호출이므로 웹사이트 HTTP referrer 제한은 맞지 않습니다. 고정 서버 IP가 확보된 환경에서만 IP 제한을 사용할 수 있습니다.

키가 없으면 지역 자동 확인은 실행할 수 없습니다. 기존 학교 이름이나 학교 키를 지역 문자열로 수정하지 않습니다. 지역 미확인 상태로 유지하며 관리자가 확인한 주소를 직접 저장할 수 있습니다. 등록된 학교 목록을 볼 때 외부 API는 호출하지 않습니다.

학교 위치는 `bank_school_regions`에 별도로 보관합니다. 기존 학교 키와 기존 문항·시험지 연결은 그대로 유지합니다. 같은 이름이 여러 후보로 나오는 경우 자동으로 첫 후보를 선택하지 않습니다.

신규 데스크톱 업로드의 commit은 `bank-registration`을 사용합니다. 이 작은 함수는 Auth 사용자와 commit 소유자를 확인한 뒤 기존 `bank-verify`가 파일·revision을 검증하고 등록하도록 요청합니다. 등록 성공 후 `EdgeRuntime.waitUntil`에서 Google REST 조회와 기존 CAS 저장 함수를 실행하므로 지역 조회 지연이나 실패가 성공한 문항을 업로드 실패로 바꾸지 않습니다. 파일·이미지 자체의 업로드 검증은 기존 경로를 유지합니다.

Google SDK나 이미지 디코더는 새 함수에 포함하지 않습니다. 배포는 `supabase functions deploy bank-registration --project-ref <프로젝트> --use-api`로 이 함수만 진행합니다. `bank-verify`의 15,447,097바이트 WASM과 기존 서버 버전은 그대로 둡니다. 인증, 다른 업로더 거부, verifier 충돌, 외부 API 실패, 학교별 일회 조회/CAS는 `school-registration-handler.test.cjs`와 `school-registration.test.cjs`에서 확인합니다.
