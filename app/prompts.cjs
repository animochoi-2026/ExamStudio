'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { atomicWrite } = require('./store.cjs');
const { PARTS, DEFAULT_PART_PROMPTS, validatePart } = require('./parts.cjs');
const LIMIT = 20000;
const DEFAULT_PROMPTS = Object.freeze({
  parts: DEFAULT_PART_PROMPTS,
  "common": "인쇄된 문제 지문, 선택지, 점 이름, 선, 직각·동일 길이 표시를 정확히 읽으세요. 연필 필기·풀이·낙서·손으로 쓴 답을 인쇄 조건으로 취급하지 마세요. 불확실한 글자·선·각도는 추측하여 확정하지 말고 warnings와 needsReview에 표시하고 reply에서 짧게 확인 질문을 하세요. 원문 수치는 임의 변경하지 마세요.\n본문(body)에는 문제와 주어진 조건만 넣고 답이나 풀이를 넣지 마세요. answer에는 정답, solution에는 학생이 이해할 수 있는 상세한 수학 풀이와 근거를 넣으세요. 내부 사고 과정을 기록하는 대신 완성된 교육용 해설을 작성하세요. 읽을 수 있으면 원문도 풀되, 조건이 불충분하면 answer와 solution을 빈 문자열로 두고 확인을 요청하세요.\n유사문제는 사용자가 요청한 개수와 변경 방식(숫자, 좌우 반전, 다른 성질 등)을 따릅니다. 문제가 성립하고 정답이 유일한지, 선택지 정답이 하나인지 검토하고 각 문제의 상세 풀이를 포함하세요. 원문의 불확실한 조건이 변형에 필수라면 확인 전 생성하지 마세요.\n원문 조건이 변경되면 기존 유사문제와 풀이의 영향을 검토하세요. 영향을 판별할 수 없는 기존 항목은 needsReview=true와 warnings를 남깁니다. 생성된 내용은 검토 가능한 초안입니다. reply는 실제 변경사항과 확인할 부분을 한국어로 간결하게 설명하며, 존재하지 않는 파일이나 도구로 검증했다고 주장하지 마세요.",
  "recognition": "선택한 이미지에서 인쇄된 원문을 정확하게 인식해 주세요. 지문, 수식, 선택지, 도형의 점 이름과 명시된 조건을 보존하세요. 필기와 낙서, 손으로 적은 정답은 원문 조건에서 제외하고, 인쇄인지 필기인지 애매한 부분과 읽기 어려운 부분은 추측하지 말고 확인 대상으로 표시해 주세요. 도형은 좌표와 관계 데이터로 재구성해 주세요. 먼저 인식한 원문을 보여주고, 풀 수 있다면 상세 풀이와 정답도 함께 작성하세요. 유사문제는 아직 만들지 마세요."
});
function validatePrompts(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('프롬프트 설정이 올바르지 않습니다.');
  const result = {};
  for (const key of ['common', 'recognition']) {
    const label = key === 'common' ? '공통 프롬프트' : '원문 인식 프롬프트';
    if (typeof value[key] !== 'string' || !value[key].trim() || value[key].length > LIMIT) throw new Error(`${label}를 1~20,000자로 입력해 주세요.`);
    result[key] = value[key];
  }
  // Stage-one settings have no parts. Preserve their text and add defaults on read.
  const parts = value.parts === undefined ? DEFAULT_PART_PROMPTS : value.parts;
  if (!parts || typeof parts !== 'object' || Array.isArray(parts)) throw new Error('파트별 프롬프트 설정이 올바르지 않습니다.');
  result.parts = {};
  for (const [key, label] of Object.entries(PARTS)) {
    if (typeof parts[key] !== 'string' || parts[key].length > LIMIT) throw new Error(`${label} 프롬프트를 20,000자 이내로 입력해 주세요.`);
    result.parts[key] = parts[key];
  }
  return result;
}
function composePrompt(common, part = '', partPrompt = '') {
  validatePart(part);
  if (typeof common !== 'string' || !common.trim() || common.length > LIMIT) throw new Error('공통 프롬프트를 1~20,000자로 입력해 주세요.');
  if (typeof partPrompt !== 'string' || partPrompt.length > LIMIT) throw new Error('파트별 프롬프트를 20,000자 이내로 입력해 주세요.');
  return `현재 사용자 공통 프롬프트:\n${common}\n\n현재 문제 파트: ${PARTS[part] || '미지정'}\n현재 파트 지침은 과거 대화의 파트 지침을 대체합니다. 미지정 또는 빈 파트 지침이면 공통 지침만 적용하세요. 파트 지침과 공통 지침이 충돌하면 공통 지침의 시험 범위와 금지 개념을 우선하세요.${part && partPrompt.trim() ? `\n현재 파트 프롬프트:\n${partPrompt}` : ''}`;
}
class PromptStore {
  constructor(directory) { this.file = path.join(directory, 'prompt-settings.json'); }
  read() {
    try { return validatePrompts(JSON.parse(fs.readFileSync(this.file, 'utf8'))); }
    catch (error) {
      if (error.code === 'ENOENT') return { ...DEFAULT_PROMPTS };
      throw new Error('저장된 프롬프트 설정을 읽지 못했습니다. 프롬프트 설정에서 내용을 확인하고 다시 저장해 주세요.');
    }
  }
  snapshot() {
    try { return { values: this.read(), defaults: { ...DEFAULT_PROMPTS }, error: '' }; }
    catch (error) { return { values: { ...DEFAULT_PROMPTS }, defaults: { ...DEFAULT_PROMPTS }, error: error.message }; }
  }
  save(value) { const next = validatePrompts(value); atomicWrite(this.file, next); return next; }
}
module.exports = { DEFAULT_PROMPTS, LIMIT, validatePrompts, composePrompt, PromptStore };
