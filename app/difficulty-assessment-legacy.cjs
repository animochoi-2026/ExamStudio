'use strict';
// Shared display/statistics policy, not a validated psychometric scoring formula.
const version='expected-10-v5-insight-references-scope-low1',bandVersion='four-bands-anchors-v1';
const Policy=require('./difficulty-policy-legacy.cjs');
const referenceExamples=require('./difficulty-reference-examples.json');
const bands=['쉬움','보통','어려움','아주어려움'];
const features=['conceptCombination','keyInsight','reasoningSteps','calculationLoad','caseSplit','geometryInterpretation'];
const object=p=>({type:'object',additionalProperties:false,required:Object.keys(p),properties:p});
const nullable=s=>({anyOf:[s,{type:'null'}]});
const schema=nullable(object({score:nullable({type:'string'}),band:nullable({type:'string',enum:bands}),status:{type:'string',enum:['estimated','deferred']},reason:{type:'string'},features:object(Object.fromEntries(features.map(k=>[k,{type:'string'}])))}));
const instructions=`같은 요청에서 assessment에 예상 난이도도 기록하세요. 평가 기준은 공통 학년·시험범위·허용 선수개념입니다. 점수는 0~10 소수 한 자리, 하 대표 3.0·중 대표 5.0·상 대표 8.0을 유지합니다. 공통 분류 기준은 하 3.0 이하, 중 3.0 초과 8.0 미만, 상 8.0 이상입니다. 이 경계는 분류 기준이며 가중 점수식이나 점수 보장이 아닙니다. assessment.score에는 AI 원점수를 기록하고 assessment.band는 null로 반환하세요. band는 앱이 원점수에서 산출하는 저장 호환용 메타데이터이며 별도의 평가 기준이 아닙니다. 앱의 최종 분류에도 같은 경계를 적용하되 교사 점수 우선과 검증된 증명 보정은 앱이 처리합니다. conceptCombination/ keyInsight/ reasoningSteps/ calculationLoad/ caseSplit/ geometryInterpretation에 각각 짧은 근거를 쓰세요. 특징은 설명·모순 탐지용이며 가중 점수식이 아닙니다. 풀이 글자수·학교명·시험지 점수분포·원본배점으로 난도를 정하거나 점수를 강제상향하지 마세요. 가정한 풀이의 개념과 추론 부담을 평가하며, 근거가 부족하면 status=deferred, score=null, band=null과 이유를 쓰세요. 판단보류는 난이도 구간이 아닙니다. 인식·풀이 자체의 성공 여부와 별개입니다. 인쇄 배점이 이미지에 보이더라도 난도 판단 근거에서 제외하세요. 학생 정답률이 아닌 문항분석 기반 추정치입니다.`;
const highDifficultyInstructions=`상위 난도는 정리 이름이나 계산량보다 원문만 받은 학생이 핵심 관계를 발견하고 정당화하는 부담을 구분합니다. 8점대는 비정형 착상 후 비교적 표준적인 연결, 9.0 부근은 숨은 핵심 대상의 발견과 서로 다른 관계를 잇는 구조 전환, 9.5 부근은 숨은 관계·적절한 보조선 선택·독립적인 두 추론 연결 등 연속 착상이 동시에 필요한 경우의 비교 기준입니다. 이 설명은 체크 개수에 따른 점수식·최저점 보장이 아니며, 허용 범위 안의 더 간단한 타당한 풀이가 있으면 함께 고려하세요. 인쇄된 힌트와 스스로 찾아야 할 관계를 구분하세요. 사진의 학생 필기·풀이·답·채점·추가 보조선은 원문 조건이나 친절한 힌트가 아닙니다. 저장된 최종 풀이가 짧거나 제공되어 있어도 그 착상을 발견하는 부담을 생략하지 마세요. 필기에 가려 인쇄 조건을 확정할 수 없으면 해당 한계를 명시하고 필요한 경우 판단보류합니다.`;
const lowDifficultyInstructions='하 난도(3.0 이하, 대표 3.0)는 해당 학년·범위에서 배운 성질이나 공식을 원문에 드러난 조건에 바로 적용하고, 숨은 관계·보조선·새로운 경우 나눔 없이 익숙한 절차로 해결하는 문항의 비교 기준입니다. 단순 대입·정리나 짧은 기본 계산이 이어진다는 이유만으로 중 대표 5.0을 기본값으로 주지 마세요. 그림·수식이 있거나 서술형이거나 풀이가 두 줄이라는 사실 자체도 중 난도의 근거가 아닙니다. 중 난도는 학생이 조건을 선택·연결하거나 익숙한 절차를 조합하는 실제 부담을 근거로 구분하세요. 반대로 답이나 풀이가 짧아도 숨은 착상이 필요하면 하로 낮추지 마세요. 하·상 기준을 함께 명료하게 하되 학교별 고정 비율·순위 정규화·상하 개수 맞추기·과거 점수 일괄 내리기는 하지 않습니다. 조건이 부족한 문항을 기본형으로 추측하지 말고 한계를 남기세요.';
function scopedReferenceExamples(scope){
 const C=require('./curriculum.js');let ids;try{const inferred=C.infer(scope);if(inferred.unmatched.length)return [];ids=inferred.ids;}catch{return [];}
 const chosen=C.leaves.filter(n=>ids.includes(n.id));
 if(!chosen.length||chosen.some(n=>n.grade!=='중2'||n.semester!=='2학기')||!ids.some(id=>/^m2-(8|9)\./.test(id)))return [];
 if(scope?.grade&&!/중(?:학교)?\s*2(?:학년)?/.test(scope.grade)||scope?.semester&&!String(scope.semester).includes('2'))return [];
 // Free-form restrictions cannot safely be classified here. Leave references
 // out rather than override a user's additional scope restriction.
 if(String(scope?.restrictions||'').trim())return [];
 const last=Math.max(...chosen.map(n=>n.order)),clean=t=>String(t).replace(/\s+/g,''),forbidden=[...(scope?.forbidden||[]),...(scope?.curriculum?.extraForbidden||[])].map(clean);
 return referenceExamples.examples.filter(example=>{
  const units=example.requiredUnitIds.map(id=>C.leaves.find(n=>n.id===id));if(units.some(n=>!n||n.order>last))return false;
  const terms=[...example.requiredConcepts,...units.map(n=>n.title)].map(clean);
  return !forbidden.some(f=>example.requiredUnitIds.includes(f)||f.length>1&&terms.some(t=>t.includes(f)));
 });
}
function instructionsForScope(scope){
 const base=instructions+'\n'+lowDifficultyInstructions+'\n'+highDifficultyInstructions+'\n'+Policy.instructions,examples=scopedReferenceExamples(scope);
 if(!examples.length)return base+'\n사용자 기준 예시의 학년·허용 개념과 현재 범위가 일치한다고 확인되지 않아 구체적인 예시와 목표점수는 제공하지 않습니다. 현재 범위에서 독립적으로 판단하세요.';
 return base+'\n사용자가 제공한 비교 예시(실측 AI 점수 아님). 확인된 전제: 중2 2학기 삼각형의 닮음·피타고라스 허용, 원주각 정리 금지. 이는 예시의 원래 조건이며 현재 문항의 범위를 넓히지 않습니다. 현재 범위의 선수개념 및 추가 금지를 통과한 예시만 전달합니다: '+examples.map(x=>x.userTarget+' 부근 — '+x.difficultyBasis+' 필요한 개념: '+x.requiredConcepts.join('·')+' '+(x.scopeGuidance||'')).join(' / ')+' 필기와 추가 보조선은 원문 힌트가 아닙니다. 문항번호·학교·점 이름·사진/문항 해시로 점수를 고정하지 않으며, 두 예시에 맞춰 전체 점수분포를 늘이지 않습니다. 기존 문항의 새 기준 평가는 명시적으로 요청된 대상에 한해 교사값과 과거 시험지는 보존하고 현행 AI 점수는 새 기준으로 교체하며, 이 지침만으로 자동 일괄 재평가하지 않습니다.';
}
function score(v){try{const n=Policy.score(v);return n===null?null:n.toFixed(1);}catch{throw Object.assign(Error('난이도 형식 오류: 0~10점, 소수 한 자리'),{code:'difficulty_format'});}}
function band(v){const n=score(v);return n===null?null:Number(n)<4?bands[0]:Number(n)<6.5?bands[1]:Number(n)<8?bands[2]:bands[3];}
function normalize(a){
 if(!a)return {status:'missing',score:null,band:null,reason:'최초 응답에 난이도 분석 없음',features:null};
 // New replies leave band null; retain legacy metadata and its validation for stored replies.
 try{const n=score(a.score);if(a.status==='estimated'&&n!==null&&a.band===null)a={...a,band:band(n)};if(a.band!=null&&!bands.includes(a.band))throw Error('알 수 없는 구간');if(!['estimated','deferred'].includes(a.status))throw Error('분석 상태 오류');if(!String(a.reason||'').trim())throw Error('난이도 근거 없음');if(a.status==='estimated'&&(n===null||!a.band))throw Error('점수·구간 누락');if(a.status==='deferred'&&(n!==null||a.band!=null))throw Error('판단보류의 점수·구간은 비워야 합니다');if(!a.features||features.some(k=>typeof a.features[k]!=='string'||a.features[k].length>500))throw Error('구조화 특징 오류');return {...a,score:n,contradictions:n!==null&&band(n)!==a.band?['원점수와 AI 구간 불일치']:[],criteriaVersion:version,bandVersion};}
 catch(e){return {status:'format_error',score:null,band:null,reason:e.message,invalidResponse:a,features:null};}
}
function activeAssessment(c){
 const d=c.metadata?.difficulty||{},saved=d.rubricAssessments?.[d.activeRubricAssessment];return !d.reassessmentRequired&&saved?.criteriaVersion===version&&saved?.state==='accepted'&&saved.revisionId===c.revision_id&&saved.inputBasis&&saved.inputBasis===c.metadata?.analysis?.basis&&c.metadata?.analysis?.status!=='stale'?saved:null;
}
function currentAI(c){const d=c.metadata?.difficulty||{},active=activeAssessment(c);if(d.reassessmentRequired||c.metadata?.analysis?.status==='stale')return null;if(active)return {score:active.score,band:band(active.score),reason:active.assessment?.reason||active.reason,assessment:active.assessment,provenance:active.provenance,criteriaVersion:version};if(d.criteriaVersion!==version)return null;try{const number=score(d.aiScore);return number===null?null:{score:number,band:band(number),reason:d.reason,assessment:d.assessment,provenance:d.provenance,criteriaVersion:version};}catch{return null;}}
// Replace the current recommendation only. Question/version history and teacher
// decisions belong to their own records and are never deleted by this policy.
function currentOnly(c){const result=structuredClone(c),d=result.metadata.difficulty,a=currentAI(c);for(const key of ['rubricAssessments','activeRubricAssessment','previousAssessment','calibratedScore','calibration','calibrationSuggestion','oldRawScore','oldScore','oldCriteriaVersion'])delete d[key];if(a){const normalized=normalize(a.assessment);if(normalized.status!=='estimated'||normalized.contradictions?.length||score(normalized.score)!==score(a.score)){if(activeAssessment(c))throw Error('새 기준 평가 근거와 점수가 일치하지 않습니다.');d.aiScore=null;d.aiBand=null;d.assessmentStatus='missing';d.reason='새 기준 평가 근거 확인 필요 · 문항은 계속 저장·편집할 수 있습니다.';d.reassessmentRequired=true;return result;}const provenance=a.provenance||d.provenance||{};if(activeAssessment(c))d.proofAdjustment=Policy.rebase(c,a.score);d.aiScore=a.score;d.aiBand=a.band;d.reason=a.reason;d.features=structuredClone(normalized.features);d.criteriaVersion=version;d.assessmentStatus='estimated';d.assessment={...normalized,inputHash:c.metadata.analysis?.basis,scope:structuredClone(d.scope),model:provenance.model||d.assessment?.model||c.metadata.analysis?.model,provider:provenance.provider||d.assessment?.provider||c.metadata.analysis?.provider,effort:provenance.effort||d.assessment?.effort,at:provenance.at||d.assessment?.at,instructionsVersion:version};d.provenance=structuredClone(provenance);d.reassessmentRequired=false;}else if(d.criteriaVersion!==version){d.aiScore=null;d.aiBand=null;d.features=null;d.assessment=null;d.criteriaVersion=version;d.assessmentStatus='missing';d.reason='새 기준 평가 필요 · 이전 기준 점수는 사용하지 않습니다.';d.reassessmentRequired=true;delete d.provenance;}return result;}
function effective(c){
 const d=c.metadata?.difficulty||{},f=c.confirmed||{},active=currentAI(c);let number=null,numberSource=null,adjustment=null;
 for(const [v,source]of [[f.difficulty,'교사 검수'],[d.userScore,'교사 직접 입력']]){if(v==null||v==='')continue;try{number=Number(score(v));numberSource=source;break;}catch{}}
 if(number===null&&active){adjustment=Policy.applied(c,active.score);number=adjustment.score;numberSource=adjustment.delta?'AI 원점수 + 증명 보정':'AI 추천';}
 const legacyBand=Object.hasOwn(f,'difficultyBand')?f.difficultyBand:d.teacherBand;
 const derived=number===null?null:band(number);
 return {number,numberSource,band:derived,bandSource:derived?'최종 점수 기준':null,status:number!==null?'estimated':d.assessmentStatus||'unevaluated',adjustment,legacyBand:bands.includes(legacyBand)?legacyBand:null,legacyBandConflict:bands.includes(legacyBand)&&legacyBand!==derived};
}
const compositionLabels={low:'하',middle:'중',high:'상',unknown:'미분석·판단보류'};
const compositionAnchors={low:3,middle:5,high:8};
function compositionBand(c){return Policy.composition(effective(c).number);}
function statistics(rows){
 const groups=new Map();
 for(const c of rows){const m=c.metadata||{},s=m.source||{},d=m.difficulty||{},key=JSON.stringify([s.school||'미상',s.grade||'미상',canonical(d.scope||{}),currentAI(c)?.criteriaVersion||'new-criteria-required']);if(!groups.has(key))groups.set(key,{school:s.school||'미상',grade:s.grade||'미상',scope:d.scope||{},criteriaVersion:currentAI(c)?.criteriaVersion||'new-criteria-required',rows:[]});groups.get(key).rows.push(c);}
 const summary=items=>{const values=items.map(effective),numbers=values.filter(x=>x.number!==null).map(x=>x.number).sort((a,b)=>a-b),n=numbers.length;const distribution=Object.fromEntries(bands.map(b=>[b,values.filter(x=>x.band===b).length]));return {total:items.length,analyzed:items.filter(c=>currentAI(c)!==null).length,numericCount:n,average:n?numbers.reduce((a,b)=>a+b,0)/n:null,median:n?(numbers[(n-1)>>1]+numbers[n>>1])/2:null,distribution,compositionDistribution:count(items.map(compositionBand)),bandCount:values.filter(x=>x.band).length,highShare:n?values.filter(x=>x.number!==null&&x.number>=Policy.boundaries.highMin).length/n:null,numberSources:count(values.map(x=>x.numberSource||'미산출')),bandSources:count(values.map(x=>x.bandSource||'미산출')),questionTypes:count(items.flatMap(c=>(c.metadata?.classification?.types||[]).map(x=>x.name||x.id)))};};
 return [...groups.values()].map(({rows,...g})=>({...g,all:summary(rows),objective:summary(rows.filter(c=>section(c)==='objective')),written:summary(rows.filter(c=>section(c)==='written')),unknown:summary(rows.filter(c=>!section(c)))})).sort((a,b)=>a.school.localeCompare(b.school)||a.grade.localeCompare(b.grade));
}
function section(c){const s=c.metadata?.source||{},part=s.numbering?.section;if(part==='unknown')return null;if(part==='objective'||part==='written')return part;const type=c.metadata?.content?.responseType;if(type==='서술형')return 'written';if(type==='선택형')return 'objective';const n=require('./source-inventory.cjs').sourceNumber(s);return n.key?n.section:null;}
function count(values){const out={};for(const v of values)out[v]=(out[v]||0)+1;return out;}
function canonical(v){return Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;}
function pointSignals(rows){
 const groups=new Map(),result=[];
 for(const c of rows){const m=c.metadata||{},s=m.source||{},part=section(c);let raw;try{raw=score(currentAI(c)?.score);}catch{continue;}const saved=c.confirmed?.originalPoints??s.originalPoints,points=Number(saved);if(!s.documentId||!part||raw===null||saved==null||!Number.isFinite(points)||points<=0||m.difficulty?.reassessmentRequired)continue;const key=JSON.stringify([s.documentId,s.school,s.grade,s.academicYear,s.semester,s.exam,part]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push({id:c.question_id,raw:Number(raw),points});}
 for(const [key,a]of groups){if(a.length<5||new Set(a.map(x=>x.points)).size<2)continue;let comparable=0,discordant=0;for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++){const p=a[i].points-a[j].points,r=a[i].raw-a[j].raw;if(!p||!r)continue;comparable++;if(p*r<0)discordant++;}if(comparable)result.push({group:key,sample:a.length,comparable,discordant,ratio:discordant/comparable,action:'internal_reference_only'});}
 return result;
}
module.exports={version,bandVersion,bands,features,schema,instructions:instructions+'\n'+lowDifficultyInstructions+'\n'+highDifficultyInstructions+'\n'+Policy.instructions,instructionsForScope,scopedReferenceExamples,referenceExamples,score,band,normalize,activeAssessment,currentAI,currentOnly,effective,compositionBand,compositionLabels,compositionAnchors,statistics,pointSignals,canonical};
