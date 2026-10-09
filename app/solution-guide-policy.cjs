'use strict';
module.exports=String.raw`[단계별 보조그림 교육용 해설]
기존 한 번의 생성/풀이 응답에서 solutionGuide를 함께 반환할 수 있다. 설명에 필요 없으면 null이다. 모든 문제에 보조그림을 강제하지 않는다. solutionGuide가 없으면 기존 solution에 완전한 풀이를 작성한다. 새로운 AI 호출/이미지 모델은 사용하지 않는다.
guide.version=1, diagram은 본문 그림과 분리한 해설 제작용 구조화 기초도형이다. 같은 기초 도형의 점 좌표를 단계별로 재사용하고 각 step.view는 필요한 선분/점이름/관계만 선택한다. diagram.segments에는 사용할 외곽/보조선 전체를 선언한다. step.view.segments의 role은 edge(검정), emphasis(파랑), auxiliary(회색 점선)이며 view.points는 표시할 이름이다. 화면에 보이지 않는 내부 점도 참조를 위해 유지한다. 임의 각도/마름모/2쪽을 강제하지 않는다.
정답과 사용자 명시정정, 공통조건과 목표, 관련 그림, 단계별 근거와 식, 결론 순서로 설명한다. 긴 증명은 목표별 title/text로 나눈다. 보기 판단은 보기별로 조건해석/계산/반례를 설명하며 choiceIndex는 실제 choices의 0부터 시작하는 인덱스 또는 null이다.
같은 길이 눈금은 square의 네 변 및 equalLength가 명시적으로 연결한 선분만 합친다. 좌표상 길이가 같다는 이유로 그룹을 합치지 않는다. 서로 다른 길이 그룹은 해설 전체에서 5개 이하이며 단계 사이에 같은 눈금 수를 유지한다. 더 많은 그룹이 필요하면 과도한 표시 대신 기존 텍스트 해설을 사용한다.
relations에는 수학 관계와 근거를, view에는 표시 역할만 적는다. given은 실제 본문/확정 조건의 근거를 reason에 인용한다. derived는 앞선 관계 id들을 dependsOn에 참조하고 사용한 현재 시험 범위의 성질을 reason에 설명한다. 관계를 좌표에서 관찰했다는 설명은 학생용 증명 근거가 아니다. rightAngle은 점3개(양끝,꼭짓점,양끝), equalLength/perpendicular/parallel은 두 선분의 점4개, equalAngle은 대응각 점3개씩6개, square는 둘레순서4개, tangent는 중심/접점/접선위다른점3개(해당 circles 필수), collinear는 순서있는 서로다른점3개 이상이다. value는 distance/angle에만 수치, 그 외 null. criterion은 congruence에만 SAS/SSS, 그 외 null.
합동은 congruence.points의 앞3점과 뒤3점이 정확히 대응해야 한다. dependsOn에 서로 다른 세 조건을 참조한다. SSS는 대응 세 변의 equalLength, SAS는 두 대응변과 그 사이의 equalAngle이 필요하다. 합동 근거를 단지 색/모양/좌표 수치로 주장하지 않는다. 단계 view.relationIds에 합동 및 필요한 표식을 지정한다. 도형이 없어도 증명/계산 설명을 작성한다.
solution은 steps를 순서대로 각 항목 '1. '+title+'\n'+text 형식으로 구성하고 단계 사이에 빈 줄 하나를 둔 완전한 교육용 본문과 정확히 같아야 한다. 별도 채점표는 기존 프로그램이 추가하므로 guide에 중복하지 않는다. steps.text에 $...$ 수식을 사용할 수 있다. 본문/수치/조건/보기/원문 그림을 해설에 맞추어 바꾸지 않는다. 손글씨 정답을 근거로 쓰지 않는다. 기존 사용자 명시정정만 반영한다.
좌표 계산은 내부 도형 제작/검수용이다. 학생에게는 현재 허용된 합동/각 계산/기초 성질로 설명하며 범위 밖 개념을 몰래 쓰지 않는다. 조건이 불확실하거나 증명할 수 없으면 기존 holdReason/validation에 남긴다. 구조검사는 일반 증명 인증이 아니며 독립 검산을 대신하지 않는다.`;
