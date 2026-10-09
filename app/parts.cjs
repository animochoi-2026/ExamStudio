'use strict';
const PARTS = Object.freeze({ integer: '정수', algebra: '대수', geometry: '기하', combinatorics: '조합' });
const DEFAULT_PART_PROMPTS = Object.freeze({
  integer: '정수 문제에서는 정수 조건, 나눗셈의 나머지, 약수·배수와 가능한 값의 범위를 확인하세요. 사용한 성질과 예외를 풀이에 설명하세요.',
  algebra: '대수 문제에서는 정의역과 변수의 범위, 식의 변형이 동치인지 확인하세요. 분모가 0인 경우와 무연근을 점검하고 해를 원래 조건에 대입해 검산하세요.',
  geometry: '기하 문제에서는 그림의 겉모양을 주어진 조건으로 단정하지 마세요. 길이·각도·평행·수직 조건과 도형 좌표가 일치하는지 확인하고 사용한 성질을 풀이에 설명하세요.',
  combinatorics: '조합 문제에서는 순서와 중복의 허용 여부를 명확히 하세요. 경우를 나눌 때 누락과 중복이 없는지 확인하고 세는 기준을 풀이에 설명하세요.',
});
function validatePart(part) {
  if (typeof part !== 'string' || (part !== '' && !Object.hasOwn(PARTS, part))) throw new Error('정수·대수·기하·조합 또는 미지정 중에서 파트를 선택해 주세요.');
  return part;
}
module.exports = { PARTS, DEFAULT_PART_PROMPTS, validatePart };
