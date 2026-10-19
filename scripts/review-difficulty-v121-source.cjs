'use strict';
// Offline, explicitly adjudicated derivative artifacts. Never imports a runner,
// writes a bank record, or represents edited model output as an original reply.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const I=require('../app/difficulty-v12/input.cjs'),P=require('../app/difficulty-v121/profile.cjs');
const Repair=require('../app/difficulty-v121/source-repair.cjs');
const {decide}=require('../app/difficulty-v121/policy.cjs');
const base=path.resolve(__dirname,'../artifacts/difficulty-v121');
const out=path.join(base,'source-review-20261019');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const digest=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const prior=read(path.join(base,'saved-validation-20261019/audit.json'));
const notes=[
 ['local_repair','본문과 그림의 DE·DF=6·8 표기가 서로 바뀌지만 답은 불변이다. BC=5, EF=10, 두 둘레 합36. 높이의 비와 무게중심으로 겹친 삼각형의 닮음비1:6, 둘레4이므로 32. 두 표기 모두 같은 계산이다. 원문 경고를 이 검토 기록에 보존하고 답에 영향 없는 것으로 한정 판정한다.'],
 ['source_hold','원문에도 AC=16, BC=10, 넓이120이다. 두 변으로 정해지는 넓이는 최대16×10÷2=80이므로 삼각형이 존재하지 않는다. 형식적 닮음 계산의90을 정답으로 확정하지 않는다. 원래 수치 확인이 먼저다.'],
 ['source_hold','원문에도 AB=5, AE=AP=BP=BD=3, 3[ABP]=5[APE]이다. BP:PE=5:3에서 PE=9/5. 이등변 APE의 높이로 계산하면 AB²=117/5로25와 다르다. 조건들이 양립하지 않으므로 어느 수치를 고칠지 원자료 확인이 필요하다.'],
 ['local_repair','원문 기본요금17000원·80분·초당4원이 맞다. 저장 응답의 부등식 계산 오류다. (35000−17000)/240+80=155이므로 정답은155분이며 올림 조건을 추가할 이유가 없다. 단위 환산과 일차부등식이라는 기존 풀이 구조와 평가 축을 유지한다.'],
 ['scope_hold','직각삼각형의 두 직각변8,15에서 빗변17은 맞다. 다만 이 입력의 범위 제한은 피타고라스·닮음·삼각비를 금지한다. 저장 응답에는 허용된 풀이와 유효한 평가가 없다. 출제 범위 설정을 먼저 확인해야 하며 자동으로 제한을 없애지 않는다.'],
 ['source_hold','원문에도 빗변11, 내접원 반지름5다. 공식상 넓이 r(c+r)=80이지만 빗변11인 직각삼각형의 최대 넓이는121/4=30.25다. 실현 불가능한 수치이므로 원자료 확인이 필요하다.'],
 ['source_hold','원문 순환소수는 (1)17/110, (2)7/33이다. 잘못 읽은 분수도 기약분수라는 조건이 없다. 원래17/33 외에17/66도 가능하다: 분모를110으로 잘못 읽으면17/110, 분자를14로 잘못 읽으면14/66=7/33. (1)(2)는 확정할 수 있지만 (3)의 유일성은 조건 확인이 필요하다.'],
 ['local_repair','정답④. 각 이등분선으로 생기는 EFGH는 직사각형이지만 정사각형일 필요는 없다. 저장 풀이와 평가 축은 정상이었고 독립 선지마다 d1을 재사용한 식별자 충돌만 있었다. 각 독립 가지 내부의 간선을 보존해 식별자를 구분한다.'],
 ['ai_needed','정답③50°. ID=IE=IF, 각DIE=100°. x=각IFD, y=각IFE라 하면 두 이등변삼각형과 중심 주위 각의 합으로100+(180−2x)+(180−2y)=360, 따라서 x+y=50. 저장 1단계는 금지된 원주각 정리를 사용했고 2단계는900000ms 시간 초과다. 허용 범위 풀이에 대한 난이도 그래프를 새로 평가해야 한다.'],
 ['source_hold','두 부품 불량 확률1/17,1/35만으로 합집합 확률은 결정되지 않는다. 교집합 t에 따라52/595−t이며 범위35/595~52/595다. 독립이면 의도한②3/35지만 원문에 독립이 명시되지 않았다. 다른 요인을 고려하지 않는다는 문구와 독립은 구별해 확인한다.'],
 ['local_repair','원문⑤는 넓이비가 아니라 닮음비4:9다. 인식 입력의 넓이비를 닮음비로 복원한다. 실제 닮음비2:3, 넓이비4:9이므로 옳지 않은 것은⑤. 저장 2단계가 이미 이미지의 이 답을 확인했다.'],
 ['local_repair','원문④는 AB=10, DF=5다. 입력의 DE를 DF로 복원한다. ④의 비는 지정된 대응변의 비가 아니고 B,E는 그 두 변의 끼인각이 아니어서 SAS를 보장하지 않는다. ②는AA,⑤는SAS이므로 정답②⑤. 저장 응답의 이미지 판독과 표준 조건 확인 구조를 재활용한다.'],
 ['source_hold','원문은 넓이가 나머지 넷과 다른 하나를 묻지만 중점을 제외하는 조건이 없다. 첫 네 넓이는 같고 다섯째는 CF:DF에 따라 달라진다. E가 중점이면 F도 중점이 되어 다섯 넓이가 모두 같다. 의도한⑤를 확정하려면 중점 제외 또는 항상 같은 넓이를 보장하는지 묻는 문구가 필요하다.'],
 ['local_repair','원문 본문은 원기둥이나 그림·모선·선지는 원뿔이다. 인식 오류가 아니라 원문 오자 교정본으로 원뿔을 명시한다. P:(P+Q):(P+Q+R)=1:8:27, Q:R=7:19이므로③57cm³. 원기둥 원문을 그대로 유지하면21cm³로 선지가 없다는 사실도 보존한다.'],
 ['ai_needed','원문 ㄹ에는 대응하는 변·각이라는 제한이 없다. 30-60-90 삼각형에서 한 삼각형의 짧은 직각변1, 다른 삼각형의 긴 직각변1로 잡으면 한 변과30°가 같지만 합동이 아니다. 따라서 ㄹ은 항상 참이 아니고 ㄷ만 참이어서 저장 정답①이 맞다. 기존 평가 응답들은 ㄹ을 ASA로 인정해②라고 답했다. 반례를 고려한 풀이 구조가 달라 기존 난이도 축을 그대로 확정할 수 없다.'],
 ['source_hold','원문은 단일 선택이지만③과⑤가 모두 참이다. 저장 정답도③⑤(원문 복수 정답)로 표시되어 있다. 둘 다 고르는 문제로 바꿀지 선지를 바꿀지 출제 의도 확인이 필요하며 한 선지를 임의 삭제하지 않는다.'],
 ['source_hold','원문 넓이비27:75에서 닮음비3:5. ①3:5와②9:15는 같은 비라 둘 다 맞다. 가장 간단한 자연수의 비라는 조건이 원문에 없어 단일 정답을 정할 수 없다. 축약 조건 추가 또는 선지 수정 여부 확인이 먼저다.'],
 ['source_hold','윷놀이 원문은 잡힌 말의 복귀·재출발과 지름길 선택 등 후속 규칙이 충분히 정해져 있지 않다. 저장9/16 계산은 A의 도→도 이후 이어지는 진행을 제외한다. 도→도에서는 게임이 끝나지 않고 이후 승패 가능성이 남는다. 원문 규칙 확정 없이 반복 계산하거나 하나의 확률로 고치지 않는다.'],
 ['source_hold','②의 이웃하는 두 각이 같은 사각형이라는 표현이 어떤 한 쌍을 뜻하면 등변사다리꼴도 포함돼3개, 모든 이웃한 쌍을 뜻하면 직사각형·정사각형2개다. ③은 별도로 거짓이다. 의도한 단일 정답③을 확정하려면②의 범위를 명확히 해야 한다.'],
 ['local_repair','정답③⑤. AE는 BC의 수직이등분선이고 EO=EB=EC, OA=OB>OE, 각AOC=135°, 각OEC=90°이며 합동 성질이 성립한다. 저장 응답의 독립 선지별 d1 충돌만 수정하고 모든 풀이·축·간선을 보존한다.'],
 ['ai_needed','정답②54°. AD=AB에서 각ABD=각ADB=72°, 평행선으로 각DBC=72°, BD=BC에서 각DCB=(180−72)/2=54°. 저장된 정상 모델 응답은 없고 실제 오류는 Selected model is at capacity. Please try a different model. 이므로 수학 풀이는 확정했지만 난이도 평가 그래프는 새로 필요하다.'],
 ['source_hold','원문이 합동의 대응 순서를 지정하지 않았다. ②는 RHS로 △ABC≅△EDF,③은 RHA로 △ABC≅△DEF가 되어 둘 다 두 삼각형의 합동을 보장한다. 의도한③만 남기려면 순서가 지정된 합동 조건을 묻는지 확인해야 한다.']
];
assert.equal(prior.remaining.length,22);assert.equal(notes.length,22);
const files={...prior.protectedFiles};
for(const dir of ['entries','saved-validation-20261019']){const walk=d=>{for(const x of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,x.name);if(x.isDirectory())walk(p);else files[path.relative(base,p).replaceAll('\\','/')]=digest(p);}};walk(path.join(base,dir));}
function verifyProtected(){for(const [rel,hash]of Object.entries(files))assert.equal(digest(path.join(base,rel)),hash,'historical evidence changed: '+rel);}
verifyProtected();
const keys={1:'7636f19e80ef114b6cd078ef02128df0cc7609b75dc4de503739ceecca30b88a',4:'2d845c1ab4b97b973a6fd65a2b61a3930dc061f543fc28ced7870e479c46a4e7',8:'94ba175b046da9ff32958784c9ce9e507ac771dd5bcb6d30c95ea3edc08956bc',11:'992baff33171222bd775a4c50d2c2173615448f5a5ca689ec8a4a322724b2ec3',12:'946d5bb1b7be8287615ff1811b1c0ed9fc238d4e6882934e452a937ca7511747',14:'5450b97f22c345ae8c52a6c5259e977f6e47c2e3199b8542e114b75cc7201410',20:'ccb674494b1a57ec6e5123efa4e1bbcc2d63a85959f2ac23798a052b2bc1b037'};
const all=[];fs.mkdirSync(path.join(out,'corrections'),{recursive:true});
const write=(p,v)=>fs.writeFileSync(path.join(out,p),JSON.stringify(v,null,2)+'\n','utf8');
function rubric(raw){return {confidence:raw.confidence,answer_confidence:raw.answer_confidence,reference_student_match:raw.reference_student_match,literacy_high:raw.literacy_high,routes:raw.viable_routes.map(r=>({uses_powerful_tool:r.uses_powerful_tool,execution_load:r.execution_load,execution_extreme:r.execution_extreme,parallel_branch_count:r.parallel_branch_count,groups:[r.critical_discoveries,...r.independent_branches.map(b=>b.critical_discoveries)].map(ds=>ds.map(({C,R,B,H,is_non_obvious})=>({C,R,B,H,is_non_obvious})))}))};}
for(const [idx,x]of prior.remaining.entries()){
 const n=idx+1,e=read(path.join(base,'entries',x.questionId+'.json')),question=structuredClone(e.input.payload.question),context=structuredClone(e.validationContext);
 const images=fs.readdirSync(path.join(out,'images')).filter(f=>f.startsWith(String(n).padStart(2,'0')+'-'+x.questionId.slice(0,8))).map(f=>({file:'images/'+f,sha256:digest(path.join(out,'images',f))}));
 assert(images.length>0,'missing reviewed image');
 assert.deepEqual(images.map(i=>i.sha256).sort(),e.input.images.map(i=>i.sha256).sort(),'reviewed images differ from saved input');
 const row={reviewIndex:n,questionId:x.questionId,originalRevisionId:e.revisionId,source:x.source,category:notes[idx][0],finding:notes[idx][1],images,storedAnswer:context.storedAnswer,originalReason:x.reason,originalProvenance:x.provenance,savedResponseFailures:x.savedResponseFailures,modelCalls:0};
 if(keys[n]){
  const file='calls/'+keys[n]+'/result.json',saved=read(path.join(base,file));let raw=structuredClone(saved.raw);const edits=[],questionEdits=[];
  assert.equal(saved.id,x.questionId,'response belongs to another item');
  const edit=(p,after)=>{const before=p.reduce((o,k)=>o[k],raw),op={path:p,before:structuredClone(before),after,rationale:row.finding};raw=Repair.applyReviewedEdits(raw,I.hash(raw),[op]);edits.push(op);};
  const qedit=(p,after)=>{const before=p.reduce((o,k)=>o[k],question);questionEdits.push({path:p,before,after,rationale:row.finding});let o=question;for(const k of p.slice(0,-1))o=o[k];o[p.at(-1)]=after;};
  const branch=(b,d,k)=>['viable_routes',0,'independent_branches',b,'critical_discoveries',d,k];
  if(n===1)edit(['assessment_uncertainty'],[]);
  if(n===4){
   edit(['derived_answer'],'(1) 60(x-80)초\n(2) 240(x-80)원\n(3) 155분');
   edit(['solution_summary'],'초과 시간은60(x-80)초, 추가 요금은240(x-80)원이다. 17000+240(x-80)≥35000에서 x≥80+18000/240=155이므로 최소155분이다.');
   edit(branch(0,2,'summary'),'부등식을 풀어 최소 주차시간을 결정한다.');edit(branch(0,2,'must_construct'),'x≥155이므로 최소155분');edit(branch(0,2,'hint_effect'),'부등식을 풀어 경계값155분을 구한다.');
  }
  if(n===8||n===20){const repaired=Repair.namespaceIndependentDiscoveryIds(raw);raw=repaired.raw;row.identifierChanges=repaired.changes;assert(repaired.changes.length>0);}
  if(n===11){
   qedit(['choices',4],question.choices[4].replace('넓이비','닮음비'));
   edit(['derived_answer'],'⑤');edit(['assessment_uncertainty'],[]);
   edit(['solution_summary'],'AB:DE=6:9=2:3이므로 AC=8, BC:EF=2:3이다. 대응각으로 각DEF=110°, 각BAC+각EFD=70°다. 닮음비2:3, 넓이비4:9이므로 원문⑤의 닮음비4:9는 거짓이다.');
   edit(['short_reason'],'명시된 닮음의 성질과 내각의 합을 적용하는 표준 확인 문제다.');
   edit(branch(4,0,'summary'),'닮음비는2:3이고 넓이비는4:9이므로 원문⑤는 거짓이다.');edit(branch(4,0,'clue_in_text'),'원문⑤: 닮음비는4:9');
  }
  if(n===12){
   qedit(['choices',3],question.choices[3].replace('{DE}','{DF}'));
   edit(['derived_answer'],'②, ⑤');edit(['assessment_uncertainty'],[]);
   edit(['solution_summary'],'②는 A=180°−50°−60°=70°=D이므로 AA 닮음이다. ⑤는 AB/DE=BC/EF=2이고 끼인각 B=E이므로 SAS 닮음이다. ①은 A와D가 다르다. ③은 같은 각이 해당 두 변의 끼인각이 아니다. 원문④는 AB=10, DF=5로 지정된 대응변의 비가 아니며 B,E도 해당 두 변의 끼인각이 아니므로 지정된 닮음을 보장하지 않는다.');
   edit(['short_reason'],'지정된 대응 순서에 따라 AA·SAS 조건을 선지별로 확인하는 표준 문제다.');
   edit(branch(3,0,'summary'),'AB=10, DF=5는 지정된 대응변 쌍이 아니며 주어진 각도 끼인각이 아니므로 SAS 닮음을 보장하지 않는다.');
   edit(branch(3,0,'clue_in_text'),'원문④: AB=10 cm, DF=5 cm');edit(branch(3,0,'must_construct'),'AB의 대응변은DE이며 AB와BC의 끼인각B에 대응해야 할 DF와EF의 끼인각은F임을 확인한다.');edit(branch(3,0,'hint_effect'),'대응변과 끼인각을 확인하면 SAS 적용 여부를 구분할 수 있다.');
  }
  if(n===14){
   qedit(['body'],question.body.replace('원기둥','원뿔'));row.editorialCorrection=true;
   edit(['derived_answer'],'③ 57 cm³');edit(['assessment_uncertainty'],[]);
   edit(['solution_summary'],'원문 오자 교정본의 원뿔에서 P:(P+Q):(P+Q+R)=1:8:27이다. 따라서 Q:R=7:19이므로 R=21×19/7=57 cm³이다.');
   edit(['short_reason'],'누적 원뿔로 묶는 표현 전환이 핵심이며 이후 부피비와 차 계산은 짧다.');
  }
  context.choices=structuredClone(question.choices);
  assert.deepEqual(rubric(raw),rubric(saved.raw),'rubric judgment changed');
  const evaluated=P.evaluate(raw,context);assert(evaluated.validation.valid,JSON.stringify({n,validation:evaluated.validation}));
  const originalStage=n===4?1:2;
  assert.equal(decide(originalStage,evaluated).status,'complete','saved stage requires escalation');
  // These are local reviewed versions, not new model responses or server revisions.
  const correction={kind:'local_source_review_derivative',status:'locally_validated',notForAutomaticImport:true,questionId:x.questionId,originalRevisionId:e.revisionId,originalInputHash:e.input.contentHash,originalEntrySha256:digest(path.join(base,'entries',x.questionId+'.json')),originalResponse:{file,sha256:digest(path.join(base,file)),key:saved.key,settings:saved.settings},review:row.finding,images,questionEdits,responseEdits:edits,identifierChanges:row.identifierChanges??[],correctedQuestion:question,validationContext:context,reviewedResponse:raw,validation:evaluated.validation,computed:evaluated.computed,profileVersion:P.version,numericRubricAndConfidenceUnchanged:true,modelCalls:0,productionWrites:0};
  correction.originalStage=originalStage;correction.stagePolicyDecision=decide(originalStage,evaluated);
  correction.localReviewIdentity=I.hash(correction);write('corrections/'+x.questionId+'.json',correction);
  row.correctionFile='corrections/'+x.questionId+'.json';row.localReviewIdentity=correction.localReviewIdentity;row.validation=evaluated.validation;row.computed=evaluated.computed;row.responseEdits=edits;row.questionEdits=questionEdits;
 }
 if(row.category==='ai_needed')row.requestedNextEvaluation={startingStage:n===21?1:2,reason:row.finding,automaticExecutionAuthorized:false,preserveCompletedItems:true};
 all.push(row);
}
verifyProtected();
const count=c=>all.filter(x=>x.category===c).length;
const summary={at:new Date().toISOString(),totalReviewed:22,localRepairs:count('local_repair'),sourceOrScopeHold:count('source_hold')+count('scope_hold'),aiEvaluationNeeded:count('ai_needed'),priorValidated:prior.summary.totalSuccesses,validatedIncludingLocalCorrections:prior.summary.totalSuccesses+count('local_repair'),remaining:22-count('local_repair'),modelCalls:0,productionWrites:0,protectedFilesUnchanged:Object.keys(files).length,profileVersion:P.version};
assert.equal(summary.localRepairs+summary.sourceOrScopeHold+summary.aiEvaluationNeeded,22);
write('audit.json',{summary,protectedFiles:files,items:all});write('summary.json',summary);
write('ai-needed.json',{executable:false,modelCalls:0,items:all.filter(x=>x.category==='ai_needed')});write('source-confirmation-needed.json',{items:all.filter(x=>x.category.endsWith('_hold'))});
const label=x=>`${x.source.school} ${x.source.originalNumber??x.source.originalOrder}번`;
const section=(title,rows)=>'## '+title+'\n\n'+rows.map(x=>`### ${label(x)}\n\n- 문항 ID: ${x.questionId}\n- 원문: ${x.images.map(i=>`[이미지](${i.file})`).join(' / ')}\n${x.correctionFile?`- 수정본: [검증 기록](${x.correctionFile})\n`:''}\n${x.finding}\n`).join('\n');
fs.writeFileSync(path.join(out,'report.md'),`# 남은 22문항 원문 대조 및 로컬 수정\n\n${summary.at}\n\n원문 이미지와 저장 응답을 대조했다. **7문항 로컬 수정·재검증, 3문항 난이도 AI 평가 필요, 12문항 원문·범위 확인 필요**다. AI 호출 0회, 운영 반영 0건. 기존1244건은 보존했고 로컬 교정본을 포함하면1251/1266건 검증 완료다.\n\n수정본은 원래 모델 응답을 덮어쓰지 않는 별도 검토 파생본이다. 식별자만 고친2건과 원문·계산에 대한 명시적 검토5건을 구분했다. 모델의 평가 축·신뢰도는 올리지 않았고 기존 엄격한 검증기를 그대로 통과시켰다. 신구중5번은 원문 자체의 오자 교정본으로만 유효하며 원기둥 원문을 정상이라고 판정한 것이 아니다. 신구중6번은 잘못 인식한 선지에 대한 풀이 설명을 국소 교정한 평가이므로 신규 독립 모델 평가와 구분한다.\n\n보존 대상 ${summary.protectedFilesUnchanged}개 파일의 SHA-256 일치를 실행 전후 확인했다. 자동 실행·원본/교사 필드 변경·성공 문항 재호출·운영 점수 변경은 없다.\n\n`+section('저장 응답 재활용으로 수정·검증한 7문항',all.filter(x=>x.category==='local_repair'))+'\n'+section('난이도 AI 평가가 필요한 3문항 — 아직 호출하지 않음',all.filter(x=>x.category==='ai_needed'))+'\n'+section('AI 재호출보다 원문·범위 확인이 먼저인 12문항',all.filter(x=>x.category.endsWith('_hold'))),'utf8');
console.log(JSON.stringify(summary,null,2));
