(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ExamCurriculum=api;})(globalThis,()=>{
'use strict';
// Transcribed from the three user-supplied 2022-revision middle-school TOCs.
// The persisted evidence schema remains backward compatible with the deployed RPC.
// Catalog identity is separate from that historical wire-format name.
const version='middle-school-2022-v1';
const catalogVersion='school-math-2022-v2';
const legacyVersions=['middle-school-2022-v1'];
const tree=[
 {
  "id": "m1",
  "title": "중1",
  "children": [
   {
    "id": "m1-s1",
    "title": "1학기",
    "children": [
     {
      "id": "m1-u1",
      "title": "소인수분해",
      "domain": "integer",
      "children": [
       {
        "id": "m1-1.1",
        "title": "소수와 합성수",
        "concepts": [
         "소수",
         "합성수",
         "1의 분류"
        ]
       },
       {
        "id": "m1-1.2",
        "title": "거듭제곱",
        "concepts": [
         "밑",
         "지수",
         "거듭제곱의 표현"
        ]
       },
       {
        "id": "m1-1.3",
        "title": "소인수분해",
        "concepts": [
         "소인수",
         "소인수분해",
         "소인수분해를 이용한 약수와 약수의 개수"
        ]
       },
       {
        "id": "m1-1.4",
        "title": "최대공약수",
        "concepts": [
         "공약수",
         "최대공약수",
         "서로소",
         "소인수분해로 최대공약수 구하기"
        ]
       },
       {
        "id": "m1-1.5",
        "title": "최소공배수",
        "concepts": [
         "공배수",
         "최소공배수",
         "소인수분해로 최소공배수 구하기"
        ]
       },
       {
        "id": "m1-1.6",
        "title": "최대공약수와 최소공배수의 관계",
        "concepts": [
         "두 자연수의 곱과 최대공약수·최소공배수"
        ]
       }
      ]
     },
     {
      "id": "m1-u2",
      "title": "정수와 유리수",
      "domain": "integer",
      "children": [
       {
        "id": "m1-2.1",
        "title": "양수와 음수, 정수와 유리수",
        "concepts": [
         "양수",
         "음수",
         "정수",
         "유리수",
         "정수와 유리수의 분류"
        ]
       },
       {
        "id": "m1-2.2",
        "title": "수직선과 절댓값",
        "concepts": [
         "수직선 위의 수",
         "절댓값"
        ]
       },
       {
        "id": "m1-2.3",
        "title": "정수와 유리수의 대소 관계",
        "concepts": [
         "수직선과 수의 대소",
         "부등호"
        ]
       },
       {
        "id": "m1-2.4",
        "title": "정수와 유리수의 덧셈",
        "concepts": [
         "같은 부호의 덧셈",
         "다른 부호의 덧셈",
         "덧셈의 교환법칙",
         "결합법칙"
        ]
       },
       {
        "id": "m1-2.5",
        "title": "정수와 유리수의 뺄셈",
        "concepts": [
         "뺄셈을 덧셈으로 바꾸기",
         "덧셈과 뺄셈의 혼합계산"
        ]
       },
       {
        "id": "m1-2.6",
        "title": "정수와 유리수의 곱셈",
        "concepts": [
         "부호와 곱셈",
         "거듭제곱의 계산",
         "곱셈의 교환법칙",
         "결합법칙",
         "분배법칙"
        ]
       },
       {
        "id": "m1-2.7",
        "title": "정수와 유리수의 나눗셈·혼합계산",
        "concepts": [
         "역수",
         "나눗셈을 곱셈으로 바꾸기",
         "사칙계산의 순서",
         "괄호가 있는 식의 계산"
        ]
       }
      ]
     },
     {
      "id": "m1-u3",
      "title": "문자의 사용과 식의 계산",
      "domain": "algebra",
      "children": [
       {
        "id": "m1-3.1",
        "title": "문자를 사용한 식",
        "concepts": [
         "곱셈·나눗셈 기호의 생략",
         "수량 사이의 관계를 식으로 나타내기"
        ]
       },
       {
        "id": "m1-3.2",
        "title": "식의 값",
        "concepts": [
         "대입",
         "식의 값 구하기"
        ]
       },
       {
        "id": "m1-3.3",
        "title": "다항식과 일차식",
        "concepts": [
         "항",
         "상수항",
         "계수",
         "차수",
         "단항식",
         "다항식",
         "일차식"
        ]
       },
       {
        "id": "m1-3.4",
        "title": "일차식의 계산",
        "concepts": [
         "일차식과 수의 곱셈·나눗셈",
         "동류항",
         "일차식의 덧셈·뺄셈"
        ]
       }
      ]
     },
     {
      "id": "m1-u4",
      "title": "일차방정식",
      "domain": "algebra",
      "children": [
       {
        "id": "m1-4.1",
        "title": "방정식과 그 해",
        "concepts": [
         "등식",
         "좌변",
         "우변",
         "양변",
         "방정식",
         "미지수",
         "해(근)",
         "항등식"
        ]
       },
       {
        "id": "m1-4.2",
        "title": "등식의 성질",
        "concepts": [
         "양변의 덧셈·뺄셈·곱셈·나눗셈"
        ]
       },
       {
        "id": "m1-4.3",
        "title": "일차방정식의 풀이",
        "concepts": [
         "이항",
         "일차방정식의 풀이 과정"
        ]
       },
       {
        "id": "m1-4.4",
        "title": "여러 가지 일차방정식",
        "concepts": [
         "괄호가 있는 일차방정식",
         "소수·분수 계수의 일차방정식"
        ]
       },
       {
        "id": "m1-4.5",
        "title": "일차방정식의 활용",
        "concepts": [
         "수량",
         "가격",
         "거리·속력·시간",
         "농도",
         "방정식 세우기",
         "구한 해의 적합성 확인"
        ]
       }
      ]
     },
     {
      "id": "m1-u5",
      "title": "좌표평면과 그래프",
      "domain": "algebra",
      "children": [
       {
        "id": "m1-5.1",
        "title": "순서쌍과 좌표",
        "concepts": [
         "순서쌍",
         "x좌표",
         "y좌표"
        ]
       },
       {
        "id": "m1-5.2",
        "title": "좌표평면",
        "concepts": [
         "원점",
         "좌표축",
         "사분면",
         "좌표평면 위에 점 나타내기"
        ]
       },
       {
        "id": "m1-5.3",
        "title": "그래프와 그 해석",
        "concepts": [
         "그래프 나타내기",
         "증가와 감소",
         "주기적 변화",
         "상황과 그래프의 연결"
        ]
       },
       {
        "id": "m1-5.4",
        "title": "정비례",
        "concepts": [
         "정비례 관계",
         "정비례 관계의 표·식·그래프"
        ]
       },
       {
        "id": "m1-5.5",
        "title": "반비례",
        "concepts": [
         "반비례 관계",
         "반비례 관계의 표·식·그래프"
        ]
       },
       {
        "id": "m1-5.6",
        "title": "정비례와 반비례의 활용",
        "concepts": [
         "실생활의 정비례·반비례 관계",
         "표·식·그래프의 해석"
        ]
       }
      ]
     }
    ]
   },
   {
    "id": "m1-s2",
    "title": "2학기",
    "children": [
     {
      "id": "m1-u6",
      "title": "기본 도형",
      "domain": "geometry",
      "children": [
       {
        "id": "m1-6.1",
        "title": "점, 선, 면",
        "concepts": [
         "점",
         "선",
         "면",
         "교점",
         "교선"
        ]
       },
       {
        "id": "m1-6.2",
        "title": "직선, 반직선, 선분",
        "concepts": [
         "직선",
         "반직선",
         "선분",
         "두 점 사이의 거리",
         "선분의 중점"
        ]
       },
       {
        "id": "m1-6.3",
        "title": "각",
        "concepts": [
         "예각",
         "직각",
         "둔각",
         "평각",
         "맞꼭지각의 성질",
         "각의 이등분"
        ]
       },
       {
        "id": "m1-6.4",
        "title": "수직과 수선",
        "concepts": [
         "수직",
         "수선",
         "수선의 발",
         "점과 직선 사이의 거리"
        ]
       },
       {
        "id": "m1-6.5",
        "title": "점, 직선, 평면의 위치 관계",
        "concepts": [
         "평면과 공간에서의 위치 관계",
         "평행",
         "교차",
         "꼬인 위치"
        ]
       },
       {
        "id": "m1-6.6",
        "title": "평행선의 성질",
        "concepts": [
         "동위각",
         "엇각",
         "평행선에서의 각",
         "두 직선이 평행할 조건"
        ]
       }
      ]
     },
     {
      "id": "m1-u7",
      "title": "작도와 합동",
      "domain": "geometry",
      "children": [
       {
        "id": "m1-7.1",
        "title": "기본 작도",
        "concepts": [
         "눈금 없는 자",
         "컴퍼스",
         "같은 길이의 선분 작도",
         "같은 크기의 각 작도"
        ]
       },
       {
        "id": "m1-7.2",
        "title": "삼각형의 작도",
        "concepts": [
         "삼각형의 세 변의 길이 관계",
         "주어진 변과 각에 따른 삼각형의 작도"
        ]
       },
       {
        "id": "m1-7.3",
        "title": "삼각형의 합동 조건",
        "concepts": [
         "합동",
         "대응점",
         "대응변",
         "대응각",
         "SSS 합동",
         "SAS 합동",
         "ASA 합동"
        ]
       }
      ]
     },
     {
      "id": "m1-u8",
      "title": "평면도형의 성질",
      "domain": "geometry",
      "children": [
       {
        "id": "m1-8.1",
        "title": "다각형과 대각선",
        "concepts": [
         "다각형",
         "정다각형",
         "대각선",
         "다각형의 대각선의 개수 공식"
        ]
       },
       {
        "id": "m1-8.2",
        "title": "삼각형의 내각과 외각",
        "concepts": [
         "삼각형의 내각의 합",
         "한 외각의 성질"
        ]
       },
       {
        "id": "m1-8.3",
        "title": "다각형의 내각과 외각",
        "concepts": [
         "내각의 크기의 합",
         "외각의 크기의 합",
         "정다각형의 한 내각과 한 외각"
        ]
       },
       {
        "id": "m1-8.4",
        "title": "원과 부채꼴",
        "concepts": [
         "호",
         "현",
         "중심각",
         "부채꼴",
         "활꼴",
         "중심각과 호의 길이·넓이의 관계"
        ]
       },
       {
        "id": "m1-8.5",
        "title": "부채꼴의 호의 길이와 넓이",
        "concepts": [
         "원의 둘레와 넓이",
         "부채꼴의 호의 길이 공식",
         "넓이 공식"
        ]
       }
      ]
     },
     {
      "id": "m1-u9",
      "title": "입체도형의 성질",
      "domain": "geometry",
      "children": [
       {
        "id": "m1-9.1",
        "title": "다면체",
        "concepts": [
         "면",
         "모서리",
         "꼭짓점",
         "각기둥",
         "각뿔",
         "각뿔대"
        ]
       },
       {
        "id": "m1-9.2",
        "title": "정다면체",
        "concepts": [
         "정다면체의 뜻",
         "다섯 가지 정다면체",
         "면·모서리·꼭짓점의 개수"
        ]
       },
       {
        "id": "m1-9.3",
        "title": "회전체",
        "concepts": [
         "회전축",
         "원기둥",
         "원뿔",
         "구"
        ]
       },
       {
        "id": "m1-9.4",
        "title": "회전체의 단면과 전개도",
        "concepts": [
         "회전축을 포함하는 단면",
         "수직인 단면",
         "원기둥과 원뿔의 전개도"
        ]
       },
       {
        "id": "m1-9.5",
        "title": "기둥의 겉넓이와 부피",
        "concepts": [
         "각기둥",
         "원기둥의 겉넓이·부피 공식"
        ]
       },
       {
        "id": "m1-9.6",
        "title": "뿔의 겉넓이와 부피",
        "concepts": [
         "각뿔",
         "원뿔의 겉넓이·부피 공식",
         "원뿔의 모선",
         "옆면의 부채꼴"
        ]
       },
       {
        "id": "m1-9.7",
        "title": "구의 겉넓이와 부피",
        "concepts": [
         "구의 겉넓이 공식",
         "부피 공식"
        ]
       }
      ]
     },
     {
      "id": "m1-u10",
      "title": "자료의 정리와 해석",
      "domain": "combinatorics",
      "children": [
       {
        "id": "m1-10.1",
        "title": "대푯값",
        "concepts": [
         "평균",
         "중앙값",
         "최빈값"
        ]
       },
       {
        "id": "m1-10.2",
        "title": "적절한 대푯값의 선택",
        "concepts": [
         "자료의 특성",
         "대푯값의 비교와 선택"
        ]
       },
       {
        "id": "m1-10.3",
        "title": "줄기와 잎 그림",
        "concepts": [
         "줄기",
         "잎",
         "자료의 분포와 해석"
        ]
       },
       {
        "id": "m1-10.4",
        "title": "도수분포표",
        "concepts": [
         "변량",
         "계급",
         "계급의 크기",
         "도수",
         "계급값",
         "도수분포표의 작성과 해석"
        ]
       },
       {
        "id": "m1-10.5",
        "title": "히스토그램과 도수분포다각형",
        "concepts": [
         "히스토그램",
         "도수분포다각형",
         "그래프의 작성",
         "자료의 분포 비교"
        ]
       },
       {
        "id": "m1-10.6",
        "title": "상대도수",
        "concepts": [
         "상대도수의 계산",
         "상대도수의 총합",
         "상대도수의 표·그래프",
         "두 집단의 비교"
        ]
       },
       {
        "id": "m1-10.7",
        "title": "통계적 탐구",
        "concepts": [
         "문제 설정",
         "자료 수집",
         "분석",
         "결과 해석",
         "공학 도구를 이용한 통계적 탐구"
        ]
       }
      ]
     }
    ]
   }
  ]
 },
 {
  "id": "m2",
  "title": "중2",
  "children": [
   {
    "id": "m2-s1",
    "title": "1학기",
    "children": [
     {
      "id": "m2-u1",
      "title": "유리수와 순환소수",
      "domain": "integer",
      "children": [
       {
        "id": "m2-1.1",
        "title": "유리수와 순환소수",
        "concepts": [
         "유리수의 소수 표현",
         "유한소수와 무한소수",
         "순환소수",
         "순환마디",
         "유한소수의 판별"
        ]
       },
       {
        "id": "m2-1.2",
        "title": "순환소수의 분수 표현",
        "concepts": [
         "순환소수를 분수로 나타내기",
         "유리수와 유한소수·순환소수의 관계"
        ]
       }
      ]
     },
     {
      "id": "m2-u2",
      "title": "식의 계산",
      "domain": "algebra",
      "children": [
       {
        "id": "m2-2.1",
        "title": "지수법칙",
        "concepts": [
         "거듭제곱의 곱셈",
         "거듭제곱의 거듭제곱",
         "거듭제곱의 나눗셈",
         "곱과 몫의 거듭제곱"
        ]
       },
       {
        "id": "m2-2.2",
        "title": "단항식의 곱셈과 나눗셈",
        "concepts": [
         "단항식의 곱셈",
         "나눗셈",
         "혼합계산"
        ]
       },
       {
        "id": "m2-2.3",
        "title": "다항식의 덧셈과 뺄셈",
        "concepts": [
         "동류항의 계산",
         "괄호가 있는 식의 계산"
        ]
       },
       {
        "id": "m2-2.4",
        "title": "다항식과 단항식의 곱셈·나눗셈",
        "concepts": [
         "분배법칙",
         "단항식과 다항식의 혼합계산"
        ]
       },
       {
        "id": "m2-2.5",
        "title": "등식의 변형",
        "concepts": [
         "한 문자에 대하여 등식 정리하기"
        ]
       }
      ]
     },
     {
      "id": "m2-u3",
      "title": "일차부등식",
      "domain": "algebra",
      "children": [
       {
        "id": "m2-3.1",
        "title": "부등식과 그 해",
        "concepts": [
         "부등호",
         "부등식의 해",
         "수직선에 해 나타내기"
        ]
       },
       {
        "id": "m2-3.2",
        "title": "부등식의 성질",
        "concepts": [
         "양변의 덧셈·뺄셈·곱셈·나눗셈",
         "음수의 곱셈·나눗셈과 부등호의 방향"
        ]
       },
       {
        "id": "m2-3.3",
        "title": "일차부등식의 풀이",
        "concepts": [
         "이항",
         "괄호가 있는 일차부등식",
         "소수·분수 계수의 일차부등식"
        ]
       },
       {
        "id": "m2-3.4",
        "title": "일차부등식의 활용",
        "concepts": [
         "수량",
         "가격",
         "거리·속력·시간",
         "농도"
        ]
       }
      ]
     },
     {
      "id": "m2-u4",
      "title": "연립일차방정식",
      "domain": "algebra",
      "children": [
       {
        "id": "m2-4.1",
        "title": "미지수가 2개인 일차방정식",
        "concepts": [
         "일차방정식의 뜻",
         "일차방정식의 해"
        ]
       },
       {
        "id": "m2-4.2",
        "title": "미지수가 2개인 연립일차방정식",
        "concepts": [
         "연립일차방정식의 뜻",
         "공통인 해"
        ]
       },
       {
        "id": "m2-4.3",
        "title": "연립일차방정식의 풀이",
        "concepts": [
         "대입법",
         "가감법"
        ]
       },
       {
        "id": "m2-4.4",
        "title": "여러 가지 연립일차방정식",
        "concepts": [
         "소수·분수 계수의 연립일차방정식",
         "해가 없는 경우",
         "해가 무수히 많은 경우"
        ]
       },
       {
        "id": "m2-4.5",
        "title": "연립일차방정식의 활용",
        "concepts": [
         "수량",
         "가격",
         "거리·속력·시간",
         "농도"
        ]
       }
      ]
     },
     {
      "id": "m2-u5",
      "title": "일차함수",
      "domain": "algebra",
      "children": [
       {
        "id": "m2-5.1",
        "title": "함수와 함숫값",
        "concepts": [
         "변수",
         "함수",
         "함숫값"
        ]
       },
       {
        "id": "m2-5.2",
        "title": "일차함수의 뜻과 그래프",
        "concepts": [
         "일차함수",
         "그래프",
         "평행이동"
        ]
       },
       {
        "id": "m2-5.3",
        "title": "일차함수의 그래프의 절편",
        "concepts": [
         "x절편",
         "y절편"
        ]
       },
       {
        "id": "m2-5.4",
        "title": "일차함수의 그래프의 기울기",
        "concepts": [
         "기울기의 뜻",
         "기울기 구하기"
        ]
       },
       {
        "id": "m2-5.5",
        "title": "일차함수의 그래프의 성질",
        "concepts": [
         "증가와 감소",
         "지나는 사분면",
         "두 그래프의 평행",
         "두 그래프의 일치"
        ]
       },
       {
        "id": "m2-5.6",
        "title": "일차함수의 식 구하기",
        "concepts": [
         "기울기와 한 점",
         "서로 다른 두 점",
         "두 절편을 이용한 식 구하기"
        ]
       },
       {
        "id": "m2-5.7",
        "title": "일차함수의 활용",
        "concepts": [
         "실생활 관계의 식",
         "그래프의 해석"
        ]
       },
       {
        "id": "m2-5.8",
        "title": "일차함수와 일차방정식의 관계",
        "concepts": [
         "미지수가 2개인 일차방정식의 그래프",
         "좌표축에 평행한 직선"
        ]
       },
       {
        "id": "m2-5.9",
        "title": "일차함수의 그래프와 연립일차방정식",
        "concepts": [
         "두 직선의 교점",
         "연립일차방정식의 해"
        ]
       }
      ]
     }
    ]
   },
   {
    "id": "m2-s2",
    "title": "2학기",
    "children": [
     {
      "id": "m2-u6",
      "title": "삼각형의 성질",
      "domain": "geometry",
      "children": [
       {
        "id": "m2-6.1",
        "title": "이등변삼각형의 성질",
        "concepts": [
         "두 밑각의 성질",
         "꼭지각의 이등분선",
         "이등변삼각형이 되는 조건"
        ]
       },
       {
        "id": "m2-6.2",
        "title": "직각삼각형의 합동",
        "concepts": [
         "RHA 합동",
         "RHS 합동",
         "각의 이등분선의 성질"
        ]
       },
       {
        "id": "m2-6.3",
        "title": "삼각형의 외심",
        "concepts": [
         "외접원",
         "외심",
         "수직이등분선의 성질",
         "외심의 위치",
         "외심과 각도 관계",
         "직각삼각형의 외심과 외접원의 반지름"
        ]
       },
       {
        "id": "m2-6.4",
        "title": "삼각형의 내심",
        "concepts": [
         "내접원",
         "내심",
         "세 내각의 이등분선",
         "내심과 각도 관계",
         "접점까지의 길이",
         "내접원의 반지름과 삼각형의 넓이"
        ]
       }
      ]
     },
     {
      "id": "m2-u7",
      "title": "사각형의 성질",
      "domain": "geometry",
      "children": [
       {
        "id": "m2-7.1",
        "title": "평행사변형의 성질",
        "concepts": [
         "대변",
         "대각",
         "대각선의 성질"
        ]
       },
       {
        "id": "m2-7.2",
        "title": "평행사변형이 되는 조건",
        "concepts": [
         "평행사변형의 판정 조건"
        ]
       },
       {
        "id": "m2-7.3",
        "title": "직사각형의 성질",
        "concepts": [
         "직사각형의 대각선",
         "직사각형이 되는 조건"
        ]
       },
       {
        "id": "m2-7.4",
        "title": "마름모의 성질",
        "concepts": [
         "마름모의 대각선",
         "마름모가 되는 조건"
        ]
       },
       {
        "id": "m2-7.5",
        "title": "정사각형의 성질",
        "concepts": [
         "정사각형의 대각선",
         "정사각형이 되는 조건"
        ]
       },
       {
        "id": "m2-7.6",
        "title": "사다리꼴과 등변사다리꼴",
        "concepts": [
         "등변사다리꼴의 밑각과 대각선의 성질"
        ]
       },
       {
        "id": "m2-7.7",
        "title": "여러 가지 사각형 사이의 관계",
        "concepts": [
         "사각형 사이의 포함 관계"
        ]
       },
       {
        "id": "m2-7.8",
        "title": "평행선과 넓이",
        "concepts": [
         "평행선 사이의 거리",
         "높이가 같은 삼각형",
         "밑변의 길이의 비와 넓이의 비"
        ]
       }
      ]
     },
     {
      "id": "m2-u8",
      "title": "도형의 닮음",
      "domain": "geometry",
      "children": [
       {
        "id": "m2-8.1",
        "title": "닮은 도형과 닮음비",
        "concepts": [
         "대응점",
         "대응변",
         "대응각",
         "닮음비"
        ]
       },
       {
        "id": "m2-8.2",
        "title": "삼각형의 닮음 조건",
        "concepts": [
         "SSS 닮음",
         "SAS 닮음",
         "AA 닮음"
        ]
       },
       {
        "id": "m2-8.3",
        "title": "닮음의 활용",
        "concepts": [
         "직각삼각형의 닮음",
         "길이 구하기",
         "닮음비와 넓이의 비·부피의 비 [활용]"
        ]
       },
       {
        "id": "m2-8.4",
        "title": "삼각형과 평행선",
        "concepts": [
         "삼각형에서 평행선과 선분의 길이의 비",
         "선분의 길이의 비와 평행 조건"
        ]
       },
       {
        "id": "m2-8.5",
        "title": "평행선 사이의 선분의 길이의 비",
        "concepts": [
         "여러 평행선과 두 직선이 만드는 선분의 비"
        ]
       },
       {
        "id": "m2-8.6",
        "title": "삼각형의 중점 연결 정리",
        "concepts": [
         "두 변의 중점을 이은 선분의 평행·길이 관계"
        ]
       },
       {
        "id": "m2-8.7",
        "title": "삼각형의 무게중심",
        "concepts": [
         "중선",
         "무게중심",
         "중선의 분할비",
         "중선과 무게중심을 이용한 넓이 관계"
        ]
       }
      ]
     },
     {
      "id": "m2-u9",
      "title": "피타고라스 정리",
      "domain": "geometry",
      "children": [
       {
        "id": "m2-9.1",
        "title": "피타고라스 정리",
        "concepts": [
         "직각삼각형의 세 변 사이의 관계"
        ]
       },
       {
        "id": "m2-9.2",
        "title": "피타고라스 정리의 역",
        "concepts": [
         "세 변의 길이를 이용한 직각삼각형의 판별"
        ]
       },
       {
        "id": "m2-9.3",
        "title": "피타고라스 정리의 활용",
        "concepts": [
         "선분의 길이",
         "도형의 넓이 구하기"
        ]
       }
      ]
     },
     {
      "id": "m2-u10",
      "title": "경우의 수와 확률",
      "domain": "combinatorics",
      "children": [
       {
        "id": "m2-10.1",
        "title": "경우의 수",
        "concepts": [
         "사건",
         "경우의 수",
         "표와 나뭇가지 그림",
         "경우의 수의 덧셈",
         "경우의 수의 곱셈"
        ]
       },
       {
        "id": "m2-10.2",
        "title": "여러 가지 경우의 수",
        "concepts": [
         "순서대로 나열하기",
         "대표 뽑기"
        ]
       },
       {
        "id": "m2-10.3",
        "title": "확률의 뜻과 성질",
        "concepts": [
         "확률의 뜻",
         "확률 구하기",
         "확률의 범위"
        ]
       },
       {
        "id": "m2-10.4",
        "title": "확률의 계산",
        "concepts": [
         "일어나지 않을 확률",
         "적어도 한 번의 확률",
         "둘 중 하나가 일어날 확률",
         "동시에 일어날 확률",
         "연달아 일어날 확률"
        ]
       }
      ]
     }
    ]
   }
  ]
 },
 {
  "id": "m3",
  "title": "중3",
  "children": [
   {
    "id": "m3-s1",
    "title": "1학기",
    "children": [
     {
      "id": "m3-u1",
      "title": "제곱근과 실수",
      "domain": "algebra",
      "children": [
       {
        "id": "m3-1.1",
        "title": "제곱근의 뜻과 성질",
        "concepts": [
         "제곱근",
         "양의 제곱근",
         "음의 제곱근",
         "근호",
         "제곱근과 제곱의 관계"
        ]
       },
       {
        "id": "m3-1.2",
        "title": "제곱근의 대소 관계",
        "concepts": [
         "제곱근의 크기 비교",
         "제곱근의 값 구하기"
        ]
       },
       {
        "id": "m3-1.3",
        "title": "무리수와 실수",
        "concepts": [
         "무리수",
         "실수",
         "실수의 분류",
         "유리수와 무리수의 소수 표현"
        ]
       },
       {
        "id": "m3-1.4",
        "title": "실수의 대소 관계",
        "concepts": [
         "수직선 위의 실수",
         "실수의 크기 비교"
        ]
       },
       {
        "id": "m3-1.5",
        "title": "제곱근의 곱셈과 나눗셈",
        "concepts": [
         "근호 안과 밖의 수의 변형",
         "제곱근의 곱셈·나눗셈"
        ]
       },
       {
        "id": "m3-1.6",
        "title": "분모의 유리화",
        "concepts": [
         "분모의 근호를 없애는 식의 변형"
        ]
       },
       {
        "id": "m3-1.7",
        "title": "제곱근의 덧셈과 뺄셈",
        "concepts": [
         "근호 안의 수가 같은 항의 계산"
        ]
       },
       {
        "id": "m3-1.8",
        "title": "근호를 포함한 식의 혼합계산",
        "concepts": [
         "분배법칙",
         "괄호가 있는 식의 계산"
        ]
       }
      ]
     },
     {
      "id": "m3-u2",
      "title": "다항식의 곱셈과 인수분해",
      "domain": "algebra",
      "children": [
       {
        "id": "m3-2.1",
        "title": "다항식의 곱셈",
        "concepts": [
         "전개",
         "분배법칙"
        ]
       },
       {
        "id": "m3-2.2",
        "title": "곱셈 공식",
        "concepts": [
         "합의 제곱",
         "차의 제곱",
         "합과 차의 곱",
         "두 일차식의 곱셈 공식"
        ]
       },
       {
        "id": "m3-2.3",
        "title": "곱셈 공식의 활용",
        "concepts": [
         "수의 계산",
         "식의 값 구하기"
        ]
       },
       {
        "id": "m3-2.4",
        "title": "인수분해의 뜻",
        "concepts": [
         "인수",
         "인수분해",
         "공통인수",
         "전개와 인수분해의 관계"
        ]
       },
       {
        "id": "m3-2.5",
        "title": "인수분해 공식",
        "concepts": [
         "완전제곱식",
         "두 제곱의 차",
         "이차식의 인수분해 공식"
        ]
       },
       {
        "id": "m3-2.6",
        "title": "여러 가지 인수분해",
        "concepts": [
         "공통부분의 치환",
         "항의 묶음"
        ]
       },
       {
        "id": "m3-2.7",
        "title": "인수분해의 활용",
        "concepts": [
         "수의 계산",
         "식의 값 구하기"
        ]
       }
      ]
     },
     {
      "id": "m3-u3",
      "title": "이차방정식",
      "domain": "algebra",
      "children": [
       {
        "id": "m3-3.1",
        "title": "이차방정식과 그 해",
        "concepts": [
         "이차방정식",
         "해(근)",
         "중근"
        ]
       },
       {
        "id": "m3-3.2",
        "title": "인수분해를 이용한 풀이",
        "concepts": [
         "곱이 0인 경우",
         "인수분해로 근 구하기"
        ]
       },
       {
        "id": "m3-3.3",
        "title": "제곱근을 이용한 풀이",
        "concepts": [
         "제곱근을 이용한 해 구하기"
        ]
       },
       {
        "id": "m3-3.4",
        "title": "완전제곱식을 이용한 풀이",
        "concepts": [
         "완전제곱식으로 고쳐 풀기"
        ]
       },
       {
        "id": "m3-3.5",
        "title": "근의 공식",
        "concepts": [
         "근의 공식",
         "근의 공식의 유도"
        ]
       },
       {
        "id": "m3-3.6",
        "title": "여러 가지 이차방정식",
        "concepts": [
         "괄호가 있는 이차방정식",
         "소수·분수 계수의 이차방정식"
        ]
       },
       {
        "id": "m3-3.7",
        "title": "이차방정식의 활용",
        "concepts": [
         "수량",
         "도형의 넓이",
         "이동 상황",
         "방정식 세우기",
         "구한 해의 적합성 확인"
        ]
       }
      ]
     },
     {
      "id": "m3-u4",
      "title": "이차함수",
      "domain": "algebra",
      "children": [
       {
        "id": "m3-4.1",
        "title": "이차함수의 뜻",
        "concepts": [
         "이차함수",
         "함숫값"
        ]
       },
       {
        "id": "m3-4.2",
        "title": "이차함수의 기본 그래프",
        "concepts": [
         "y=ax²의 그래프",
         "포물선",
         "축",
         "꼭짓점",
         "계수와 그래프의 모양"
        ]
       },
       {
        "id": "m3-4.3",
        "title": "이차함수의 그래프의 평행이동",
        "concepts": [
         "위아래·좌우 평행이동",
         "y=a(x-p)²+q의 그래프"
        ]
       },
       {
        "id": "m3-4.4",
        "title": "이차함수의 일반형의 그래프",
        "concepts": [
         "y=ax²+bx+c의 그래프",
         "완전제곱식으로 변형",
         "축과 꼭짓점"
        ]
       },
       {
        "id": "m3-4.5",
        "title": "이차함수의 그래프의 성질",
        "concepts": [
         "증가와 감소",
         "좌표축과의 교점",
         "계수의 부호와 그래프의 위치"
        ]
       },
       {
        "id": "m3-4.6",
        "title": "이차함수의 최댓값과 최솟값",
        "concepts": [
         "꼭짓점과 최댓값·최솟값",
         "x의 범위가 실수 전체인 경우"
        ]
       },
       {
        "id": "m3-4.7",
        "title": "이차함수의 식 구하기",
        "concepts": [
         "꼭짓점과 한 점",
         "서로 다른 세 점"
        ]
       }
      ]
     }
    ]
   },
   {
    "id": "m3-s2",
    "title": "2학기",
    "children": [
     {
      "id": "m3-u5",
      "title": "삼각비",
      "domain": "geometry",
      "children": [
       {
        "id": "m3-5.1",
        "title": "삼각비의 뜻",
        "concepts": [
         "사인(sin)",
         "코사인(cos)",
         "탄젠트(tan)",
         "직각삼각형의 닮음과 삼각비"
        ]
       },
       {
        "id": "m3-5.2",
        "title": "특수한 각의 삼각비",
        "concepts": [
         "30°",
         "45°",
         "60°의 삼각비"
        ]
       },
       {
        "id": "m3-5.3",
        "title": "예각의 삼각비",
        "concepts": [
         "삼각비의 표",
         "공학 도구를 이용한 값 구하기"
        ]
       },
       {
        "id": "m3-5.4",
        "title": "0°와 90°의 삼각비",
        "concepts": [
         "0°와 90°의 사인·코사인",
         "0°의 탄젠트",
         "tan 90°는 정의되지 않음"
        ]
       },
       {
        "id": "m3-5.5",
        "title": "삼각비와 변의 길이",
        "concepts": [
         "직각삼각형의 변의 길이",
         "높이와 거리 구하기"
        ]
       },
       {
        "id": "m3-5.6",
        "title": "삼각비와 도형의 넓이",
        "concepts": [
         "삼각형의 넓이 공식",
         "사각형의 넓이 구하기"
        ]
       }
      ]
     },
     {
      "id": "m3-u6",
      "title": "원과 직선",
      "domain": "geometry",
      "children": [
       {
        "id": "m3-6.1",
        "title": "현의 수직이등분",
        "concepts": [
         "원과 현",
         "중심에서 현에 내린 수선",
         "현의 수직이등분선과 원의 중심"
        ]
       },
       {
        "id": "m3-6.2",
        "title": "현의 길이와 중심에서의 거리",
        "concepts": [
         "현의 길이와 중심에서 현까지의 거리 관계"
        ]
       },
       {
        "id": "m3-6.3",
        "title": "원의 접선",
        "concepts": [
         "접점",
         "접선",
         "반지름과 접선의 수직 관계"
        ]
       },
       {
        "id": "m3-6.4",
        "title": "접선의 길이의 성질",
        "concepts": [
         "원 밖의 한 점에서 그은 두 접선의 길이"
        ]
       },
       {
        "id": "m3-6.5",
        "title": "원에 외접하는 사각형",
        "concepts": [
         "내접원",
         "마주 보는 두 변의 길이의 합 [활용]"
        ]
       }
      ]
     },
     {
      "id": "m3-u7",
      "title": "원주각",
      "domain": "geometry",
      "children": [
       {
        "id": "m3-7.1",
        "title": "원주각과 중심각",
        "concepts": [
         "원주각",
         "같은 호에 대한 원주각",
         "원주각과 중심각의 관계",
         "반원의 원주각"
        ]
       },
       {
        "id": "m3-7.2",
        "title": "원주각과 호",
        "concepts": [
         "원주각의 크기와 호의 길이의 관계"
        ]
       },
       {
        "id": "m3-7.3",
        "title": "원에 내접하는 사각형",
        "concepts": [
         "대각의 크기의 합",
         "외각의 성질"
        ]
       },
       {
        "id": "m3-7.4",
        "title": "접선과 현이 이루는 각",
        "concepts": [
         "접선과 현 사이의 각",
         "원주각과의 관계"
        ]
       },
       {
        "id": "m3-7.5",
        "title": "원주각의 활용",
        "concepts": [
         "네 점이 한 원 위에 있을 조건",
         "원주각을 이용한 각·길이 구하기"
        ]
       }
      ]
     },
     {
      "id": "m3-u8",
      "title": "산포도, 상자그림과 산점도",
      "domain": "combinatorics",
      "children": [
       {
        "id": "m3-8.1",
        "title": "산포도와 편차",
        "concepts": [
         "산포도",
         "편차",
         "편차의 합"
        ]
       },
       {
        "id": "m3-8.2",
        "title": "분산과 표준편차",
        "concepts": [
         "분산",
         "표준편차의 계산 공식",
         "분산과 표준편차를 이용한 분포 비교"
        ]
       },
       {
        "id": "m3-8.3",
        "title": "사분위수",
        "concepts": [
         "제1사분위수",
         "제2사분위수",
         "제3사분위수",
         "최솟값",
         "최댓값",
         "중앙값"
        ]
       },
       {
        "id": "m3-8.4",
        "title": "상자그림",
        "concepts": [
         "상자그림의 작성과 해석",
         "공학 도구 활용",
         "다섯 수치 요약",
         "두 집단의 분포 비교"
        ]
       },
       {
        "id": "m3-8.5",
        "title": "산점도",
        "concepts": [
         "두 변량",
         "자료의 순서쌍",
         "산점도로 나타내기",
         "분포 해석"
        ]
       },
       {
        "id": "m3-8.6",
        "title": "상관관계",
        "concepts": [
         "양의 상관관계",
         "음의 상관관계",
         "상관관계가 없는 경우"
        ]
       }
      ]
     }
    ]
   }
  ]
 }
];
// 2022 MOE Notice 2022-33, Annex 8; source/progression notes: docs/curriculum-2022-extension.json
const elementaryChapters={"e5":[["자연수의 혼합 계산","integer","덧셈과 뺄셈의 혼합 계산","곱셈과 나눗셈의 혼합 계산","사칙 혼합 계산"],["약수와 배수","integer","약수와 배수","공약수와 최대공약수","공배수와 최소공배수"],["대응 관계","algebra","두 양 사이의 대응 관계","대응 관계를 식으로 나타내기"],["약분과 통분","algebra","크기가 같은 분수","약분","통분","분수의 크기 비교"],["분수의 덧셈과 뺄셈","algebra","분모가 다른 분수의 덧셈","분모가 다른 분수의 뺄셈"],["다각형의 둘레와 넓이","geometry","평면도형의 둘레","넓이의 단위","직사각형과 정사각형의 넓이","평행사변형과 삼각형의 넓이","마름모와 사다리꼴의 넓이"],["수의 범위와 어림하기","integer","이상과 이하, 초과와 미만","올림, 버림, 반올림"],["분수의 곱셈","algebra","분수와 자연수의 곱셈","분수와 분수의 곱셈"],["합동과 대칭","geometry","도형의 합동","선대칭도형","점대칭도형"],["소수의 곱셈","algebra","소수와 자연수의 곱셈","소수와 소수의 곱셈"],["직육면체","geometry","직육면체와 정육면체","직육면체의 겨냥도와 전개도"],["평균과 가능성","combinatorics","평균","일이 일어날 가능성"]],"e6":[["분수의 나눗셈","algebra","자연수의 나눗셈의 몫을 분수로 나타내기","분수를 자연수로 나누기"],["각기둥과 각뿔","geometry","각기둥","각기둥의 전개도","각뿔"],["소수의 나눗셈","algebra","소수를 자연수로 나누기","자연수의 나눗셈의 몫을 소수로 나타내기"],["비와 비율","algebra","비","비율","백분율"],["여러 가지 그래프","combinatorics","띠그래프","원그래프","자료에 알맞은 그래프"],["직육면체의 겉넓이와 부피","geometry","직육면체와 정육면체의 겉넓이","부피의 단위","직육면체와 정육면체의 부피"],["분수의 나눗셈","algebra","분수를 분수로 나누기","자연수를 분수로 나누기"],["소수의 나눗셈","algebra","소수를 소수로 나누기","자연수를 소수로 나누기"],["공간과 입체","geometry","쌓기나무의 개수","위, 앞, 옆에서 본 모양"],["비례식과 비례배분","algebra","비례식","비례배분"],["원의 둘레와 넓이","geometry","원주율","원의 둘레","원의 넓이"],["원기둥, 원뿔, 구","geometry","원기둥과 전개도","원뿔","구"]]};
const highCourses=[{"id":"common1","title":"공통수학1","category":"공통","requires":[],"chapters":[["다항식",["다항식의 연산","나머지정리","인수분해"]],["방정식과 부등식",["복소수와 이차방정식","이차방정식과 이차함수","여러 가지 방정식과 부등식"]],["경우의 수",["합의 법칙과 곱의 법칙","순열과 조합"]],["행렬",["행렬과 그 연산"]]]},{"id":"common2","title":"공통수학2","category":"공통","requires":["common1"],"chapters":[["도형의 방정식",["평면좌표","직선의 방정식","원의 방정식","도형의 이동"]],["집합과 명제",["집합","명제"]],["함수와 그래프",["함수","유리함수와 무리함수"]]]},{"id":"basic1","title":"기본수학1","category":"공통 대체","requires":[],"chapters":[["다항식",["다항식의 연산","인수분해"]],["방정식과 부등식",["이차방정식과 이차함수","부등식"]],["경우의 수",["합의 법칙과 곱의 법칙","순열과 조합"]],["행렬",["행렬과 그 연산"]]]},{"id":"basic2","title":"기본수학2","category":"공통 대체","requires":["basic1"],"chapters":[["도형의 방정식",["평면좌표","직선의 방정식","원의 방정식","도형의 이동"]],["집합과 명제",["집합","명제"]],["함수와 그래프",["함수","유리함수와 무리함수"]]]},{"id":"algebra","title":"대수","category":"일반 선택","requires":["common2"],"chapters":[["지수함수와 로그함수",["지수와 로그","지수함수와 로그함수"]],["삼각함수",["삼각함수","사인법칙과 코사인법칙"]],["수열",["등차수열과 등비수열","수열의 합","수학적 귀납법"]]]},{"id":"calculus1","title":"미적분Ⅰ","category":"일반 선택","requires":["common2"],"chapters":[["함수의 극한과 연속",["함수의 극한","함수의 연속"]],["미분",["미분계수","도함수","도함수의 활용"]],["적분",["부정적분","정적분","정적분의 활용"]]]},{"id":"probability","title":"확률과 통계","category":"일반 선택","requires":["common2"],"chapters":[["경우의 수",["순열과 조합","이항정리"]],["확률",["확률의 개념과 활용","조건부확률"]],["통계",["확률분포","통계적 추정"]]]},{"id":"calculus2","title":"미적분Ⅱ","category":"진로 선택","requires":["calculus1","algebra"],"chapters":[["수열의 극한",["수열의 극한","급수"]],["미분법",["여러 가지 함수의 미분","여러 가지 미분법","도함수의 활용"]],["적분법",["여러 가지 함수의 적분법","정적분의 활용"]]]},{"id":"geometry","title":"기하","category":"진로 선택","requires":["common2"],"chapters":[["이차곡선",["이차곡선"]],["공간도형과 공간좌표",["공간도형","공간좌표"]],["벡터",["벡터의 연산","벡터의 성분과 내적","도형의 방정식"]]]},{"id":"economics","title":"경제 수학","category":"진로 선택","requires":["common2"],"chapters":[["수와 경제",["수와 생활경제","수열과 금융"]],["함수와 경제",["함수와 경제 현상","함수의 활용"]],["행렬과 경제",["행렬과 경제 현상","행렬의 활용"]],["미분과 경제",["미분과 경제 현상","미분의 활용"]]]},{"id":"ai","title":"인공지능 수학","category":"진로 선택","requires":["common2"],"chapters":[["인공지능과 빅데이터",["인공지능의 개념과 역사","빅데이터와 인공지능"]],["텍스트 데이터 처리",["텍스트 데이터 표현","텍스트 데이터 분석"]],["이미지 데이터 처리",["이미지 데이터 표현","이미지 데이터 분석"]],["예측과 최적화",["경향성과 예측","최적화"]],["인공지능과 수학 탐구",["합리적 의사 결정","인공지능과 수학 탐구"]]]},{"id":"vocational","title":"직무 수학","category":"진로 선택","requires":[],"chapters":[["수와 연산",["수와 사칙연산","단위 환산"]],["변화와 관계",["비율과 백분율","규칙성과 변화","식과 문제해결"]],["도형과 측정",["도형의 관찰과 표현","도형의 측정"]],["자료와 가능성",["경우의 수와 가능성","자료의 정리와 해석"]]]},{"id":"culture","title":"수학과 문화","category":"융합 선택","requires":[],"chapters":[["예술과 수학",["음악과 수학","미술과 수학","문학과 수학","영화와 수학"]],["생활과 수학",["스포츠와 수학","게임과 수학","디지털 기술과 수학","투표와 수학"]],["사회와 수학",["민속 수학","점자표와 수학","대중매체와 수학","가치소비와 수학"]],["환경과 수학",["식생활과 수학","대기 오염과 수학","사막화와 수학","생명권과 수학"]]]},{"id":"statistics","title":"실용 통계","category":"융합 선택","requires":[],"chapters":[["통계와 통계적 문제",["통계와 통계적 문제해결","모집단과 표본"]],["자료의 수집과 정리",["자료의 종류와 수집","자료의 표현과 요약"]],["자료의 분석",["통계적 추정","통계적 검정"]],["통계적 탐구",["통계적 탐구 활동"]]]},{"id":"research","title":"수학과제 탐구","category":"융합 선택","requires":[],"chapters":[["과제 탐구의 이해",["수학과제 탐구의 의미와 필요성","연구 윤리"]],["과제 탐구의 방법과 절차",["문헌 연구","사례 조사","수학 실험","개발 연구"]],["과제 탐구의 실행 및 평가",["주제 선정 및 계획 수립","탐구 수행","탐구 결과 정리 및 발표","반성 및 평가"]]]}];
function highDomain(course,chapter){
 if(['probability','statistics'].includes(course)||/경우의 수|자료와 가능성/.test(chapter))return 'combinatorics';
 if(course==='geometry'||/도형|벡터/.test(chapter))return 'geometry';
 if(chapter==='수와 연산')return 'integer';return 'algebra';
}
const middleTree=tree.slice();
const elementaryTree=Object.entries(elementaryChapters).map(([id,chapters])=>({id,title:'초'+id.slice(1),children:[1,2].map(term=>({id:id+'-s'+term,title:term+'학기',children:chapters.slice((term-1)*6,term*6).map(([title,domain,...units],i)=>{const k=(term-1)*6+i+1;return {id:id+'-u'+k,title,domain,children:units.map((title,j)=>({id:id+'-'+k+'.'+(j+1),title,concepts:[title]}))};})}))}));
const highTree=[1,2,3].map(grade=>({id:'h'+grade,title:'고'+grade,children:highCourses.map(course=>({id:'h'+grade+'-'+course.id,title:course.title,course:course.id,category:course.category,children:course.chapters.map(([title,units],i)=>({id:'h'+grade+'-'+course.id+'-u'+(i+1),title,domain:highDomain(course.id,title),children:units.map((title,j)=>({id:'h'+grade+'-'+course.id+'-'+(i+1)+'.'+(j+1),title,concepts:[title],course:course.id,courseOrder:course.chapters.slice(0,i).reduce((n,c)=>n+c[1].length,0)+j,conceptKey:course.id+'-'+(i+1)+'.'+(j+1)}))}))}))}));
tree.splice(0,tree.length,...elementaryTree,...middleTree,...highTree);
const leaves=[],nodes=new Map();
function visit(node,parents=[]){nodes.set(node.id,node);if(node.children)node.children.forEach(n=>visit(n,[...parents,node]));else leaves.push({...node,grade:parents[0].title,gradeId:parents[0].id,semester:parents[1].title,chapter:parents[2].title,domain:parents[2].domain,order:leaves.length});}
// Keep historical middle-school order values stable; UI tree uses school order.
[...middleTree,...elementaryTree,...highTree].forEach(n=>visit(n));
function descendants(id){const n=nodes.get(id);return !n?[]:n.children?n.children.flatMap(c=>descendants(c.id)):[id];}
function selection(ids){if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string'||!nodes.has(id)))throw Error('시험 범위의 단원 정보를 확인하세요.');const selected=new Set(ids.flatMap(descendants));return leaves.filter(n=>selected.has(n.id)).map(n=>n.id);}
function state(ids,id){const selected=new Set(ids),all=descendants(id),count=all.filter(x=>selected.has(x)).length;return {checked:count===all.length&&count>0,partial:count>0&&count<all.length};}
function toggle(ids,id,checked){const selected=new Set(ids);for(const child of descendants(id))checked?selected.add(child):selected.delete(child);return selection([...selected]);}
function summaries(ids,qualified=false){const selected=new Set(ids),result=[];for(const g of tree)for(const term of g.children)for(const c of term.children){const picked=c.children.filter(n=>selected.has(n.id));if(!picked.length)continue;const prefix=qualified?`${g.title} ${term.title} · `:'';if(picked.length===c.children.length)result.push(prefix+c.title);else picked.forEach(n=>result.push(prefix+c.title+' > '+n.title));}return result;}
function infer(scope){
 if(scope?.curriculum)return {ids:selection(scope.curriculum.selected),unmatched:[]};
 const ids=[],unmatched=[],grade=gradeKey(scope?.grade);
 for(const unit of scope?.units||[]){let matches=[...nodes.values()].filter(n=>n.title===unit&&(!grade||n.id.startsWith(grade+'-')));if(!matches.length){const aliases={'닮음':'m2-u8','일차방정식과 일차함수':'m2-5.8'};if(aliases[unit]&&(!grade||grade==='m2'))matches=[nodes.get(aliases[unit])];}if(matches.length)ids.push(...matches.flatMap(n=>descendants(n.id)));else unmatched.push(unit);}
 // Preserve the old preset that stopped before parallel-line similarity.
 if((scope?.forbidden||[]).some(x=>x.includes('평행선 닮음')))for(const id of descendants('m2-u8').slice(3)){const i=ids.indexOf(id);if(i>=0)ids.splice(i,1);}
 return {ids:selection(ids),unmatched};
}
function gradeKey(value){
 const text=String(value||'').replace(/\s/g,''),id=text.match(/^(e[56]|[mh][123])$/);if(id)return id[1];
 const match=text.match(/(초(?:등학교)?|중(?:학교)?|고(?:등학교)?)([1-6])(?:학년)?/);
 return match?({초:'e',중:'m',고:'h'}[match[1][0]]+match[2]):null;
}
function gradeName(value){return value.replace(/^초/,'초등학교 ').replace(/^중/,'중학교 ').replace(/^고/,'고등학교 ')+'학년';}
function isMiddle(ids){return ids.every(id=>id.startsWith('m'));}
function allowedUnitIds(ids){
 const chosen=new Set(selection(ids)),out=new Set(chosen),picked=leaves.filter(n=>chosen.has(n.id));
 const elementary=leaves.filter(n=>n.gradeId.startsWith('e')),middle=leaves.filter(n=>n.gradeId.startsWith('m'));
 const high=picked.filter(n=>n.course),m=picked.filter(n=>n.gradeId.startsWith('m')),e=picked.filter(n=>n.gradeId.startsWith('e'));
 const add=ns=>ns.forEach(n=>out.add(n.id));
 if(high.length||m.length)add(elementary);else if(e.length)add(elementary.filter(n=>n.order<=Math.max(...e.map(n=>n.order))));
 if(high.length)add(middle);else if(m.length)add(middle.filter(n=>n.order<=Math.max(...m.map(n=>n.order))));
 const cutoffs=new Map();for(const n of high)cutoffs.set(n.course,Math.max(cutoffs.get(n.course)??-1,n.courseOrder));
 // Course order is not grade order. Only documented predecessor courses are assumed.
 const requireCourse=id=>{if(cutoffs.get(id)===Infinity)return;cutoffs.set(id,Infinity);for(const before of highCourses.find(c=>c.id===id).requires)requireCourse(before);};
 for(const course of [...cutoffs.keys()])for(const before of highCourses.find(c=>c.id===course).requires)requireCourse(before);
 add(leaves.filter(n=>n.course&&n.courseOrder<=(cutoffs.get(n.course)??-1)));
 return [...out];
}
function progression(ids){
 const chosen=leaves.filter(n=>ids.includes(n.id)),allowed=new Set(allowedUnitIds(ids)),middleOnly=isMiddle(ids);
 const prior=leaves.filter(n=>allowed.has(n.id)&&!ids.includes(n.id)&&(middleOnly?n.gradeId.startsWith('m'):true));
 // A course's repeated grade entries represent the same prerequisite concept, not three courses.
 const seen=new Set();const unique=ns=>ns.filter(n=>{const key=n.conceptKey||n.id;if(seen.has(key))return false;seen.add(key);return true;});
 chosen.forEach(n=>{if(n.conceptKey)seen.add(n.conceptKey);});
 const previous=unique(prior);
 const active=new Set(chosen.map(n=>n.course).filter(Boolean));
 const hasMiddle=chosen.some(n=>n.gradeId.startsWith('m'));
 const future=leaves.filter(n=>!allowed.has(n.id)&&(middleOnly?n.gradeId.startsWith('m'):active.size?n.course&&active.has(n.course):hasMiddle?!n.course:n.gradeId.startsWith('e')));
 seen.clear();return {chosen,prior:previous,future:unique(future),middleOnly};
}
function build(ids,extras={}){
 ids=selection(ids);if(!ids.length)throw Error('출제할 소단원을 한 개 이상 선택하세요.');
 const {chosen,prior,future,middleOnly}=progression(ids),last=chosen.at(-1),hasHigh=chosen.some(n=>n.course);
 const forbidden=summaries(future.map(n=>n.id),!middleOnly);
 // These aliases retain the existing explicit concept checks without banning a partly learned chapter.
 if(middleOnly&&last.order<leaves.find(n=>n.id==='m2-8.1').order)forbidden.push('닮음');
 const extraForbidden=extras.extraForbidden||[];
 return {grade:[...new Set(chosen.map(n=>gradeName(n.grade)))].join(' · '),semester:[...new Set(chosen.map(n=>n.semester))].join(' · '),domains:[...new Set(chosen.map(n=>n.domain))],units:summaries(ids,!middleOnly),prerequisites:[middleOnly?'초등학교에서 배운 내용':'초등학교 4학년까지 배운 내용',...summaries(prior.map(n=>n.id),true),...(extras.extraPrerequisites||[])],forbidden:[...new Set([...forbidden,...extraForbidden])],restrictions:extras.restrictions||'',curriculum:{version:middleOnly?legacyVersions[0]:version,selected:ids,extraForbidden:[...extraForbidden],extraPrerequisites:[...(extras.extraPrerequisites||[])]}};
}
function extras(scope,ids){
 if(scope?.curriculum)return {extraForbidden:scope.curriculum.extraForbidden||[],extraPrerequisites:scope.curriculum.extraPrerequisites||[],restrictions:scope.restrictions||''};
 const cutoff=leaves.filter(n=>ids.includes(n.id)).at(-1)?.order??-1;
 const known={'닮음':'m2-8.1','피타고라스 정리':'m2-9.1','삼각비':'m3-5.1'};
 const automatic=new Set(cutoff>=0?build(ids).forbidden:[]);
 return {extraForbidden:(scope?.forbidden||[]).filter(t=>!known[t]&&!automatic.has(t)),extraPrerequisites:[...(scope?.prerequisites||[])],restrictions:scope?.restrictions||''};
}
function describe(scope){
 if(!scope.curriculum)return '';
 const ids=selection(scope.curriculum.selected),last=leaves.filter(n=>ids.includes(n.id)).at(-1);if(!last)return '';
 const details=leaves.filter(n=>ids.includes(n.id)).map(n=>`${n.grade} ${n.chapter} > ${n.title}: ${n.concepts.join(' · ')}`).join('\n');
 if(!isMiddle(ids))return `\n체크박스 교육과정 ${catalogVersion} (2022 개정):\n${details}\n체크한 단원만 핵심 출제 대상으로 삼는다. 체크되지 않았어도 같은 과정의 선택 지점 이전 단원과 명시된 선수 과정은 풀이에 허용한다. 선택 지점 이후의 개념과 명시된 금지 개념은 사용하지 않는다. 고등학교 선택과목은 목록 순서나 학년만으로 이미 배웠다고 가정하지 않는다. 과목별 선수 과정은 허용 선수 개념 목록을 따른다. 추가로 이수한 과목은 기존 추가 허용 선수 개념에 명시된 경우에만 허용하고 금지 개념이 우선한다. 초등 범위에는 중학교·고등학교 개념을 추가하지 않는다. 소단원 일부 선택을 전체 과목 학습으로 확대하지 않는다.\n`;
 return `\n체크박스 교육과정 ${scope.curriculum.version} (첨부 목차의 순서 기준):\n${details}\n최종 학습 지점: ${last.grade} ${last.semester} ${last.chapter} > ${last.title}\n체크한 단원만 핵심 출제 대상으로 삼는다. 체크되지 않았어도 이 지점 이전의 학년·학기·소단원은 이미 배운 선수 과정이므로 풀이에 허용한다. 이 지점 뒤의 소단원 및 중학교 이후의 개념은 사용하지 않는다. 허용 선수 개념의 유사한 명칭을 이후 개념으로 오인하지 않는다. 중2 내심에서 배운 접점까지의 길이는 중3 일반 원의 접선 정리와 구분한다. 소단원 일부만 선택했다면 대단원 전체를 배운 것으로 확대하지 않는다. 별도 추가 금지와 사용자의 명시적 추가 요청도 확인한다.\n`;
}
return {version,catalogVersion,legacyVersions,tree,leaves,descendants,selection,state,toggle,summaries,infer,build,extras,describe,gradeKey,allowedUnitIds};
});
