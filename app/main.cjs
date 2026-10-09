const {app,BrowserWindow,ipcMain,dialog,shell,Menu,screen}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const {spawn}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const {ProjectStore,normalizeQuestion,id,stamp,atomicWrite}=require('./store.cjs');
const {diagramSvg,inspectDiagram,questionDiagram}=require('./geometry.cjs');
const {validatePart}=require('./parts.cjs');

const ROOT=app.isPackaged?path.dirname(app.getPath('exe')):path.resolve(__dirname,'..');
const CODE_ROOT=path.resolve(__dirname,'..');
const DATA_DIR=process.env.EXAM_DATA_DIR||path.join(ROOT,'data');
app.setPath('userData',path.join(DATA_DIR,'desktop'));
app.setPath('sessionData',path.join(DATA_DIR,'desktop','session'));
const store=new ProjectStore(DATA_DIR);
const errorLog=new (require('./error-log.cjs').ErrorLog)(DATA_DIR);
const {GeminiAccessStore,blockedGeminiStatus}=require('./gemini-access.cjs');
const geminiAccessStore=new GeminiAccessStore(DATA_DIR);
const {Workflow}=require('./workflow.cjs');
const workflow=new Workflow({store,directory:DATA_DIR,getBridge:provider=>{if(provider==='claude')return examQueue.bridge(getClaudeBridge(),{provider});if(provider==='gemini'){const blocked=blockedGeminiStatus(geminiAccessStore.read());if(blocked)throw new Error(blocked.error);return examQueue.bridge(getGeminiBridge(),{provider});}return examQueue.bridge(getBridge());},getSettings:provider=>provider==='claude'?claudeSettings:provider==='gemini'?geminiSettings:aiSettings,onEvent:event=>send(event)});
const regionDetector=new (require('./region-detector.cjs').RegionDetector)({store,getBridge:provider=>workflow.getBridge(provider),getSettings:provider=>workflow.getSettings(provider)});
const preferencesPath=path.join(DATA_DIR,'ai-settings.json');
function readAiSettings(){
  try{
    const value=JSON.parse(fs.readFileSync(preferencesPath,'utf8'));
    if(typeof value.model==='string'&&/^[a-zA-Z0-9._:/-]{1,150}$/.test(value.model)&&typeof value.effort==='string'&&/^[a-z]{1,20}$/.test(value.effort))return{model:value.model,effort:value.effort};
  }catch{}
  return{model:'gpt-6-astra',effort:'medium'};
}
let aiSettings=readAiSettings();
const geminiPreferencesPath=path.join(DATA_DIR,'gemini-settings.json');
let geminiSettings={model:'gemini-3.8-flash-medium',effort:'medium'};
try{const saved=JSON.parse(fs.readFileSync(geminiPreferencesPath,'utf8'));if(typeof saved.model==='string'&&/^gemini-[a-z0-9.-]+$/.test(saved.model))geminiSettings={model:saved.model,effort:['low','medium','high'].includes(saved.effort)?saved.effort:'high'};}catch{}
const claudePreferencesPath=path.join(DATA_DIR,'claude-settings.json');
let claudeSettings={model:'sonnet',effort:'medium'};
try{claudeSettings=require('./claude.cjs').selection(JSON.parse(fs.readFileSync(claudePreferencesPath,'utf8')));}catch{}
let window,bridge,geminiBridge,claudeBridge,changingAccount=false;
const busy=new Map();const allowedOutputs=new Set();
const send=event=>{if(window&&!window.isDestroyed())window.webContents.send('exam:event',event);};
const examQueue=new (require('./exam-queue.cjs').ExamQueue)({directory:DATA_DIR,store,onEvent:send});
store.externalSource=(queueId,projectId)=>examQueue.state.items.find(i=>i.id===queueId&&i.projectId===projectId)?.currentPath;
store.ownsExternal=file=>examQueue.state.items.some(i=>i.projectId&&path.resolve(i.currentPath)===path.resolve(file));

const problemBusy=problemId=>busy.has(problemId)||[...examQueue.activeStages.values(),...examQueue.reservations.values()].some(a=>a.key?.split(':')[0]===problemId);

const updater=new (require('./github-update.cjs').GithubUpdater)({current:require('../package.json').version,root:ROOT,dataDir:DATA_DIR,packaged:app.isPackaged,onProgress:send});
let installingUpdate=false;
let questionBank;

function processRun(exe,args,{timeout=90000}={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(exe,args,{cwd:CODE_ROOT,windowsHide:true,env:{...process.env,PYTHONIOENCODING:'utf-8'}});
    let out='',err='';const timer=setTimeout(()=>{child.kill();reject(new Error('작업 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.'));},timeout);
    child.stdout.on('data',b=>{out+=b.toString();if(out.length>10e6)child.kill();});
    child.stderr.on('data',b=>{err+=b.toString();});
    child.on('error',e=>{clearTimeout(timer);reject(e);});
    child.on('close',code=>{clearTimeout(timer);if(code!==0)reject(new Error((err||out||`프로그램 종료 코드 ${code}`).slice(-5000)));else resolve(out.trim());});
  });
}
function pythonPath(){
  const paths=[process.env.EXAM_PYTHON,path.join(ROOT,'runtime','python','python.exe'),path.join(os.homedir(),'.cache','codex-runtimes','codex-primary-runtime','dependencies','python','python.exe')].filter(Boolean);
  const found=paths.find(p=>fs.existsSync(p));if(!found)throw new Error('문서 출력용 Python을 찾을 수 없습니다. 설정의 EXAM_PYTHON 경로 또는 runtime/python을 확인해 주세요.');return found;
}
function getBridge(){
  if(!bridge){const {CodexBridge}=require('./codex.cjs');bridge=new CodexBridge({cwd:store.projectsDir,onEvent:send});}
  return bridge;
}
function getClaudeBridge(){
  if(!claudeBridge){const {ClaudeBridge}=require('./claude.cjs');claudeBridge=new ClaudeBridge({cwd:store.projectsDir,requestsDir:path.join(DATA_DIR,'claude-requests'),runtimeDir:path.join(ROOT,'runtime','claude'),onEvent:send});}
  return claudeBridge;
}
function getGeminiBridge(){
  if(!geminiBridge){const {AntigravityBridge}=require('./antigravity.cjs');geminiBridge=new AntigravityBridge({cwd:store.projectsDir,requestsDir:path.join(DATA_DIR,'gemini-requests'),runtimeDir:path.join(ROOT,'runtime','gemini'),onEvent:send});}
  return geminiBridge;
}
async function geminiAccount(){
  const status=geminiAccessStore.read(),blocked=blockedGeminiStatus(status);if(blocked)return blocked;
  return {...await getGeminiBridge().getAccount(),subscription:{status,source:'user_setting'}};
}
function importSourceFiles(input, projectId){
  if(busy.size)throw new Error('AI 답변이 끝나거나 중지한 후 시험지를 열어 주세요.');
  const files=Array.isArray(input)?input:[input];
  if(!files.length)throw new Error('시험지 파일을 선택해 주세요.');
  for(const file of files){
  if(typeof file!=='string'||!file||!path.isAbsolute(file))throw new Error('컴퓨터에 저장된 시험지 파일을 놓아 주세요.');
  const extension=path.extname(file).toLowerCase();
  if(!['.pdf','.png','.jpg','.jpeg','.webp','.bmp'].includes(extension))throw new Error('PDF 또는 이미지(PNG, JPG, WEBP, BMP) 파일을 선택해 주세요.');
  let stat;
  try{stat=fs.statSync(file);}catch{throw new Error('시험지 파일을 찾을 수 없습니다. 파일이 이동되었는지 확인해 주세요.');}
  if(!stat.isFile())throw new Error('폴더가 아닌 시험지 파일을 선택해 주세요.');
  if(!stat.size)throw new Error('내용이 없는 파일입니다. 다른 시험지를 선택해 주세요.');
  if(stat.size>300*1024*1024)throw new Error('300MB 이하의 시험지를 선택해 주세요.');
  }
  return projectId?workflow.decorate(store.addSources(projectId,files)):workflow.initializeScope(store.create(files));
}
function selectedQuestions(project){
  return project.problems.flatMap(p=>[p.original,...(p.variants||[])].filter(q=>q?.include).map(q=>({...q,sourceId:p.id,sourceLabel:p.label,exportWithWarnings:q.approval?.status==='approved'&&['batch_user_authorized','manual_user_authorized'].includes(q.approval?.method),manualOutputApproved:q.approval?.status==='approved'&&q.approval?.method==='manual_user_authorized',exportWithoutSolution:require('./source-materials.cjs').questionOnlyCurrent(q,p),needsReview:Boolean(q.needsReview||p.needsReview)})));
}
function documentQuestion(q,audience){
 q=require('./structured-layout.js').forOutput(q);
 const keys=['id','sourceId','sourceLabel','kind','body','statementBox','boxSlot','bodyBorder','layoutDocument','layoutMode','choices','choiceLayout','diagramMode','sourceFigure','sourceFigures','hiddenFigureIds','sourceFigureDataUrl','layout','diagramPosition','figurePlacements','materialIds','include','diagram','observedDiagram','materialImages','materialPaths','solutionGuide','exportWithoutSolution','exportWithWarnings','manualOutputApproved','printedNumber','originalPoints','pointsAtBodyEnd','workspaceMm','breakBefore','webChoiceColumns','sourceCaption'];
 const output={...Object.fromEntries(keys.filter(k=>q[k]!==undefined).map(k=>[k,q[k]])),body:require('./question-text.cjs').withoutSourceNumber(require('./question-text.cjs').splitSourcePoints(q.body).body),answer:q.exportWithoutSolution?'':q.answer||'',solutionGuide:q.exportWithoutSolution?null:q.solutionGuide||null,solution:q.exportWithoutSolution?'':require('./solution-print.cjs').printableSolution(require('./solution-display.js').solutionText(q))};
 if(require('./solution-guide.js').current(q)&&!q.exportWithoutSolution)output.solutionGuide=require('./solution-guide.js').bind(output.solutionGuide,output);else output.solutionGuide=null;return output;
}
async function buildDocument(project,output,{archive=false,directory=null,renderOnly=false}={}){
  const questions=selectedQuestions(project);
  if(!questions.length)throw new Error('출력할 문제에서 「문서에 추가」를 선택해 주세요.');
  if(!archive&&questions.some(q=>q.approval?.status!=='approved'))throw new Error('사용자가 승인한 문항만 확정 출력할 수 있습니다.');
  if(!archive&&questions.some(q=>q.solutionDraft&&!q.exportWithoutSolution&&!q.manualOutputApproved))throw Error('보류된 풀이가 남은 문항입니다. 상세 사유를 확인하고 풀이를 다시 작성하거나 수정본을 선택하세요.');
  const unconfirmed=project.problems.some(p=>p.original?.include&&p.original.approval?.method!=='manual_user_authorized'&&!require('./source-materials.cjs').questionOnlyCurrent(p.original,p)&&p.recognition&&(!p.recognition.confirmed||p.recognition.sourceStale||p.recognition.rulesStale));
  if(!archive&&unconfirmed)throw Error('원문 판독을 다시 확인한 뒤 출력하세요.');
  const stale=questions.filter(q=>q.needsReview&&!q.exportWithoutSolution&&!q.manualOutputApproved);
  if(!archive&&stale.length)throw new Error('원문 수정 후 재확인이 필요한 문제가 있습니다. 대화로 풀이를 다시 검토한 후 추가해 주세요.');
  // Recognition preserves printed answers only; an approved original can
  // legitimately have no answer/solution. Generated items still require both.
  const missing=questions.filter(q=>!q.body?.trim()||(q.kind!=='original'&&!q.exportWithoutSolution&&!q.manualOutputApproved&&(!q.answer?.trim()||!q.solution?.trim())));
  if(!archive&&missing.length)throw new Error('출력할 문항의 본문 또는 유사문제의 정답·상세 풀이가 누락되었습니다. 해당 문항을 보완해 주세요.');
  const exportDir=directory||path.join(store.projectDir(project.id),'exports');fs.mkdirSync(exportDir,{recursive:true});
  const warnings=[];const sharp=require('sharp');
  if(project.settings.audience!=='student')for(const [index,q] of questions.entries())if(q.kind==='original'&&(!q.answer?.trim()||!q.solution?.trim()))warnings.push(`${index+1}번 원본문제: 저장된 정답 또는 상세 풀이가 없어 미주에 미입력으로 표시했습니다.`);
  const documentQuestions=questions.map(q=>documentQuestion(q,project.settings.audience));
  for(const q of documentQuestions){
    const sg=require('./solution-guide.js').current(q);if(sg){q.solutionGuideFigurePaths={};q.solutionGuideFigureImages={};for(const step of sg.steps){if(!step.view)continue;const guideRenderer=require('./solution-guide-render.js');const rendered=guideRenderer.figure(sg,step,{compact:guideRenderer.docxCompact(sg,step)});const file=path.join(exportDir,q.id+'-solution-'+sg.steps.indexOf(step)+'.png');await sharp(Buffer.from(rendered.svg)).resize({width:1760}).png().toFile(file);q.solutionGuideFigurePaths[step.id]=file;q.solutionGuideFigureImages[step.id]='data:image/png;base64,'+fs.readFileSync(file).toString('base64');}}
    const structure=require('./structured-layout.js'),state=structure.status(q);if(state.missing)throw Error(state.message);warnings.push(...structure.warnings(q));
    if(state.active){
      q.structureFigurePaths={};q.structureFigureImages={};
      for(const n of q.layoutDocument.nodes.filter(n=>n.type==='figure'&&n.origin==='printed'&&n.diagram)){
        const report=inspectDiagram(n.diagram);if(!report.ok)throw Error('복합 배치 도형 확인 필요: '+report.errors.join(' '));
        const svg=diagramSvg(n.diagram,structure.diagramOptions(q,n));if(!svg)throw Error('복합 배치 도형을 그리지 못했습니다: '+n.id);
        const file=path.join(exportDir,q.id+'-structure-'+n.id+'.png');await require('./png-file.cjs').writePng(sharp(Buffer.from(svg)),file);q.structureFigurePaths[n.id]=file;q.structureFigureImages[n.id]='data:image/png;base64,'+fs.readFileSync(file).toString('base64');
      }
    }
    const report=inspectDiagram(q.diagramMode==='source'||q.hiddenFigureIds?.includes('diagram')?null:q.diagram);
    if(!archive&&!report.ok&&!q.exportWithoutSolution&&!q.exportWithWarnings)throw new Error(`도형 조건을 확인한 후 출력해 주세요.\n${report.errors.join('\n')}`);
    const sourceProblem=project.problems.find(p=>p.id===q.sourceId);
    q.materialImages=await require('./source-materials.cjs').questionImages(sourceProblem,q);if(q.materialImages.length)warnings.push('원본 자료 이미지 사용 · 학생 필기 잔존 가능성을 확인하세요. 원본 crop은 편집 가능한 증명 복원으로 검증한 결과가 아닙니다.');
    let fallback=q.exportWithoutSolution&&!report.ok; if(!report.ok&&q.exportWithWarnings)warnings.push("검수 경고를 유지한 채 일괄 승인한 문항이 포함되어 있습니다.");
    if(q.diagramMode==='source'&&!q.hiddenFigureIds?.includes('diagram')){q.sourceFigureDataUrl=await require('./source-materials.cjs').sourceFigureImage(q);q.diagramPath=path.join(exportDir,`${q.id}-source-figure.png`);fs.writeFileSync(q.diagramPath,Buffer.from(q.sourceFigureDataUrl.split(',')[1],'base64'));}
    if(q.diagramMode!=='source'&&!q.hiddenFigureIds?.includes('diagram')&&!fallback&&(q.diagram||q.observedDiagram)){try{const svg=diagramSvg(questionDiagram(q));if(svg){q.diagramPath=path.join(exportDir,`${q.id}.png`);await require('./png-file.cjs').writePng(sharp(Buffer.from(svg)),q.diagramPath);}}catch(error){if(!q.exportWithoutSolution&&!q.exportWithWarnings)throw error;fallback=true;}}
    if(fallback&&q.kind==='variant'&&!q.manualOutputApproved)throw Error('유사문제 도형을 출력할 수 없습니다. 원본 그림으로 대체하지 않았습니다. 해당 유사문제의 도형을 다시 그리거나 문서에서 제외해 주세요. '+report.errors.join(' '));
    if(fallback&&q.manualOutputApproved){q.diagram=null;q.observedDiagram=null;warnings.push('사용자가 확인한 문항의 표시할 수 없는 도형은 제외했습니다. 원본 그림으로 대체할 수 있습니다.');fallback=false;}
    if(fallback&&state.active)throw Error('복합 배치 문항의 전체 영역을 원본 crop으로 대체할 수 없습니다. 도형을 수동 교정하세요.');
    if(q.diagramMode==='source')warnings.push('원본 이미지 사용 · 학생 필기 잔존 가능성을 확인하세요.');
    if(fallback){q.diagram=null;q.observedDiagram=null;q.materialImages.push(...await Promise.all((sourceProblem.cropPaths||[]).map(async file=>({label:'원본 문제 이미지',dataUrl:'data:image/png;base64,'+(await sharp(file).png().toBuffer()).toString('base64')}))));warnings.push('도형 검사 오류가 있는 문제는 원본 이미지를 함께 보존했습니다.');}
    q.materialIds=q.materialImages.map((m,i)=>m.id||`material-${i}`);q.materialPaths=[];for(const [i,m] of q.materialImages.entries()){const file=path.join(exportDir,`${q.id}-material-${i}.png`);fs.writeFileSync(file,Buffer.from(m.dataUrl.split(',')[1],'base64'));q.materialPaths.push(file);}
    warnings.push(...report.warnings);
  }
  const input=path.join(exportDir,'export-input.json');atomicWrite(input,{title:project.title,settings:project.settings,scope:project.scope,questions:documentQuestions});
  const measured=await require('./pdf-export.cjs').exportPdf({BrowserWindow,snapshotPath:input,directory:exportDir,measureOnly:true});
  if(renderOnly)return {warnings,snapshotPath:input};
  const stdout=await processRun(pythonPath(),[path.join(CODE_ROOT,'scripts','export_docx.py'),'--input',input,'--output',output],{timeout:120000});
  let report={};try{report=JSON.parse(stdout.split(/\r?\n/).filter(Boolean).at(-1));}catch{}
  atomicWrite(input,{...measured.snapshot,layout:report.layout||null});
  allowedOutputs.add(path.resolve(output));
  return {path:output,format:'docx',warnings:[...new Set([...warnings,...(report.warnings||[])])],layout:report.layout,snapshotPath:input};
}
async function buildUniqueWord(project,target){
 const {datedWordPath,publishWord}=require('./export-names.cjs');
 const exportDir=path.join(store.projectDir(project.id),'exports');fs.mkdirSync(exportDir,{recursive:true});
 const stageDir=fs.mkdtempSync(path.join(exportDir,'word-save-')),stage=path.join(stageDir,'document.docx');
 try{
  const result=await buildDocument(project,stage),output=publishWord(stage,datedWordPath(target));
  const manifest=path.join(stageDir,'document.layout.json');
  if(fs.existsSync(manifest)){
   try{const data=JSON.parse(fs.readFileSync(manifest,'utf8'));data.path=output;fs.writeFileSync(output.replace(/\.docx$/i,'.layout.json'),JSON.stringify(data,null,2),{flag:'wx'});}
   catch(error){result.warnings.push('Word 문서는 저장했으나 배치 기록을 별도로 저장하지 못했습니다: '+error.message);}
  }
  allowedOutputs.delete(path.resolve(stage));allowedOutputs.add(path.resolve(output));return {...result,path:output};
 }finally{
  allowedOutputs.delete(path.resolve(stage));
  for(const name of ['document.docx','document.layout.json'])try{fs.unlinkSync(path.join(stageDir,name));}catch(error){if(error.code!=='ENOENT')console.error('Word 임시 파일 정리 실패: '+error.message);}
  try{fs.rmdirSync(stageDir);}catch{}
 }
}
async function prepareHwpxDocument(docx,output){
  // Share the native equations, form pages and measured layout with web HWPX.
  // Save the verified native package directly; no Hancom process is needed.
  const stdout=await processRun(pythonPath(),[path.join(CODE_ROOT,'scripts','export_hwpx.py'),'--input',docx.snapshotPath,'--output',output],{timeout:120000});
  if(!fs.existsSync(output))throw new Error('HWPX 문서를 만들지 못했습니다.');
  let report={};try{report=JSON.parse(stdout.split(/\r?\n/).filter(Boolean).at(-1));}catch{}
  if(report.packageVerified!==true||!Number.isInteger(report.equations)||!Number.isInteger(report.pictures))throw new Error('HWPX 문서의 수식·그림 구조를 확인할 수 없습니다.');
  return {nativeEquations:report.equations,pictureImages:report.pictures,warnings:[]};
}
function registerHandlers(){
  const handle=(name,fn)=>ipcMain.handle(`exam:${name}`,async(event,...args)=>{
    if(!window||event.sender!==window.webContents)throw new Error('허용되지 않은 요청입니다.');
    if(installingUpdate)throw Error('업데이트를 설치하고 있습니다.');
    try{const result=await fn(...args);if(name==='exportDocument'&&result&&result.success!==false){try{questionBank?.afterExport?.(args[0]);}catch{console.warn('문제은행 자동 등록을 확인하세요. 출력 파일은 저장되었습니다.');}}return result;}catch(error){console.error(`[${name}] ${error.message}`);throw new Error(error.message);}
  });
  handle('checkUpdate',()=>updater.check());
  handle('downloadUpdate',selectedVersion=>updater.download(selectedVersion));
  handle('openUpdatePage',()=>shell.openExternal(require('./github-update.cjs').RELEASES+'/latest'));
  handle('installUpdate',async()=>{
   if(!app.isPackaged||!updater.pending)throw Error('업데이트 파일을 먼저 다운로드하세요.');
   if(busy.size||changingAccount)throw Error('진행 중인 작업을 마친 뒤 업데이트하세요.');
   installingUpdate=true;
   try{
    const child=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',updater.pending.script,'-Plan',updater.pending.planPath],{detached:true,windowsHide:true,stdio:'ignore',cwd:ROOT});
    await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();setTimeout(()=>app.quit(),500);return {restarting:true};
   }catch(e){installingUpdate=false;throw e;}
  });
  handle('readSourceFigure',async({projectId,problemId,questionId})=>{const p=store.get(projectId).problems.find(p=>p.id===problemId),q=[p?.original,...(p?.variants||[])].find(q=>q?.id===questionId);if(!q)throw Error('문항을 찾을 수 없습니다.');return require('./source-materials.cjs').sourceFigureImage(q);});
  handle('readMaterials',({projectId,problemId,questionId})=>{const p=store.get(projectId).problems.find(p=>p.id===problemId);if(!p)throw Error('문제가 없습니다.');const q=[p.original,...p.variants].find(q=>q?.id===questionId)||p.original;return q?require('./source-materials.cjs').questionImages(p,q):require('./source-materials.cjs').materialImages(p);});
  handle('ensureInputFocus',(explicit=false)=>{if(window.isFocused()&&(explicit===true||!window.webContents.isFocused())){window.webContents.focus();return true;}return false;});
  handle('includeWithoutSolution',params=>workflow.includeWithoutSolution(params));
  handle('boot',async()=>{let project=store.last(),reconnectNotice=null;try{project=workflow.decorate(await questionBank.rehydrate(project));}catch(error){if(!project?.problems?.some(p=>p.losslessStorage))throw error;project=null;reconnectNotice='무손실 저장 문항의 원본 확인이 필요합니다. 공동 문제은행에 연결한 뒤 저장 작업을 다시 열어 주세요. 기존 작업 파일은 보존했습니다.';}return {project,recent:store.list(),account:null,aiSettings:{...aiSettings},claudeSettings:{...claudeSettings},geminiSettings:{...geminiSettings},geminiAccess:geminiAccessStore.read(),version:app.getVersion(),notices:[...(store.takeNotices?.()||[]),...(reconnectNotice?[reconnectNotice]:[])]};});
  handle('dismissQuestionIssues',({projectId,problemId,questionId,version,texts})=>store.updateProblem(projectId,problemId,p=>{const q=[p.original,...p.variants].find(q=>q?.id===questionId);if(!q||q.version!==version)throw Error('문항이 변경되었습니다. 다시 확인하세요.');if(!Array.isArray(texts)||texts.some(t=>typeof t!=='string'))throw Error('삭제할 오류를 확인하세요.');q.dismissedDiagnostics=[...new Set([...(q.dismissedDiagnostics||[]),...texts])];}));
  handle('readErrors',()=>errorLog.read());
  handle('recordError',value=>errorLog.append(value));
  handle('removeErrors',ids=>errorLog.remove(ids));
  handle('resolveSourceIssues',params=>workflow.resolveSourceIssues(params));
  handle('ignoreSourceIssues',params=>workflow.ignoreSourceIssues(params));
  handle('getRulesSettings',({projectId}={})=>workflow.scopeSettings(projectId));
  handle('saveRule',params=>workflow.saveRule(params));
  handle('saveScope',({projectId,scope})=>workflow.saveScope(projectId,scope));
  handle('scopePreset',params=>workflow.scopePreset(params));
  handle('previewTask',params=>workflow.preview(params));
  handle('confirmSource',({projectId,problemId,reviewed,sourceVersion})=>workflow.confirmSource(projectId,problemId,{reviewed,sourceVersion}));
  handle('finalizeAutomatic',params=>{const project=workflow.finalizeAutomatic(params);const p=project.problems.find(p=>p.id===params.problemId);const ids=errorLog.resolve(params.projectId,params.problemId,p.diagnosticResolutions);send({type:'errors-resolved',ids});return project;});
  handle('approveQuestion',({projectId,problemId,questionId,approved})=>{const project=workflow.approve(projectId,problemId,questionId,approved);if(approved){const p=project.problems.find(p=>p.id===problemId);const ids=errorLog.resolve(projectId,problemId,p.diagnosticResolutions);send({type:'errors-resolved',ids});}return project;});
  handle('editQuestion',params=>workflow.editQuestion(params));
  handle('deleteVariant',params=>{if(problemBusy(params.problemId))throw Error('작업이 끝난 뒤 삭제해 주세요.');return workflow.deleteVariant(params);});

  handle('geminiAccount',geminiAccount);
  handle('claudeAccount',()=>getClaudeBridge().getAccount());
  handle('saveClaudeSettings',value=>{if(busy.size||changingAccount)throw Error('AI 작업이 끝난 뒤 모델을 변경하세요.');claudeSettings=require('./claude.cjs').selection(value);atomicWrite(claudePreferencesPath,claudeSettings);return {...claudeSettings};});
  handle('saveGeminiAccess',value=>{if(busy.size)throw new Error('AI 작업을 중지하거나 완료한 뒤 구독 상태를 변경하세요.');return geminiAccessStore.save(value);});
  handle('saveGeminiSettings',async value=>{
    if(busy.size)throw new Error('AI 답변이 끝난 후 모델을 변경해 주세요.');
    const status=await geminiAccount();
    if(!status.available)throw new Error(status.error);
    const model=status.models.find(m=>m.model===value?.model&&m.available!==false);if(!model)throw new Error('사용 가능한 Gemini 모델을 선택해 주세요.');
    geminiSettings={model:model.model,effort:model.effort};atomicWrite(geminiPreferencesPath,geminiSettings);return {...geminiSettings};
  });
  handle('openGeminiGuide',()=>shell.openExternal('https://antigravity.google/docs/cli/install/'));
  handle('classifyProblem',async(params)=>{
    const p=store.get(params.projectId).problems.find(p=>p.id===params.problemId);
    if(p?.recognition){const part=p.recognition.domains.length===1?p.recognition.domains[0]:'';return {project:workflow.setPart({...params,part}),part,reason:part?'인식된 영역을 문제 파트에 적용했습니다.':'혼합 영역이므로 수동 지정을 해제하고 인식된 모든 영역을 적용합니다.'};}
    throw new Error('원문 인식 시 영역을 함께 분류합니다. 먼저 원문 인식을 실행하세요.');
  });
  handle('importSource',async(options={})=>{
    let files=process.env.EXAM_TEST_SOURCE?[process.env.EXAM_TEST_SOURCE]:null;
    if(!files){const picked=await dialog.showOpenDialog(window,{title:options.projectId?'현재 시험지에 PDF · 사진 추가 (여러 개 선택 가능)':'시험지 PDF · 사진 불러오기 (여러 개 선택 가능)',properties:['openFile','multiSelections'],filters:[{name:'시험지 PDF / 사진',extensions:['pdf','png','jpg','jpeg','webp','bmp']},{name:'사진 PNG / JPG',extensions:['png','jpg','jpeg','webp','bmp']},{name:'PDF 문서',extensions:['pdf']}]});if(picked.canceled)return null;files=picked.filePaths;}
    return importSourceFiles(files,options.projectId);
  });
  handle('importDroppedSource',(files,projectId)=>importSourceFiles(files,projectId));
  handle('saveAiSettings',async value=>{
    if(busy.size)throw new Error('AI 작업이 끝난 뒤 모델을 변경하세요.');
    if(!value||typeof value.model!=='string'||typeof value.effort!=='string')throw new Error('모델과 추론 수준을 선택해 주세요.');
    const {validateModelSelection}=require('./codex.cjs');
    const account=await getBridge().getAccount();
    if(account.account?.type!=='chatgpt')throw new Error(account.error||'먼저 ChatGPT 계정으로 로그인해 주세요.');
    const selection=validateModelSelection(account.models,{...value,requireImage:true});
    const next={model:selection.model,effort:selection.effort};
    atomicWrite(preferencesPath,next);aiSettings=next;return{...next};
  });
  handle('openProject',async projectId=>{
    if(projectId)return store.write(workflow.decorate(await questionBank.rehydrate(store.get(projectId))));
    const picked=await dialog.showOpenDialog(window,{title:'저장한 프로젝트 열기',defaultPath:store.projectsDir,properties:['openFile'],filters:[{name:'프로젝트',extensions:['json']}]});
    if(picked.canceled)return null;return store.importProject(picked.filePaths[0]);
  });
  handle('maintenanceInfo',({projectId,options={}}={})=>{
    const maintenance=require('./project-maintenance.cjs');
    const projects=store.projectEntries().map(d=>{try{store.cache.delete(d.id);const p=store.get(d.id);return {id:d.id,title:p.title,missing:p.assetIssues||[]};}catch(error){return {id:d.id,title:d.project.title,error:error.message,missing:[]};}});
    return {projects,plan:projectId?maintenance.plan(store,projectId,options):null};
  });
  handle('maintainProject',async params=>{
    if(busy.size||changingAccount)throw Error('작업을 마치거나 중지한 뒤 데이터 관리를 실행하세요.');
    const maintenance=require('./project-maintenance.cjs');
    if(params.action==='backup')return maintenance.backup(store,params.projectId);
    if(params.action==='cleanup')return maintenance.cleanup(store,params);
    if(params.action==='reconnect'){
      const picked=await dialog.showOpenDialog(window,{title:'누락된 자료 다시 연결: '+params.name,properties:['openFile'],filters:[{name:'원본 자료',extensions:[path.extname(params.name).slice(1)]}]});
      if(picked.canceled)return null;return maintenance.reconnect(store,{projectId:params.projectId,name:params.name,file:picked.filePaths[0]});
    }
    throw Error('데이터 관리 작업을 확인하세요.');
  });
  handle('resetWorkspace',()=>{
    if(busy.size||changingAccount)throw new Error('진행 중인 작업이 끝나거나 중지한 뒤 새 작업을 시작해 주세요.');
    store.closeCurrent();
    return {ok:true};
  });
  handle('saveProject',project=>{
    const stored=store.get(project.id);
    for(const p of project.problems||[]){
      const old=stored.problems.find(x=>x.id===p.id);if(!old)throw new Error('기존 문제를 찾을 수 없습니다.');
      for(const key of ['recognition','recognitionHistory','originalHistory','revisionHistory','deletedVariants','runs'])p[key]=old[key];
      for(const q of [p.original,...(p.variants||[])].filter(Boolean)){
        const previous=[old.original,...(old.variants||[])].find(x=>x?.id===q.id);
        if(!previous)throw new Error('문항 생성·수정 기능을 사용하세요.');
        if(JSON.stringify(require('./workflow.cjs').content(q))!==JSON.stringify(require('./workflow.cjs').content(previous)))throw new Error('문항 내용은 수정 저장 기능으로 변경하세요.');
        const layout=q.layout,diagramPosition=['before','after'].includes(q.diagramPosition)?q.diagramPosition:previous.diagramPosition;Object.assign(q,previous,{layout,diagramPosition});
      }
    }
    project.scope=stored.scope;return workflow.decorate(store.save(project));
  });
  handle('readAsset',assetPath=>{
    if(!store.ownsAsset(assetPath))throw new Error('이 프로젝트의 시험지와 그림만 읽을 수 있습니다.');
    if(fs.statSync(assetPath).size>300*1024*1024)throw new Error('파일이 너무 큽니다.');
    const mime={'.pdf':'application/pdf','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.bmp':'image/bmp','.svg':'image/svg+xml'}[path.extname(assetPath).toLowerCase()];
    const base64=fs.readFileSync(assetPath).toString('base64');return{base64,mime,dataUrl:`data:${mime};base64,${base64}`};
  });
  handle('addRegion',params=>store.addRegion(params));
  handle('closeSource',params=>{
    if(busy.size||changingAccount)throw Error('진행 중인 작업이 끝나거나 중지한 뒤 파일을 닫아 주세요.');
    const result=store.closeSource(params);
    if(result.project)result.project=workflow.decorate(result.project);
    if(result.removedProblemIds.length){const ids=errorLog.read().filter(e=>e.projectId===params.projectId&&result.removedProblemIds.includes(e.problemId)).map(e=>e.id);if(ids.length){errorLog.remove(ids);send({type:'errors-resolved',ids});}}
    return result;
  });
  questionBank=require('./bank-main.cjs').installBank({getBridge:provider=>workflow.getBridge(provider),getSettings:provider=>workflow.getSettings(provider),directory:DATA_DIR,store,handle,shell,dialog,window:()=>window,safeStorage:require('electron').safeStorage,buildDocument,decorate:p=>workflow.decorate(p),send,appVersion:require('../package.json').version,blocked:()=>busy.size||changingAccount});
  require('./exam-queue-main.cjs').installExamQueue({queue:examQueue,store,workflow,regionDetector,bankAccess:()=>questionBank,handle,dialog,window:()=>window,busy});
  handle('detectRegions',async params=>{
    if(busy.size||changingAccount)throw Error('진행 중인 작업을 마친 뒤 문제영역을 찾아 주세요.');
    busy.set(params.requestId,true);
    try{return await regionDetector.run(params);}finally{busy.delete(params.requestId);}
  });
  handle('setProblemPart',({projectId,problemId,part})=>{
    if(busy.size)throw new Error('AI 답변이 끝나거나 중지한 후 파트를 변경해 주세요.');
    validatePart(part);
    return workflow.setPart({projectId,problemId,part});
  });
  handle('replaceRegion',params=>{if(problemBusy(params.problemId))throw new Error('생성을 중지한 후 영역을 수정해 주세요.');return store.replaceRegion(params);});
  handle('removeRegion',params=>{if(problemBusy(params.problemId))throw new Error('생성을 중지한 후 영역을 삭제해 주세요.');return store.removeRegion(params);});
  handle('removeProblem',({projectId,problemId})=>{if(problemBusy(problemId))throw new Error('처리 중인 문제는 중지한 후 삭제해 주세요.');return store.removeProblem(projectId,problemId);});
  handle('setPresentation',params=>{if(problemBusy(params.problemId))throw Error('처리 중인 문제는 완료 후 변경하세요.');return workflow.setPresentation(params);});
  handle('chat',async(params)=>{
    if(examQueue.state.mode==='running'||examQueue.active)throw Error('대기열을 일시정지하고 진행 중 요청이 정리된 뒤 개별 요청을 실행하세요.');
    if(changingAccount)throw Error('계정 변경이 끝난 뒤 다시 요청하세요.');
    if(problemBusy(params.problemId))throw new Error('이 문제의 응답이 진행 중입니다.');
    busy.set(params.problemId,true);
    try{const result=await workflow.run(params);{const p=result.project.problems.find(p=>p.id===params.problemId);const recovered={reasons:(p?.runs||[]).filter(r=>r.task===result.run.task&&r.requestId!==result.run.requestId&&['failed','held'].includes(r.status)).map(r=>r.reason)};const ids=errorLog.resolve(params.projectId,params.problemId,[...(p?.diagnosticResolutions||[]),recovered]);send({type:'errors-resolved',ids});}return result;}catch(error){
      // Persist for either provider even if the requesting view has changed.
      try{const entry=errorLog.append({projectId:params.projectId,problemId:params.problemId,text:error.message});send({type:'task-error',entry,problemId:params.problemId});}catch{}
      throw error;
    }finally{busy.delete(params.problemId);}
  });
  handle('cancelChat',async({problemId})=>{if(await regionDetector.cancel(problemId))return true;const a=bridge?await bridge.cancel(problemId):false;const b=geminiBridge?await geminiBridge.cancel(problemId):false;const c=claudeBridge?await claudeBridge.cancel(problemId):false;return a||b||c;});
  handle('account',async({force=false}={})=>{try{return await getBridge().getAccount({force});}catch(error){return{account:null,models:[],rateLimits:null,error:error.message};}});
  handle('login',async()=>{
    if(busy.size||changingAccount)throw Error('진행 중인 AI 작업이 끝난 뒤 계정을 변경하세요.');
    return require('./account-login.cjs').openChatGptLogin(getBridge(),shell);
  });
  handle('accountAction',async({provider,action}={})=>{
    if(!['codex','gemini','claude'].includes(provider)||!['login','logout','switch'].includes(action))throw Error('계정 작업을 확인하세요.');
    if(busy.size||changingAccount)throw Error('진행 중인 AI 작업이 끝난 뒤 계정을 변경하세요.');
    changingAccount=true;
    try{
      if(provider==='claude')return await getClaudeBridge().openAccountWindow(action);
      if(provider==='gemini')return await getGeminiBridge().openAccountWindow(action);
      if(action!=='login')await getBridge().logout();
      if(action==='logout')return {account:null,models:[],rateLimits:null};
      return await require('./account-login.cjs').openChatGptLogin(getBridge(),shell);
    }finally{changingAccount=false;}
  });
  handle('previewDocument',async({projectId,renderPdf=false})=>{const project=workflow.decorate(store.get(projectId));
   if(renderPdf){
    const exportDir=path.join(store.projectDir(projectId),'exports');fs.mkdirSync(exportDir,{recursive:true});
    const directory=fs.mkdtempSync(path.join(exportDir,'preview-')),word=path.join(directory,'source.docx');
    try{const doc=await buildDocument(project,word,{directory,renderOnly:true});const pdf=await require('./pdf-export.cjs').exportPdf({BrowserWindow,snapshotPath:doc.snapshotPath,directory,target:path.join(directory,'preview.pdf')});return {pdfBase64:fs.readFileSync(pdf).toString('base64'),settings:project.settings};}
    finally{allowedOutputs.delete(path.resolve(word));if(path.dirname(path.resolve(directory))===path.resolve(exportDir)&&path.basename(directory).startsWith('preview-'))fs.rmSync(directory,{recursive:true,force:true});}
   }
const questions=selectedQuestions(project).map(q=>documentQuestion(q,'teacher'));for(const q of questions){q.materialImages=await require('./source-materials.cjs').questionImages(project.problems.find(p=>p.id===q.sourceId),q);if(q.diagramMode==='source'&&!q.hiddenFigureIds?.includes('diagram'))q.sourceFigureDataUrl=await require('./source-materials.cjs').sourceFigureImage(q);}return{questions,settings:{...project.settings,audience:'teacher'}};});
  handle('exportDocument',async({projectId,format,audience='teacher',automatic=false,originalsOnly=false})=>{
    if(!['docx','hwpx','pdf'].includes(format))throw new Error('지원하지 않는 문서 형식입니다.');
    const project=workflow.decorate(store.get(projectId));project.settings.audience='teacher';if(automatic)for(const p of project.problems)for(const q of [p.original,...p.variants].filter(Boolean))q.include=!!q.include&&q.approval?.status==='approved'&&(!q.needsReview||q.approval?.method==='user_question_only');if(originalsOnly)for(const p of project.problems)for(const q of p.variants||[])q.include=false;if(!selectedQuestions(project).length)throw new Error('출력할 문제를 먼저 문서에 추가해 주세요.');
    const safeTitle=project.title.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,100)||'문제집';
    const defaultDir=process.env.EXAM_OUTPUT_DIR||path.join(ROOT,'결과물');fs.mkdirSync(defaultDir,{recursive:true});
    const {datedWordPath,availablePath}=require('./export-names.cjs');
    let target=process.env.EXAM_TEST_EXPORT;if(!target&&automatic===true){if(format!=='docx')throw Error('자동 저장은 Word 형식만 지원합니다.');target=path.join(defaultDir,safeTitle+'.docx');}
    if(!target){const selected=await dialog.showSaveDialog(window,{title:format==='hwpx'?'HWPX 문제집 저장':format==='pdf'?'PDF 문제집 저장':'DOCX 문제집 저장',defaultPath:['docx','pdf'].includes(format)?availablePath(datedWordPath(path.join(defaultDir,safeTitle+'.docx')).replace(/\.docx$/i,'.'+format)):path.join(defaultDir,`${safeTitle}.${format}`),filters:[{name:format==='hwpx'?'한글 HWPX 문서':format==='pdf'?'PDF 문서':'Word 문서',extensions:[format]}]});if(selected.canceled)return null;target=selected.filePath;}
    if(path.extname(target).toLowerCase()!==`.${format}`)target+=`.${format}`;
    if(format==='docx')return buildUniqueWord(project,target);
    if(format==='pdf'){
     const directory=path.join(store.projectDir(projectId),'exports','pdf-'+id());fs.mkdirSync(directory,{recursive:true});
     const doc=await buildDocument(project,path.join(directory,'source.docx'),{directory,renderOnly:true});
     const output=await require('./pdf-export.cjs').exportPdf({BrowserWindow,snapshotPath:doc.snapshotPath,directory,target});allowedOutputs.add(path.resolve(output));
     return {path:output,format:'pdf',warnings:doc.warnings};
    }
    const directory=path.join(store.projectDir(projectId),'exports','hwpx-'+id());
    fs.mkdirSync(directory,{recursive:true});
    const doc=await buildDocument(project,path.join(directory,'source.docx'),{directory,renderOnly:true});
    // Publish only the verified native package, on the destination volume.
    // A failed generation or rename never removes the previous saved file.
    const staged=path.join(path.dirname(target),`.${path.parse(target).name}.writing-${id()}.hwpx`);
    try{
      const report=await prepareHwpxDocument(doc,staged);
      if(fs.statSync(staged).size<100)throw new Error('HWPX 저장 파일을 확인할 수 없습니다.');
      fs.renameSync(staged,target);
      allowedOutputs.add(path.resolve(target));
      return{path:target,format:'hwpx',requestedFormat:'hwpx',success:true,warnings:[...doc.warnings,...report.warnings]};
    }finally{
      try{if(fs.existsSync(staged))fs.unlinkSync(staged);}catch(error){console.error(`HWPX 임시 파일 정리 실패: ${error.message}`);}
    }
  });
  handle('openPath',async file=>{
    const resolved=path.resolve(file);if(!allowedOutputs.has(resolved)&&!resolved.startsWith(path.resolve(store.projectsDir)+path.sep))throw new Error('앱에서 만든 파일만 열 수 있습니다.');
    if(!/\.(docx|hwp|hwpx|pdf|png|json)$/i.test(resolved))throw new Error('지원하지 않는 파일입니다.');const error=await shell.openPath(resolved);if(error)throw new Error(error);return true;
  });
}

async function createWindow(){
  const workArea=screen.getPrimaryDisplay().workArea;
  window=new BrowserWindow({x:workArea.x,y:workArea.y,width:workArea.width,height:workArea.height,minWidth:Math.min(1100,workArea.width),minHeight:Math.min(720,workArea.height),backgroundColor:'#f5f4f0',title:'문제공방 · Created by animochoi',show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  Menu.setApplicationMenu(null);
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  const localUrl=pathToFileURL(path.join(__dirname,'index.html')).toString();
  window.webContents.on('will-navigate',(event,url)=>{if(url!==localUrl)event.preventDefault();});
  window.once('ready-to-show',()=>window.show());
  await window.loadFile(path.join(__dirname,'index.html'));
  if(process.env.EXAM_DEVTOOLS==='1')window.webContents.openDevTools({mode:'detach'});
}

if(!app.requestSingleInstanceLock())app.quit();
else{
  app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.focus();}});
  app.whenReady().then(async()=>{store.migrateProjectFolders();registerHandlers();await createWindow();if(app.isPackaged)updater.check().catch(error=>console.warn('업데이트 자동 정리 보류:',error.message));}).catch(error=>{dialog.showErrorBox('문제공방 실행 오류',error.message);app.quit();});
  app.on('window-all-closed',()=>app.quit());
  app.on('before-quit',()=>{questionBank?.close();if(bridge)bridge.close();if(geminiBridge)geminiBridge.close();if(claudeBridge)claudeBridge.close();});
}
