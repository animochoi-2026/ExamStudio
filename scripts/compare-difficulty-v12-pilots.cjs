'use strict';
// Local comparison only: never sends expected tiers, old results, or review data to a model.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const I=require('../app/difficulty-v12/input.cjs'),S=require('../app/difficulty-v12/schema.cjs'),P=require('../app/difficulty-v12/pilot.cjs');
const [firstRoot,secondRoot,firstLabel='1차',secondLabel='2차']=process.argv.slice(2);
if(!firstRoot||!secondRoot)throw Error('Usage: compare-difficulty-v12-pilots.cjs <round1 directory> <round2 directory>');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const before=read(path.join(firstRoot,'pilot-inputs.json')),after=read(path.join(secondRoot,'pilot-inputs.json'));
const oldReport=read(path.join(firstRoot,'report.json')),approval=read(path.join(secondRoot,'execution-approval.json'));
assert.equal(before.length,30);assert.equal(after.length,30);
const preservationFile=path.join(secondRoot,'previous-results-preservation.json');
const preserved=read(fs.existsSync(preservationFile)?preservationFile:path.join(secondRoot,'round1-preservation.json'));
for(const [file,hash] of Object.entries(preserved))assert.equal(require('node:crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex'),hash,'Round 1 changed: '+file);
for(const [file,hash] of Object.entries(approval.files))assert.equal(require('node:crypto').createHash('sha256').update(fs.readFileSync('app/difficulty-v12/'+file)).digest('hex'),hash,'Protected code changed: '+file);
const rows=after.map((e,index)=>{
 const old=before[index];assert.equal(e.id,old.id);assert.equal(e.questionId,old.questionId);assert.equal(e.revisionId,old.revisionId);
 assert.deepEqual(e.input.payload,old.input.payload);assert.equal(e.input.contentHash,old.input.contentHash);assert.deepEqual(e.input.images,old.input.images);
 const oldRow=oldReport.rows.find(x=>x.id===e.id);assert(oldRow);
 const a=read(oldRow.resultFile),key=I.hash({inputVersion:e.input.inputVersion,evaluationVersion:approval.evaluationVersion});
 const file=path.join(secondRoot,'results',key,'result.json'),b=fs.existsSync(file)?read(file):null;
 for(const r of [a,b])if(r?.raw)assert.deepEqual(S.evaluate(r.raw).computed,r.computed,'Recomputed result differs: '+e.id);
 const expected=P.expectations.find(x=>x.id===e.id);
 return {id:e.id,alias:e.alias||e.id,school:e.school||null,number:e.number||e.input.payload.target_question||null,
  first:{status:a.status,...a.computed},second:b?{status:b.status,...b.computed}:{status:'pending',score:null},
  delta:a.computed?.score!=null&&b?.computed?.score!=null?+(b.computed.score-a.computed.score).toFixed(1):null,
  expected:expected?{tier:expected.tier,gates:expected.gates,score:expected.score}:null,
  firstTierMatch:expected?a.computed?.problem_tier===expected.tier:null,secondTierMatch:expected?b?.computed?.problem_tier===expected.tier:null,
  secondGateMatch:expected?expected.gates.every(g=>b?.computed?.promotions?.includes(g)):null,
  reason:b?.raw?.short_reason||null,literacyEvidence:b?.raw?.literacy_evidence||null,
  selectedRoute:b?.raw?.viable_routes.find(r=>r.route_id===b.computed?.selected_route_id)||null,
  resultFile:path.resolve(file),startedAt:b?.startedAt||null,finishedAt:b?.finishedAt||null,usage:b?.evidence?.usage||null};
});
const aggregate=which=>{
 const complete=rows.filter(r=>r[which].status==='complete'),failed=rows.filter(r=>r[which].status==='failed');
 return {completed:complete.length,failed:failed.length,pending:30-complete.length-failed.length,failureRate:failed.length/30,
  tiers:complete.reduce((acc,r)=>{const t=r[which].problem_tier;acc[t]=(acc[t]||0)+1;return acc;},{}),
  gates:Object.fromEntries(['assembly','literacy','execution'].map(g=>{const n=complete.filter(r=>r[which].promotions?.includes(g)).length;return [g,{count:n,rateOfAll:n/30,rateOfScored:complete.length?n/complete.length:null}];})),
  externalTierMatches:rows.filter(r=>r.expected&&r[which+'TierMatch']).length};
};
const result={createdAt:new Date().toISOString(),labels:{first:firstLabel,second:secondLabel},promptHash:{first:approval.previousPromptHash,second:approval.promptHash},first:aggregate('first'),second:aggregate('second'),
  preservation:{round1Files:Object.keys(preserved).length,matched:true,sameQuestionPayloads:30,scorerSchemaInputUnchanged:true},rows};
const output=path.join(secondRoot,'comparison.json');fs.writeFileSync(output,JSON.stringify(result,null,2));
const fmt=v=>v.status==='complete'?`${v.problem_tier} / ${v.score}`:v.status==='failed'?'실패 / null':'대기';
const md=[`# 난이도 v1.2 ${firstLabel}·${secondLabel} 파일럿 비교`,'',`${secondLabel}: 완료 ${result.second.completed}, 실패 ${result.second.failed}, 대기 ${result.second.pending}.`,`외부 기대 티어 일치: ${result.first.externalTierMatches}/8 → ${result.second.externalTierMatches}/8.`,`이전 결과 ${result.preservation.round1Files}개 파일 해시 보존, 원문·이미지 30건 동일.`,
 '', `| ID | 학교·문항 | ${firstLabel} | ${secondLabel} | 변화 | 목표 | 일치 |`,'|---|---|---|---|---:|---|---|',
 ...rows.map(r=>`| ${r.alias} | ${r.school||'외부'} ${r.number||''} | ${fmt(r.first)} | ${fmt(r.second)} | ${r.delta??'—'} | ${r.expected?.tier||'—'} | ${r.expected?(r.secondTierMatch?'일치':'불일치'):'—'} |`),
 '','## 게이트 발동 (전체 30건 기준)','',...['assembly','literacy','execution'].map(g=>`- ${g}: ${result.first.gates[g].count}/30 → ${result.second.gates[g].count}/30`),
 '',...rows.flatMap(r=>[`## ${r.alias}`,r.reason||'',r.literacyEvidence||'',r.selectedRoute?.route_summary||'',`[${secondLabel} 원시 결과](${r.resultFile.replace(/\\/g,'/')})`,''])].join('\n');
fs.writeFileSync(path.join(secondRoot,'comparison.md'),md);console.log(JSON.stringify({first:result.first,second:result.second,preservation:result.preservation}));
