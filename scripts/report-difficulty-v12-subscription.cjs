'use strict';
const fs=require('node:fs'),path=require('node:path');
const R=require('../app/difficulty-v12/subscription.cjs'),I=require('../app/difficulty-v12/input.cjs'),S=require('../app/difficulty-v12/schema.cjs'),P=require('../app/difficulty-v12/pilot.cjs');
const [manifestFile,root,reportFile]=process.argv.slice(2);
if(!manifestFile||!root||!reportFile)throw Error('manifest, result directory, report JSON path required');
const entries=JSON.parse(fs.readFileSync(manifestFile,'utf8'));R.validatePilot(entries);
const totals={input_tokens:0,cached_input_tokens:0,output_tokens:0,reasoning_output_tokens:0},rows=[];
for(const e of entries){
 const key=I.hash({inputVersion:e.input.inputVersion,evaluationVersion:R.evaluationVersion}),file=path.join(root,key,'result.json');
 const r=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
 if(r?.raw&&JSON.stringify(S.evaluate(r.raw).computed)!==JSON.stringify(r.computed))throw Error('Saved score mismatch: '+e.id);
 for(const k of Object.keys(totals))totals[k]+=r?.evidence?.usage?.[k]||0;
 const expected=P.expectations.find(x=>x.id===e.id),c=r?.computed;
 rows.push({id:e.id,alias:e.alias||e.id,school:e.school||null,number:e.number||e.input.payload.target_question,status:r?.status||'pending',computed:c||null,reason:r?.raw?.short_reason||null,selectedSummary:r?.raw?.viable_routes.find(x=>x.route_id===c?.selected_route_id)?.route_summary||null,
  seconds:r?Math.round((Date.parse(r.finishedAt)-Date.parse(r.startedAt))/1000):null,usage:r?.evidence?.usage||null,resultFile:path.resolve(file),
  expected:expected?{tier:expected.tier,score:expected.score,gates:expected.gates}:null,
  mismatch:expected&&r?[...(c?.problem_tier!==expected.tier?['tier']:[]),...expected.gates.filter(g=>!c?.promotions?.includes(g)).map(g=>'gate:'+g),...(expected.score!=null&&c?.score!=null&&Math.abs(c.score-expected.score)>=1?['score_delta_ge_1']:[])]:[]});
}
const report={createdAt:new Date().toISOString(),provider:R.settings,evaluationVersion:R.evaluationVersion,manifestHash:R.validatePilot(entries),completed:rows.filter(x=>x.status==='complete').length,failed:rows.filter(x=>x.status==='failed').length,pending:rows.filter(x=>x.status==='pending').length,usage:totals,externalMismatches:rows.filter(x=>x.expected&&x.mismatch.length).map(x=>({id:x.id,mismatch:x.mismatch})),passed:false,acceptance:'원문·범위·게이트 대조 결과와 별도 검토 필요. 이 보고서는 운영 활성화를 수행하지 않습니다.',rows};
fs.writeFileSync(reportFile,JSON.stringify(report,null,2));
const md=['# 난이도 v1.2 구독 파일럿 결과',`완료 ${report.completed}/30 · 실패 ${report.failed} · 대기 ${report.pending}`,`모델 ${R.settings.model} / high / ChatGPT 구독. 운영 점수 변경 없음.`,`평가 버전: ${R.evaluationVersion}`,'','| ID | 문항 | 결과 | 목표 | 시간(초) |','|---|---|---|---|---|',...rows.map(x=>`| ${x.alias} | ${x.school||'외부'} ${x.number||''} | ${x.computed?.problem_tier||x.status} / ${x.computed?.score??'—'} | ${x.expected?.tier||'—'} | ${x.seconds??'—'} |`),'',`사용량: ${JSON.stringify(totals)}`,'출력 토큰과 reasoning_output_tokens는 공급자 집계 의미가 다를 수 있어 합산하지 않습니다. API 달러 비용으로 환산하지 않습니다.','',...rows.flatMap(x=>[`## ${x.alias}: ${x.school||'외부'} ${x.number||''}`,x.reason||'평가 대기',x.selectedSummary||'',x.mismatch.length?'목표 불일치: '+x.mismatch.join(', '):'',`[원시 판정과 결과](${x.resultFile.replace(/\\/g,'/')})`,''])].join('\n');
fs.writeFileSync(reportFile.replace(/\.json$/,'.md'),md);console.log(JSON.stringify({completed:report.completed,failed:report.failed,pending:report.pending,externalMismatches:report.externalMismatches}));
