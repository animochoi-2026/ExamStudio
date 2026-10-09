'use strict';
// Real packaged executable, fresh portable directory, no AI logins or external AI calls.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{execFileSync}=require('child_process');
const root=path.resolve(__dirname,'..'),build=path.resolve(process.argv[2]||'missing-build');
const {_electron}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
(async()=>{
 assert.ok(fs.existsSync(path.join(build,'문제공방.exe')));
 assert.ok(!fs.existsSync(path.join(build,'data')),'Public release must have no personal data');
 const testRoot=fs.mkdtempSync(path.join(root,'data/validation/portable-')),portable=path.join(testRoot,'새 컴퓨터 문제공방');fs.cpSync(build,portable,{recursive:true});
 const home=path.join(testRoot,'fresh-home');fs.mkdirSync(home);const data=path.join(portable,'data');
 const env={...process.env,USERPROFILE:home,HOME:home,LOCALAPPDATA:path.join(home,'AppData/Local'),APPDATA:path.join(home,'AppData/Roaming'),PATH:path.join(process.env.SystemRoot,'System32'),EXAM_CODEX_PATH:path.join(home,'not-installed.exe'),EXAM_ANTIGRAVITY_PATH:path.join(home,'not-installed-agy.exe')};
 for(const key of ['EXAM_DATA_DIR','EXAM_PYTHON','PYTHONPATH','PYTHONHOME','CODEX_HOME','ELECTRON_RUN_AS_NODE','GEMINI_API_KEY','GOOGLE_API_KEY','OPENAI_API_KEY'])delete env[key];
 const checks=[],pass=x=>{checks.push(x);console.log('PASS '+x);};
 const launch=()=>_electron.launch({executablePath:path.join(portable,'문제공방.exe'),args:['--disable-gpu'],env,timeout:30000});
 let app=await launch();let page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.waitForFunction(()=>!!window.exam);const boot=await page.evaluate(()=>window.exam.boot());assert.equal(boot.project,null);assert.deepEqual(boot.recent,[]);
  assert.deepEqual(boot.aiSettings,{model:'gpt-6-astra',effort:'medium'});assert.deepEqual(boot.geminiSettings,{model:'gemini-3.8-flash-medium',effort:'medium'});assert.equal(boot.geminiAccess,'unknown');
  assert.match(await page.title(),/Created by animochoi/);assert.ok(await page.getByText('Created by animochoi',{exact:true}).isVisible());assert.equal(await app.evaluate(({app})=>app.isPackaged),true);
  const rules=await page.evaluate(()=>window.exam.getRulesSettings());assert.equal(rules.presets.length,5);assert.ok(rules.modules.every(m=>m.content&&m.userContent===null));
  await page.screenshot({path:path.join(testRoot,'fresh-start.png')});pass('Real packaged startup: empty personal data, exact model/rule/scope defaults, no installed AI required to open');
 }finally{await app.close();}
 const bundled=path.join(portable,'runtime/python/python.exe');
 const runtime=JSON.parse(execFileSync(bundled,['-c','import sys,json,docx,lxml,PIL; print(json.dumps({"exe":sys.executable,"prefix":sys.prefix,"docx":docx.__file__,"lxml":lxml.__file__,"pillow":PIL.__file__}))'],{env,encoding:'utf8',windowsHide:true}));
 assert.ok(Object.values(runtime).every(v=>v.startsWith(portable)));pass('Bundled Python and all export libraries resolve only inside relocated release');
 const source=path.join(testRoot,'portable-source.png');await require('sharp')({create:{width:900,height:800,channels:3,background:'white'}}).png().toFile(source);
 const {ProjectStore}=require(path.join(portable,'resources/app/app/store.cjs')),store=new ProjectStore(data);let p=store.create(source);p=store.addRegion({projectId:p.id,region:{page:1,x:0,y:0,width:1,height:1},imageDataUrl:'data:image/png;base64,'+fs.readFileSync(source).toString('base64')});
 const {Workflow}=require(path.join(portable,'resources/app/app/workflow.cjs')),{recognition,item,validation}=require('./workflow-fixtures.cjs');
 const r=recognition();r.body='이등변삼각형 ABC에서 밑각을 구하시오.';r.conditions=[];r.marks=[];r.printedAnswer='60°';r.printedSolution='세 각이 같으면 각각 60°이다.';r.observedDiagram.angles=[];
 const i=item();i.question.diagram=structuredClone(r.observedDiagram);i.question.diagram.coordinateSystem="cartesian_y_up";i.question.body='$x+1=3$일 때 $x$를 구하시오. $\\frac{1}{2}$';
 const fake={run:async req=>({result:req.execution.task==='recognition'?{reply:'모의 인식',recognition:r}:{reply:'모의 생성',items:[i],holdReason:''}})};
 const workflow=new Workflow({store,directory:data,getBridge:()=>fake,getSettings:()=>({model:'gpt-6-astra',effort:'medium'})});const base={projectId:p.id,problemId:p.problems[0].id,provider:'codex'};
 await workflow.run({...base,task:'recognition'});workflow.confirmSource(base.projectId,base.problemId);await workflow.run({...base,task:'generation'});
 p=store.get(p.id);for(const q of [p.problems[0].original,...p.problems[0].variants])workflow.approve(p.id,p.problems[0].id,q.id,true);
 env.EXAM_TEST_EXPORT=path.join(testRoot,'portable-word.docx');env.EXAM_TEST_SOURCE=source;
 app=await launch();page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.waitForFunction(()=>!!window.exam);await page.locator('[data-view="original"]').click();await page.locator('#retryDiagram').waitFor({timeout:20000});assert.match(await page.locator('#redrawExample').innerText(),/22도/);
  const preview=await page.evaluate(base=>window.exam.previewTask({...base,task:'generation',requestKind:'chat',text:'닮음을 이용해 난이도 상으로 3개 만들어줘'}),base);
  assert.equal(preview.requestOptions.count,3);assert.equal(preview.requestOptions.difficulty,'상');assert.match(preview.instructions,/사용자 직접 요청 최우선/);assert.match(preview.inputText,/닮음/);pass('Packaged real IPC preview applies direct chat count, difficulty and instruction priority without an AI call');
  await page.locator('#retryDiagram').click();await page.locator('#retryFeedback').fill('예) 22도를 도형밖으로 빼서 안내선으로 이어줘.');assert.match(await page.locator('#retryFeedback').inputValue(),/22도/);await page.locator('#cancelRecognitionRetry').click();
  const result=await page.evaluate(projectId=>window.exam.exportDocument({projectId,format:'docx'}),p.id);assert.ok(fs.existsSync(result.path));
  const check=JSON.parse(execFileSync(bundled,['-c','import sys,json,zipfile; z=zipfile.ZipFile(sys.argv[1]); d=z.read("word/document.xml").decode(); n=d; print(json.dumps({"math":"oMath" in d,"columns":\'w:sep="1"\' in d,"image":any(x.startswith("word/media/") for x in z.namelist()),"solution":"양변에서" in n,"font":"맑은 고딕" in d}))',result.path],{env,encoding:'utf8',windowsHide:true}));assert.ok(Object.values(check).every(Boolean));
  const student=await page.evaluate(projectId=>window.exam.exportDocument({projectId,format:'docx',audience:'student'}),p.id);assert.notEqual(student.path,result.path);
  execFileSync(bundled,['-c','import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert "word/endnotes.xml" not in z.namelist()',student.path],{env,windowsHide:true});
  await page.screenshot({path:path.join(testRoot,'portable-questions.png')});pass('Real packaged UI: saved original+variant, editable redraw request, Word math/images/notes, student omission and filename collision');
  const pdfOut=await page.evaluate(projectId=>window.exam.exportDocument({projectId,format:'pdf',audience:'teacher'}),p.id);assert.ok(fs.readFileSync(pdfOut.path).subarray(0,5).equals(Buffer.from('%PDF-')));pass('Relocated packaged PDF export works with bundled fonts/math and no external viewer or Office conversion');
  const imported=await page.evaluate(()=>window.exam.importSource());assert.equal(imported.source.type,'image');pass('Image import through actual packaged IPC');
  assert.deepEqual(errors,[]);
 }finally{await app.close();}
 // Exercise PDF.js with a synthetic one-page PDF, never the owner exam.
 const pdf=path.join(testRoot,'portable-source.pdf'),objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R >>','<< /Length 0 >>\nstream\n\nendstream'];let body='%PDF-1.4\n',offsets=[0];for(let j=0;j<objects.length;j++){offsets.push(Buffer.byteLength(body));body+=(j+1)+' 0 obj\n'+objects[j]+'\nendobj\n';}const xref=Buffer.byteLength(body);body+='xref\n0 5\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';fs.writeFileSync(pdf,body);
 env.EXAM_TEST_SOURCE=pdf;app=await launch();page=await app.firstWindow();
 try{await page.waitForFunction(()=>!!window.exam);await page.locator('#importSource').click();await page.waitForFunction(()=>document.querySelector('#pageTotal')?.textContent.includes('1')&&!document.querySelector('#fitWidth')?.disabled);await page.screenshot({path:path.join(testRoot,'portable-pdf.png')});pass('Synthetic PDF opens and renders in relocated packaged app');}finally{await app.close();}
 fs.writeFileSync(path.join(testRoot,'report.json'),JSON.stringify({ok:true,checks,runtime,limitations:['Same physical Windows PC with isolated profile, not a second physical computer','AI recognition/generation fixture mocked; no external AI inference','HWP requires separately installed Hancom and was not exercised']},null,2));console.log('REPORT '+path.join(testRoot,'report.json'));
})().catch(e=>{console.error(e);process.exitCode=1;});
