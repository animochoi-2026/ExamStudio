'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const I=require('../app/difficulty-v12/input.cjs'),P=require('../app/difficulty-v121/intent-profile.cjs'),R=require('../app/difficulty-v121/retry.cjs'),Policy=require('../app/difficulty-v121/policy.cjs');
const root=path.resolve(__dirname,'../artifacts/difficulty-v121'),out=path.join(root,'intended-answer-20261019');
const original=R.read(path.join(root,'saved-validation-20261019/audit.json')),source=R.read(path.join(root,'source-review-20261019/audit.json'));
const authorization='문제에서 모순이 발견된다 하더라도 출제자의 의도대로 정답이 나온다면 그걸 정답으로 인정해. 출제자의 의도대로 풀었을때 정답이 나오는건 그대로 난이도 측정하고나면 뭐가 남는지 가르쳐줘.';
for(const f of ['manifest.json','approval.json','started.json','runner.lock'])assert(!fs.existsSync(path.join(out,f)),'preparation already frozen or started');
fs.mkdirSync(out,{recursive:true});for(const d of ['recovered','entries'])fs.mkdirSync(path.join(out,d),{recursive:true});
const protectedFiles={...R.read(path.join(root,'reviewed-three-20261019-1/manifest.json')).protectedFiles};
for(const dir of ['snapshot','reviewed-three-20261019-1']){const walk=d=>{for(const f of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,f.name);if(f.isDirectory())walk(p);else protectedFiles[path.relative(root,p).replaceAll('\\','/')]=R.digest(p);}};walk(path.join(root,dir));}
R.checkProtected(root,{protectedFiles});
const specs=[
 ['1b966','calls/bbd1eff5548dd62795f3b921d3ad7675a2c0ab10918b15c4a7564305dc68f475/result.json',2,'⑤ 90cm²','원래 해설이 명시한 AA 닮음과 넓이비4:1의 의도 풀이를 인정한다. 그래프에 실현 가능성 검증은 없다.'],
 ['744cc','retry-20261019-1/calls/39aa51c29f31ee190f4a491f5528a38c5b08c6ab36e3d7fbd5b60c237efa40c8/result.json',3,'②','저장 해설에 명시된 독립 해석을 적용한다. 독립을 전제로 한 여사건/분할 풀이만 평가하고 원문 상하한 탐색 경로는 제외한다.'],
 ['8f1e','calls/71af374a436f11c0ed6e350a7e0644dd866056dd0414dc208988893b6c6e0737/result.json',3,'⑤','저장 해설대로 넓이가 같다고 보장되지 않는 것을 고르는 의도를 인정한다. 등적 연결과 일반적인 비교 그래프는 그대로다.'],
 ['a301','calls/da5bf38ef7b7c4d1093309743a13cd0ef88722f131aa26d449ea22ba8b778db1/result.json',2,'③, ⑤','원문 단일 선택 경고는 보존하고 저장 정답·해설이 인정한 두 참 선지를 그대로 인정한다.'],
 ['ba911','calls/68747dfa2839c24fd0b62fe8880e4c93f47b69ce85b12f82cf0e4e29e7d27d4b/result.json',2,'3:5','저장 해설의 확정된 닮음비3:5를 수치 답으로 인정한다. 중복 선지 경고는 남긴다.'],
 ['de02','calls/4683059367f7c0e0b676fb0959171c6c996dc7f81e0cc0330c466108db5f99ed/result.json',3,'③','저장 해설의 모든 이웃한 각쌍이라는 해석을 적용한다. 해당 해석으로 이미 작성된 평가 그래프를 재사용한다.']
];
const recovered=[];
for(const [prefix,file,stage,answer,rationale]of specs){
 const x=original.remaining.find(x=>x.questionId.startsWith(prefix)),entry=R.read(path.join(root,'entries',x.questionId+'.json')),saved=R.read(path.join(root,file)),raw=structuredClone(saved.raw),catalog=R.read(path.join(root,'snapshot',x.questionId+'.json')).catalog;
 const edits=[];if(raw.derived_answer!==answer){edits.push({path:'derived_answer',before:raw.derived_answer,after:answer});raw.derived_answer=answer;}
 if(prefix==='744cc'){edits.push({path:'viable_routes',removedRouteIds:['r3'],reason:'평가용 독립 해석에서는 원문 오류를 검토하는 상하한 경로가 필요 없음'});raw.viable_routes=raw.viable_routes.filter(r=>r.route_id!=='r3');}
 if(prefix==='ba911'){edits.push({path:'answer_type',before:raw.answer_type,after:'expression'});raw.answer_type='expression';}
 const context=structuredClone(entry.validationContext),contextEdits=[];
 if(prefix==='a301'){contextEdits.push({field:'storedAnswer',before:context.storedAnswer,after:'③, ⑤',reason:'원문 복수 정답이라는 주석을 검증용 사본에서만 분리'});context.storedAnswer='③, ⑤';}
 const review={policy:'intended-answer-20261019-1',authorization,rawHash:I.hash(raw),contextHash:I.hash(context),sourceSolutionHash:I.hash(catalog.content.solution),rationale};
 const result=P.evaluateReviewed(raw,context,review);assert(result.validation.valid,JSON.stringify({prefix,validation:result.validation}));assert.equal(Policy.decide(stage,result).status,'complete');
 const record={questionId:x.questionId,source:x.source,originalRevision:entry.revisionId,stage,originalFile:file,originalSha256:R.digest(path.join(root,file)),originalRawHash:I.hash(saved.raw),review,edits,contextEdits,validationContext:context,sourceSolution:catalog.content.solution,result,modelCalls:0,productionWrites:0};
 fs.writeFileSync(path.join(out,'recovered',x.questionId+'.json'),JSON.stringify(record,null,2));recovered.push({questionId:x.questionId,source:x.source,score:result.computed.score,tier:result.computed.problem_tier,file:'recovered/'+x.questionId+'.json'});
}
const pending=[
 ['22a1','인쇄 수치 전체의 실현 가능성 검사는 별도 주의점이다. 주어진 넓이·등길이·각 조건을 적용해 출제 의도에 따른 목표 각을 구하는 풀이의 난이도를 평가한다.'],
 ['477c','인쇄 조건의 실현 가능성 모순은 별도 주의점이다. 주어진 길이 조건을 형식적으로 적용해 출제 의도에 따른 넓이를 구하는 풀이의 난이도를 평가한다.'],
 ['4e6a','잘못 읽은 두 분수도 각각 기약분수라고 해석한다. 원문의 모든 소문항을 풀어 평가한다.'],
 ['be44','구하는 사건은 A가 이번 차례 안에 이기는 것이다. 상대 말을 잡거나 윷·모가 나와 얻는 추가 던지기도 이번 차례에 포함한다. 상대의 다음 차례 이후 전체 경기의 최종 승률은 구하지 않는다.'],
 ['fd9a','꼭짓점의 대응은 A와 D, B와 E, C와 F로 고정하여 합동 조건을 판단한다.'],
 ['459a','이 평가의 시험범위에는 피타고라스 정리가 포함되며 사용할 수 있다.'],
 ['9b049','항상 옳은 진술인지 원문 조건만으로 판정한다. 원문에 명시되지 않은 변과 각의 대응 관계를 추가로 가정하지 않는다.']
];
const rows=pending.map(([prefix,interpretation])=>{
 const x=original.remaining.find(x=>x.questionId.startsWith(prefix)),e=R.read(path.join(root,'entries',x.questionId+'.json')),q=structuredClone(e.input.payload.question),old=structuredClone(e.input),catalog=R.read(path.join(root,'snapshot',x.questionId+'.json')).catalog;
 q.body+='\n\n[승인된 평가용 해석 — 원문 보존]\n'+interpretation;
 if(prefix==='459a'){old.payload.solution_restrictions=old.payload.solution_restrictions.filter(x=>x!=='피타고라스 정리');old.payload.scope_context.forbidden=old.payload.scope_context.forbidden.filter(x=>x!=='피타고라스 정리');old.payload.scope_context.units.push('피타고라스 정리');}
 e.input=I.input({question:q,scope:old.payload.curriculum_scope,scopeContext:old.payload.scope_context,restrictions:old.payload.solution_restrictions,images:old.images,target:old.payload.target_question});
 const originalContext=structuredClone(e.validationContext);
 if(prefix==='4e6a')e.validationContext.storedAnswer='(1) 17/110\n(2) 7/33\n(3) 17/33=0.\\overline{51}';
 e.localIntentReview={originalContentHash:old.contentHash,originalValidationContext:originalContext,interpretation,sourceSolutionHash:I.hash(catalog.content.solution),originalEntryHash:R.digest(path.join(root,'entries',x.questionId+'.json'))};
 const entryFile='entries/'+x.questionId+'.json';fs.writeFileSync(path.join(out,entryFile),JSON.stringify(e));
 return {questionId:x.questionId,revisionId:e.revisionId,source:x.source,identity:P.inputIdentity(e),entryFile,entryHash:R.digest(path.join(out,entryFile)),startingStage:2,oldStage1:x.provenance.find(o=>o.stage===1)?.file,interpretation,sourceSolutionHash:I.hash(catalog.content.solution)};
});
const remaining=[];
const successIds=R.read(path.join(root,'targets.json')).rows.map(x=>x.question_id).filter(id=>!rows.some(x=>x.questionId===id)&&!remaining.some(x=>x.questionId===id));assert.equal(successIds.length,1259);
const clarifications=['경원중 2025년문제라면 피타고라스 써도 됨. 그당시엔 시험범위 안이었음. 2026년도부터 바뀐것','대명중 8번 대응하는 이라는 조건을 가정하면 안됨 1번 맞음.'];
const manifest={roundId:'intended-answer-20261019',authorization,clarifications,createdAt:new Date().toISOString(),rows,recovered,remaining,successIds,protectedFiles,profileVersion:P.version,promptHash:P.promptHash,schemaHash:P.schemaHash,stages:Policy.stages,maximumCalls:14,concurrency:3,automaticRetries:0};
R.checkProtected(root,manifest);fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));fs.writeFileSync(path.join(out,'approval.json'),JSON.stringify({granted:true,manifestHash:I.hash(manifest),maximumCalls:14,concurrency:3,automaticRetries:0,authorization,clarifications}));
fs.writeFileSync(path.join(out,'run-status.json'),JSON.stringify({status:'prepared',completed:0,failed:0,unresolved:0,total:7,dispatched:0,localRecovered:6}));
console.log(JSON.stringify({recovered:recovered.map(x=>({school:x.source.school,number:x.source.originalNumber,score:x.score,tier:x.tier})),newTargets:rows.length,maximumCalls:14,remaining:remaining.length},null,2));
