'use strict';
const fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
if(process.versions.electron){
 process.env.EXAM_OUTPUT_DIR=process.env.EXAM_OUTPUT_DIR||path.join(process.env.EXAM_DATA_DIR,'outputs');process.env.EXAM_PYTHON=process.env.EXAM_PYTHON||path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
 const {app,dialog}=require('electron');dialog.showErrorBox=(title,message)=>{console.error(title+': '+message);};const {recognition,item,validation}=require('./workflow-fixtures.cjs');
 global.__requests=[];global.__hold=false;
 global.__accountMode=process.env.EXAM_TEST_ACCOUNT_MODE||'paid';global.__geminiChecks=0;
 const models=[{id:'gpt-6-astra',model:'gpt-6-astra',displayName:'Astra',inputModalities:['text','image'],defaultReasoningEffort:'high',supportedReasoningEfforts:[{reasoningEffort:'high'},{reasoningEffort:'low'}]},{id:'gpt-5.6-sol',model:'gpt-5.6-sol',displayName:'Sol',inputModalities:['text','image'],defaultReasoningEffort:'low',supportedReasoningEfforts:[{reasoningEffort:'low'}]}];
 class FakeBridge{
  async login(){if(global.__loginFailure)throw Error('모의 로그인 실패');global.__accountActions=(global.__accountActions||[]).concat('codex:login');return{loginId:'mock-login',authUrl:'https://auth.openai.com/mock-login'};}
  async logout(){global.__accountActions=(global.__accountActions||[]).concat('codex:logout');global.__accountMode='missing';return{account:null,models:[],rateLimits:null};}
  async openAccountWindow(action){global.__accountActions=(global.__accountActions||[]).concat('gemini:'+action);return{opened:true,action};}
  async getAccount(){if(global.__holdAccount){global.__accountWaiting=true;await new Promise(resolve=>global.__releaseAccount=resolve);}if(global.__accountMode==='missing')return{account:null,models:[],error:'GPT 연결 없음'};return{account:{type:'chatgpt',email:'test@example.invalid',planType:global.__accountMode==='free'?'free':'pro'},models,rateLimits:{rateLimits:{primary:{usedPercent:12,windowDurationMins:300},secondary:{usedPercent:global.__accountMode==='exhausted'?100:25,windowDurationMins:10080}}}};}
  async run(request){fs.appendFileSync(path.join(process.env.EXAM_DATA_DIR,'bridge-calls.jsonl'),JSON.stringify({model:request.model,provider:this instanceof FakeGemini?'gemini':'codex',problem:request.context.id})+'\n');global.__requests.push({...request,testProvider:this instanceof FakeGemini?'gemini':'codex'});if(global.__hold)await new Promise(resolve=>global.__release=resolve);
   if(global.__failNext){global.__failNext=false;throw Error(global.__failureText||'모의 인식 실패');}
   if(request.execution.task==='region_detection')return {result:require('../app/codex.cjs').validateResult({regions:global.__detectedRegions||[{order:1,x:.08,y:.1,width:.4,height:.3},{order:2,x:.53,y:.1,width:.4,height:.3}]},request.execution.schema)};
   if(request.execution.task==='bank_metadata')return {result:{originalNumber:'17',primaryUnitId:require('../app/curriculum.js').leaves.find(x=>x.title.includes('평행사변형')).id,relatedUnitIds:[],conditionUnitIds:[],solutions:[],score:'4.7',reason:'모의 AI 추천 테스트'}};
   const data=JSON.parse(request.text.split('현재 작업 자료(분석 대상):\n')[1].split('\n\n사용자 요청:')[0]);const task=request.execution.task;
   let result=task==='recognition'?{reply:'원문 판독을 마쳤습니다.',recognition:recognition()}:task==='generation'?{reply:'유사문제를 만들었습니다.',items:Array.from({length:global.__returnedCount??data.count},()=>({...item(),difficulty:data.difficulty==='same'?'중':data.difficulty})),holdReason:''}:task==='validation'?{reply:'재검수 결과입니다.',reviews:data.targets.map(q=>({targetId:q.id,validation:validation()})),holdReason:''}:{reply:'수정 결과입니다.',item:data.revisionMode==='content'?item():null,correction:data.revisionMode==='correction'?recognition():null,changes:['요청 범위 수정'],holdReason:''};
   if(task==='recognition'&&result.recognition&&global.__recognitionSuffix)result.recognition.body+=global.__recognitionSuffix;
   if(task==='recognition'&&request.execution.recognitionTarget==='all'&&global.__recognitionIssues)result.recognition.uncertainties=global.__recognitionIssues;
   if(task==='recognition'&&request.execution.recognitionTarget==='diagram'){const r=recognition();r.observedDiagram.points[0].x-=1;if(data.additionalInstructions?.includes('바깥')){r.observedDiagram.angleLabelOverrides=[{angleIndex:0,x:6,y:6,leader:true}];r.observedDiagram.dimensions=[{from:'A',to:'C',start:{x:-1,y:-1},end:{x:8,y:-1},label:'8',origin:'printed',guideStyle:null,endpointStyle:'tick'}];}result={reply:'도형만 다시 그렸습니다.',observedDiagram:r.observedDiagram,uncertainties:[]};}
   if(task==='recognition'&&request.execution.recognitionTarget==='text'){const r=recognition();result={reply:'문장만 인식했습니다.',originalNumber:null,body:'문장만 다시 읽은 결과',givens:r.givens,statementBox:r.statementBox,choices:r.choices,conditions:r.conditions.filter(c=>c.source==='body'),printedAnswer:r.printedAnswer,printedSolution:r.printedSolution,uncertainties:[]};}
   if(task==='solve')result={reply:'원문 풀이를 작성했습니다.',answer:'2',solution:global.__solutionText||'확정된 조건에서 2를 구하고 대입해 검산합니다.',questionType:'single_value',validation:validation(),holdReason:''};
   if(task==='revision'&&data.revisionMode==='diagram'){const diagram={shadedRegions:[],equalAngleMarks:[],lines:[],equalLengthMarks:[],dimensions:[],angleLabelOverrides:null,angleLabelLeaders:'auto',coordinateSystem:'cartesian_y_up',...structuredClone(data.targets[0].diagram)};diagram.points.find(p=>p.name==='D').y=0;result={reply:'도형 좌표를 수정했습니다.',diagram,validation:validation(),holdReason:''};}
   if(task==='generation'&&global.__badDiagram)for(const i of result.items)i.question.diagram={shadedRegions:[],equalAngleMarks:[],lines:[],equalLengthMarks:[],dimensions:[],angleLabelOverrides:null,angleLabelLeaders:"auto",coordinateSystem:"cartesian_y_up",points:[{name:'A',x:0,y:0,labelDx:null,labelDy:null},{name:'B',x:3,y:0,labelDx:null,labelDy:null},{name:'C',x:1,y:0,labelDx:null,labelDy:null},{name:'D',x:2,y:1,labelDx:null,labelDy:null}],segments:[{from:'A',to:'B',dashed:false}],circles:[],angles:[],labels:[],constraints:[{type:'collinear',points:['A','B','C','D'],value:null}]};
   if(task==='recognition'&&result.recognition&&global.__numberedSource)result.recognition.body='12. '+result.recognition.body;
   if(task==='solve'&&(global.__holdSolve||global.__holdSolveForProblem===request.context.id))result.holdReason='모의 범위 검토 보류';
   if(task==='solve'&&data.autoRecover)Object.assign(result,{recognitionCorrection:global.__recoveryCorrection||null,correctionEvidence:global.__recoveryCorrection?['원본 첫 줄의 인쇄 문자를 다시 확인함']:[],notes:global.__recoveryNotes||['문구는 합동을 보장하는 조건인지 묻는 의도로 해석했습니다.']});
   return{result,tokens:null};
  }
  async cancel(){global.__release?.();return true;}close(){}
 }
 class FakeGemini extends FakeBridge{async getAccount(){global.__geminiChecks++;if(global.__holdGemini){global.__geminiWaiting=true;await new Promise(resolve=>global.__releaseGemini=resolve);}if(global.__geminiUnavailable)return{available:false,models:[],buckets:[],error:'Gemini 설치·로그인 확인 필요'};return{available:true,models:[{model:'gemini-test-high',displayName:'Gemini test high',effort:'high'},{model:'gemini-test-medium',displayName:'Gemini test medium',effort:'medium'}],buckets:[{window:'weekly',remaining_fraction:.6},{window:'5h',remaining_fraction:.8}],error:''};}}
 require('../app/codex.cjs').CodexBridge=FakeBridge;require('../app/antigravity.cjs').AntigravityBridge=FakeGemini;
 app.on('browser-window-created',(_e,w)=>{w.setSkipTaskbar(true);w.webContents.setBackgroundThrottling(false);});
 require('../app/main.cjs');
}else{
 // The old dropdown-driven flow is superseded by the chat/quick-action workflow.
 require('./desktop-compact-workflow.cjs');
}
