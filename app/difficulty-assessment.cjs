'use strict';
const Access=require('./difficulty-access.cjs'),Policy=require('./difficulty-policy.cjs');
const version=Access.version,supportedVersions=[version,'expected-10-v5-insight-references-scope-low1'],bandVersion='common-low3-high8-killer9-v2';
const evaluator=Object.freeze({model:'gpt-6.1-sol',effort:'high'}),bands=['쉬움','보통','어려움','아주어려움'];
const features=['conceptCombination','keyInsight','reasoningSteps','calculationLoad','caseSplit','geometryInterpretation'];
const schema={anyOf:[Access.itemSchema,{type:'null'}]};
const instructions=require('./difficulty-access-prompt.json').instructions+'\n현재 작업 응답의 assessment 안에 이 구조의 문항별 평가를 기록하세요. 숫자 점수는 프로그램이 계산합니다.';
const instructionsForScope=()=>instructions,scopedReferenceExamples=()=>[],referenceExamples={examples:[]};
function score(v){try{const n=Policy.score(v);return n===null?null:n.toFixed(1);}catch{throw Object.assign(Error('난이도 형식 오류: 0~10점, 소수 한 자리'),{code:'difficulty_format'});}}
function band(v){const n=score(v);return n===null?null:Number(n)<=3?bands[0]:Number(n)<8?bands[1]:Number(n)<9?bands[2]:bands[3];}
function normalize(a){
 if(!a)return {status:'missing',score:null,band:null,reason:'최초 응답에 난이도 분석 없음',features:null,contradictions:[]};
 try {const raw=a.rubricEvidence||a;const result=Access.score(raw);const reason=[raw.mainDiscovery,raw.levelRationale,raw.residualReasoning].filter(Boolean).join(' / ');return {status:result.status,score:result.score===null?null:result.score.toFixed(1),band:result.score===null?null:band(result.score),reason,features:{conceptCombination:raw.scopeCheck,keyInsight:raw.mainDiscovery,reasoningSteps:raw.residualReasoning,calculationLoad:'평가 제외',caseSplit:raw.missingGuidance,geometryInterpretation:raw.selectionCue},rubricEvidence:structuredClone(raw),accessLevel:result.accessLevel||raw.accessLevel,reasoningLevel:result.reasoningLevel||raw.reasoningLevel,contradictions:[],criteriaVersion:version,bandVersion};}
 catch(e){return {status:'format_error',score:null,band:null,reason:e.message,invalidResponse:a,features:null,contradictions:[]};}
}
function activeAssessment(c){
 const d=c.metadata?.difficulty||{},saved=d.rubricAssessments?.[d.activeRubricAssessment];return !d.reassessmentRequired&&supportedVersions.includes(saved?.criteriaVersion)&&saved?.state==='accepted'&&saved.revisionId===c.revision_id&&saved.inputBasis&&saved.inputBasis===c.metadata?.analysis?.basis&&c.metadata?.analysis?.status!=='stale'?saved:null;
}
function currentAI(c){const d=c.metadata?.difficulty||{},active=activeAssessment(c);if(d.reassessmentRequired||c.metadata?.analysis?.status==='stale')return null;if(active)return {score:active.score,band:band(active.score),reason:active.assessment?.reason||active.reason,assessment:active.assessment,provenance:active.provenance,criteriaVersion:active.criteriaVersion};if(!supportedVersions.includes(d.criteriaVersion))return null;try{const number=score(d.aiScore);return number===null?null:{score:number,band:band(number),reason:d.reason,assessment:d.assessment,provenance:d.provenance,criteriaVersion:d.criteriaVersion};}catch{return null;}}
// Replace the current recommendation only. Question/version history and teacher
// decisions belong to their own records and are never deleted by this policy.
function preserveHistory(d){
 if(!d||!d.criteriaVersion||d.criteriaVersion===version)return;
 const previous=Object.fromEntries(Object.entries(d).filter(([k])=>!['history','rubricAssessments','activeRubricAssessment'].includes(k)));
 d.history||=[];if(!d.history.some(x=>JSON.stringify(canonical(x))===JSON.stringify(canonical(previous))))d.history.push(structuredClone(previous));
}
function currentOnly(c){
 const out=structuredClone(c),d=out.metadata.difficulty,a=currentAI(c);if(!a||a.criteriaVersion!==version)return out;
 const normalized=normalize(a.assessment);if(normalized.status!=='estimated'||score(normalized.score)!==score(a.score))throw Error('새 기준 평가 근거와 점수가 일치하지 않습니다.');
 preserveHistory(d);
 const provenance=a.provenance||{};Object.assign(d,{aiScore:normalized.score,aiBand:normalized.band,reason:normalized.reason,features:normalized.features,criteriaVersion:version,assessmentStatus:'estimated',assessment:{...normalized,inputHash:c.metadata.analysis?.basis,scope:structuredClone(d.scope),...provenance,instructionsVersion:version},provenance:structuredClone(provenance),proofAdjustment:Policy.adjustment(c,a.score),reassessmentRequired:false});return out;
}
function effective(c){
 const d=c.metadata?.difficulty||{},f=c.confirmed||{},active=currentAI(c);let number=null,numberSource=null,adjustment=null;
 for(const [v,source]of [[f.difficulty,'교사 검수'],[d.userScore,'교사 직접 입력']]){if(v==null||v==='')continue;try{number=Number(score(v));numberSource=source;break;}catch{}}
 if(number===null&&active){adjustment=Policy.applied(c,active.score,active.criteriaVersion);number=adjustment.score;numberSource=adjustment.delta?'AI 원점수 + 증명 보정':'AI 추천';}
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
 const summary=items=>{const values=items.map(effective),numbers=values.filter(x=>x.number!==null).map(x=>x.number).sort((a,b)=>a-b),n=numbers.length;const distribution=Object.fromEntries(bands.map(b=>[b,values.filter(x=>x.band===b).length]));return {total:items.length,analyzed:items.filter(c=>currentAI(c)!==null).length,numericCount:n,average:n?numbers.reduce((a,b)=>a+b,0)/n:null,median:n?(numbers[(n-1)>>1]+numbers[n>>1])/2:null,distribution,compositionDistribution:count(items.map(compositionBand)),killerCount:values.filter(x=>x.number!==null&&x.number>=9).length,bandCount:values.filter(x=>x.band).length,highShare:n?values.filter(x=>x.number!==null&&x.number>=Policy.boundaries.highMin).length/n:null,numberSources:count(values.map(x=>x.numberSource||'미산출')),bandSources:count(values.map(x=>x.bandSource||'미산출')),questionTypes:count(items.flatMap(c=>(c.metadata?.classification?.types||[]).map(x=>x.name||x.id)))};};
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
module.exports={preserveHistory,version,supportedVersions,evaluator,bandVersion,bands,features,schema,instructions,instructionsForScope,scopedReferenceExamples,referenceExamples,score,band,normalize,activeAssessment,currentAI,currentOnly,effective,compositionBand,compositionLabels,compositionAnchors,statistics,pointSignals,canonical};
