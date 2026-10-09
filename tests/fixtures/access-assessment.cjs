'use strict';
// Synthetic provider response, following the approved 2026-10-08 v2 contract.
// Numbers are derived from explicit categories, never coerced from legacy scores.
function accessAssessment(level='S1',reasoning='R0') {
 const baseline={S0:'B0',S1:'B1',S2:'B2'}[level];
 return {status:'estimated',answer:'2',solutionSummary:'테스트 조건을 연결하여 2를 구한다.',scopeCheck:'선택한 범위의 성질만 사용한다.',
 baselineCertificate:{rule:baseline||'insufficient',originalObjectsOnly:!!baseline,sameRepresentation:!!baseline,evidence:'독립 수행 범위의 해당 조건을 확인했다.'},
 mainDiscovery:'테스트에 지정된 관계 연결',selectionCue:'발문에 주어진 조건',justification:'주어진 조건으로 관계를 확인한다.',missingGuidance:'테스트 범주의 안내 부담',accessLevel:level,levelRationale:'지정 범주의 단서와 전환을 검사하는 합성 응답',lowerLevelCheck:'하위 범주의 독립 수행 조건과 구별한다.',
 remainingAfterHint:{hint:'한 관계를 연결한다.',remaining:'나머지 관계의 선택',independentStructuralTransfer:level==='S6',evidence:'별도 전환 여부를 검사한다.'},easiestAlternative:'같은 범위의 직접적인 풀이',reasoningLevel:reasoning,residualReasoning:'발견과 중복하지 않는 잔여 추론',limitations:[]};
}
module.exports={accessAssessment};
