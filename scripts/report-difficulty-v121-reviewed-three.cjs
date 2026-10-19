'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const R=require('../app/difficulty-v121/retry.cjs'),P=require('../app/difficulty-v121/profile.cjs'),I=require('../app/difficulty-v12/input.cjs');
const root=path.resolve(__dirname,'../artifacts/difficulty-v121'),round=path.join(root,'reviewed-three-20261019-1');
const read=f=>R.read(path.join(round,f)),status=read('run-status.json'),manifest=read('manifest.json');
assert.equal(status.status,'finished');assert(!fs.existsSync(path.join(round,'runner.lock')));assert.equal(status.completed+status.failed+status.unresolved,3);
R.checkProtected(root,manifest);
const calls=fs.readdirSync(path.join(round,'calls'),{withFileTypes:true}).filter(x=>x.isDirectory()).map(x=>read('calls/'+x.name+'/result.json'));
calls.sort((a,b)=>a.startedAt.localeCompare(b.startedAt));
assert.equal(calls.length,status.dispatched);assert(calls.length<=7);assert.equal(new Set(calls.map(x=>x.key)).size,calls.length);
for(const c of calls){assert(manifest.rows.some(t=>t.questionId===c.id));assert(!manifest.successIds.includes(c.id));assert.equal(c.settings.provider,'codex-chatgpt-subscription');assert.equal(c.settings.automaticRetries,0);}
const rows=manifest.rows.map(t=>{
 const resultFile=path.join(round,'results',t.questionId+'.json'),failureFile=path.join(round,'failures',t.questionId+'.json');
 const r=fs.existsSync(resultFile)?R.read(resultFile):null,f=fs.existsSync(failureFile)?R.read(failureFile):null;
 const itemCalls=calls.filter(x=>x.id===t.questionId),last=itemCalls.at(-1);
 if(r?.final_status==='complete'){
  const e=R.read(path.join(root,'entries',t.questionId+'.json')),raw=r['stage'+r.final_stage+'_raw_json'];
  const v=P.evaluate(raw,e.validationContext);assert(v.validation.valid);assert.equal(v.computed.score,r.final_score);assert.equal(v.computed.problem_tier,r.final_tier);
 }
 return {questionId:t.questionId,school:t.source.school,number:t.source.originalNumber,status:r?.final_status||'unresolved',score:r?.final_score??null,tier:r?.final_tier??null,finalStage:r?.final_stage??null,calls:itemCalls.map(x=>({key:x.key,settings:x.settings,evidence:x.evidence,validation:x.validation,answer:x.raw?.derived_answer,solution:x.raw?.solution_summary})),failure:f,originalFilesUnchanged:true};
});
const pending=R.read(path.join(root,'source-review-20261019/source-confirmation-needed.json')).items;
assert.equal(pending.length,12);
const summary={at:new Date().toISOString(),completed:status.completed,failed:status.failed,unresolved:status.unresolved,modelCalls:calls.length,reusedStages:status.reusedStages,priorValidated:1251,validatedIncludingLocalCorrections:1251+status.completed,sourceConfirmationNeeded:12,productionWrites:0,protectedFilesUnchanged:Object.keys(manifest.protectedFiles).length};
const reviewConclusion='신동중7번의 새 풀이는 반지름과 직각삼각형 합동으로 접선 길이의 같음을 유도한 뒤 이등변삼각형의 각을 이용하므로 금지된 원주각 정리를 사용하지 않는다. 압구정중4번은 두 이등변삼각형과 평행선의 각을 이용해54°를 얻는다. 대명중8번의 medium/high 응답은 원문에 없는 대응 관계를 가정하여 ㄹ을 참으로 인정했다. 앞선 원문 대조의30-60-90 반례가 남아 있어 모델의②를 채택하지 않는다. 실제 오류는 answer_mismatch이며 교사·저장 정답① 및 원문은 변경하지 않았다.';
fs.writeFileSync(path.join(round,'audit.json'),JSON.stringify({summary,manifestHash:I.hash(manifest),items:rows,sourceConfirmationNeeded:pending},null,2));
const labels={complete:'검증 완료',failed:'검증 실패',unresolved:'결과 미확인'};
const table=rows.map(x=>`| ${x.school} ${x.number} | ${labels[x.status]} | ${x.score??'—'} | ${x.tier??'—'} | ${x.calls.length} |`).join('\n');
fs.writeFileSync(path.join(round,'report.md'),`# 지정 3문항 재평가 결과\n\n${summary.at}\n\n구독 로그인, 기존 모델 단계, 3문항 병렬. 신규 호출 ${summary.modelCalls}회 / 승인 상한7회, 앞 단계 재사용${summary.reusedStages}개, 자동 재시도0회. 이전 성공1251문항 제외. 원문·교사 필드·기존 결과 ${summary.protectedFilesUnchanged}개 파일 해시 불변. 운영 반영0건.\n\n| 문항 | 결과 | 점수 | 단계 | 호출 수 |\n|---|---|---:|---|---:|\n${table}\n\n`+rows.map(x=>`## ${x.school} ${x.number}\n\n${x.calls.map(c=>`- ${c.settings.model} ${c.settings.effort}: ${c.validation?.reason||'실행 결과 미확인'}; 답 ${c.answer??'없음'}\n\n${c.solution??c.evidence.errors?.map(e=>e.message).join('\n')??''}`).join('\n\n')}\n`).join('\n')+'\n## 원문 확인이 필요한 12문항\n\n'+pending.map(x=>`### ${x.source.school} ${x.source.originalNumber}\n\n${x.finding}\n`).join('\n'));
console.log(JSON.stringify(summary,null,2));
console.log(JSON.stringify(rows.map(({questionId,school,number,status,score,tier,failure})=>({questionId,school,number,status,score,tier,reason:failure?.errorMessage})),null,2));
fs.writeFileSync(path.join(round,'mathematical-postcheck.json'),JSON.stringify({at:summary.at,reviewConclusion,modelCalls:0,productionWrites:0},null,2));
fs.appendFileSync(path.join(round,'report.md'),'\n## 재평가 응답의 수학적 사후 확인\n\n'+reviewConclusion+'\n');
