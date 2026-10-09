'use strict';

// Exercise the real main-process export handler without opening Hancom or
// Electron. External render/COM commands are simulated; file replacement and
// direct package writes use the real filesystem in a separate temporary directory.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const {EventEmitter}=require('node:events');
const {randomUUID}=require('node:crypto');
const ROOT=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(ROOT,'app/main.cjs'),'utf8');
const OLD=Buffer.from('previous valid HWPX');
const NEXT=Buffer.alloc(256,0x48);

function harness(t,mode){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'exam-hwp-flow-'));
  t.after(()=>{
    assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));
    assert.ok(path.basename(dir).startsWith('exam-hwp-flow-'));
    fs.rmSync(dir,{recursive:true,force:true});
  });
  const target=path.join(dir,'시험지.hwpx');fs.writeFileSync(target,OLD);
  const existingEditable=path.join(dir,'시험지_수식편집용.docx');
  const existingFallback=path.join(dir,'시험지_한글용.docx');
  fs.writeFileSync(existingEditable,'older editable');fs.writeFileSync(existingFallback,'older compatible');
  const projectDir=path.join(dir,'data','projects','project');
  const project={id:'project',title:'시험지',settings:{},problems:[{id:'source',original:{id:'q1',kind:'original',approval:{status:'approved'},include:true,body:'$x=1$',answer:'$1$',solution:'조건으로 구한다.'},variants:[]}]};
  const handlers=new Map(),calls=[];const sender={};
  if(mode==='unapproved')project.problems[0].original.approval.status='pending';
  const fileSystem=Object.create(fs);
  fileSystem.renameSync=(from,to)=>{
    calls.push({kind:'rename',from,to});
    assert.equal(fs.readFileSync(target).equals(OLD),true,'the prior HWP survives until the final replacement');
    assert.equal(path.dirname(from),path.dirname(to),'rename stays on the destination volume');
    if(mode==='renameFail')throw Object.assign(new Error('target is open in an editor'),{code:'EPERM'});
    fs.renameSync(from,to);
  };
  function spawn(_exe,args){
    const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=()=>{};
    queueMicrotask(()=>{
      try{
        const value=flag=>args[args.indexOf(flag)+1];let output='';
        if(args.some(arg=>arg.endsWith('export_docx.py'))){
          fs.writeFileSync(value('--output'),'editable OMML fixture');output=JSON.stringify({warnings:[]});
        }else if(args.some(arg=>arg.endsWith('export_hwpx.py'))){
          if(mode==='prepareFail')throw new Error('native equation preparation failed');
          assert.equal(path.extname(value('--output')),'.hwpx');
          if(mode!=='missingOutput')fs.writeFileSync(value('--output'),NEXT);
          output=JSON.stringify({packageVerified:mode!=='unverifiedPackage',equations:2,pictures:0});
        }else throw new Error(`Unexpected external process ${args.join(' ')}`);
        child.stdout.emit('data',Buffer.from(output));child.emit('close',0);
      }catch(error){child.stderr.emit('data',Buffer.from(error.message));child.emit('close',1);}
    });
    return child;
  }
  const app={isPackaged:false,setPath(){},requestSingleInstanceLock(){return false;},quit(){}};
  const imports={
    electron:{app,BrowserWindow:function(){},ipcMain:{handle:(name,handler)=>handlers.set(name,handler)},dialog:{},shell:{openPath:async()=>''},Menu:{}},
    'node:fs':fileSystem,'node:child_process':{spawn},
    './store.cjs':{
      ProjectStore:class{constructor(){this.projectsDir=path.dirname(projectDir);}get(){return project;}projectDir(){return projectDir;}},
      normalizeQuestion:value=>value,id:randomUUID,stamp:()=>'',
      atomicWrite:(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value));}
    },
    './geometry.cjs':{diagramSvg:()=>'',inspectDiagram:()=>({ok:true,errors:[],warnings:[]})},
    './structured-layout.js':require('../app/structured-layout.js'),
    './pdf-export.cjs':{exportPdf:async({snapshotPath})=>({snapshot:JSON.parse(fs.readFileSync(snapshotPath,'utf8')),report:{}})},
    sharp:()=>{throw new Error('This fixture contains no diagram');}
  };
  const context=vm.createContext({
    require:name=>{
      if(name===path.join(ROOT,'scripts','hwp_math.cjs'))throw new Error('Native HWP must never rasterize equations');
      if(name==='./workflow.cjs')return {Workflow:class{decorate(p){return p;}}};
      if(name==='./region-detector.cjs')return require('../app/region-detector.cjs');
      if(name==='./bank-main.cjs')return {installBank:()=>({close(){}})};
      if(name==='./github-update.cjs')return require('../app/github-update.cjs');
      if(name==='./gemini-access.cjs')return require('../app/gemini-access.cjs');
      if(name==='./error-log.cjs')return require('../app/error-log.cjs');
      if(name==='./profiles.cjs')return require('../app/profiles.cjs');
      if(name==='./question-text.cjs')return require('../app/question-text.cjs');
      if(name==='./solution-display.js')return require('../app/solution-display.js');
      if(name==='./solution-print.cjs')return require('../app/solution-print.cjs');
      if(name==='./source-materials.cjs')return require('../app/source-materials.cjs');
      if(name==='./export-names.cjs')return require('../app/export-names.cjs');
      if(name==='./parts.cjs')return require('../app/parts.cjs');
      if(name==='./prompts.cjs')return require('../app/prompts.cjs');
      if(Object.hasOwn(imports,name))return imports[name];return require(name);
    },
    __dirname:path.join(ROOT,'app'),process:{env:{EXAM_DATA_DIR:path.join(dir,'data'),EXAM_TEST_EXPORT:target,EXAM_PYTHON:process.execPath}},
    console:{error(){}},setTimeout,clearTimeout,testSender:sender
  });
  vm.runInContext(source,context,{filename:'app/main.cjs'});
  vm.runInContext('window={webContents:testSender};registerHandlers();',context);
  return{dir,target,calls,existingEditable,existingFallback,project,
    run:(format='hwpx',audience='teacher')=>handlers.get('exam:exportDocument')({sender},{projectId:'project',format,audience}),
    assertClean:()=>assert.deepEqual(fs.readdirSync(dir).filter(name=>name.includes('.writing-')),[])
  };
}

test('direct HWPX replaces the target only after the common engine verifies its package',async t=>{
  const h=harness(t,'success'),result=await h.run();
  assert.equal(result.format,'hwpx');assert.equal(result.path,h.target);assert.equal(result.success,true);
  assert.deepEqual(h.calls.map(call=>call.kind),['rename']);
  assert.equal(fs.readFileSync(h.target).equals(NEXT),true);
  assert.equal(fs.readFileSync(h.existingEditable,'utf8'),'older editable');
  assert.equal(fs.readFileSync(h.existingFallback,'utf8'),'older compatible');h.assertClean();
});
test('unapproved output is blocked before generation or replacement',async t=>{
 const h=harness(t,'unapproved');await assert.rejects(h.run(),/승인/);assert.deepEqual(h.calls,[]);assert.equal(fs.readFileSync(h.target).equals(OLD),true);
});
for(const mode of ['unverifiedPackage','missingOutput','renameFail'])test(`${mode} reports direct-save failure and preserves the prior HWPX`,async t=>{
  const h=harness(t,mode);await assert.rejects(h.run());
  assert.equal(fs.readFileSync(h.target).equals(OLD),true);
  assert.equal(fs.readFileSync(h.existingEditable,'utf8'),'older editable');
  assert.equal(fs.readFileSync(h.existingFallback,'utf8'),'older compatible');
  if(mode!=='renameFail')assert.equal(h.calls.some(call=>call.kind==='rename'),false);h.assertClean();
});
test('native package preparation failure leaves the target untouched and is not reported as success',async t=>{
  const h=harness(t,'prepareFail');await assert.rejects(h.run(),/native equation preparation failed/);
  assert.equal(fs.readFileSync(h.target).equals(OLD),true);assert.deepEqual(h.calls,[]);h.assertClean();
});

test('Word exports approved recognized originals without printed answers, leaving source data intact',async t=>{
 const h=harness(t,'success'),q=h.project.problems[0].original;q.answer='';q.solution='';
 const before=JSON.stringify(q),result=await h.run('docx');
 assert.equal(result.format,'docx');assert.ok(fs.existsSync(result.path));assert.match(result.warnings.join(' '),/1번 원본문제.*미입력/);
 assert.equal(JSON.stringify(q),before);assert.deepEqual(h.calls,[]);
});

test('Word still blocks incomplete generated solutions and unapproved originals',async t=>{
 const h=harness(t,'success'),q=h.project.problems[0].original;q.kind='variant';q.solution='';
 await assert.rejects(h.run('docx'),/유사문제.*풀이/);q.kind='original';q.approval.status='pending';
 await assert.rejects(h.run('docx'),/승인/);assert.deepEqual(h.calls,[]);
});

test('legacy student selection also includes answer pages without changing source data',async t=>{
 const h=harness(t,'success'),q=h.project.problems[0].original;q.answer='';q.solution='';
 const result=await h.run('docx','student');assert.ok(result.warnings.some(w=>w.includes('미입력')));
 const snapshot=JSON.parse(fs.readFileSync(result.snapshotPath,'utf8'));assert.equal(snapshot.questions[0].answer,'');assert.equal(snapshot.questions[0].solution,'');
});

test('Word handler saves date and versioned files without replacing prior output',async t=>{
 const h=harness(t,'success'),first=await h.run('docx');
 fs.writeFileSync(first.path,'previous Word contents');
 const second=await h.run('docx'),third=await h.run('docx');
 assert.match(first.path,/_\d{4}-\d{2}-\d{2}\.docx$/);
 assert.equal(second.path,first.path.replace('.docx','_ver1.docx'));
 assert.equal(third.path,first.path.replace('.docx','_ver2.docx'));
 assert.equal(fs.readFileSync(first.path,'utf8'),'previous Word contents');
 assert.deepEqual(fs.readdirSync(path.dirname(first.snapshotPath)).filter(n=>n.startsWith('word-save-')),[]);
});
