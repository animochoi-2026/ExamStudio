'use strict';
if(process.versions.electron){require('./desktop-workflow.cjs');}else{
 const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
 const root=path.resolve(__dirname,'..'),{_electron}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
 (async()=>{
  const dir=fs.mkdtempSync(path.join(root,'data/validation/curriculum-')),source=path.join(dir,'sample.png');await require('sharp')({create:{width:800,height:1000,channels:3,background:'white'}}).png().toFile(source);
  const env={...process.env,EXAM_DATA_DIR:dir,EXAM_TEST_SOURCE:source};delete env.ELECTRON_RUN_AS_NODE;
  const app=await _electron.launch({executablePath:require('electron'),args:[__filename],env}),page=await app.firstWindow();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const box=id=>page.locator(`[data-curriculum-id="${id}"]`),settings=()=>page.evaluate(()=>window.exam.getRulesSettings());
  try{
   await page.waitForFunction(()=>!!document.querySelector('#chatForm[data-workflow-ready]'));await page.locator('#editPromptProfile').click();
   assert.equal(await page.locator('#scopeTree input:checked').count(),14); // 12 leaves + two complete chapter parents
   await box('m2-u7').uncheck();await box('m2-6.4').uncheck();assert.equal(await box('m2-u6').evaluate(n=>n.indeterminate),true);
   await page.locator('#saveStructuredScope').click();let s=(await settings()).scope;assert.equal(s.curriculum.selected.length,3);assert.ok(s.forbidden.some(x=>x.includes('삼각형의 내심')));
   assert.equal((await page.evaluate(()=>window.exam.boot())).project,null);
   await page.locator('#editPromptProfile').click();assert.equal(await box('m2-6.4').isChecked(),false);await page.locator('#closeDialog').click();
   await page.locator('.scope-manage summary').click();await page.locator('#addPromptProfile').click();await page.locator('#profileNameInput').fill('외심까지');await page.locator('#saveStructuredScope').click();const preset=(await settings()).scopePresetId;
   await page.locator('#importSource').click();await page.locator('#confirmImportScope').waitFor();assert.equal(await page.locator('#importScopePreset').inputValue(),preset);assert.ok(await page.locator('#scopeTree').isVisible());
   await box('m2-6.4').check();await page.locator('#confirmImportScope').click();let boot=await page.evaluate(()=>window.exam.boot());assert.equal(boot.project.scope.curriculum.selected.length,4);assert.equal(boot.project.scopePresetId,'');
   const saved=(await page.evaluate(()=>window.exam.getRulesSettings({projectId:undefined}))).presets.find(p=>p.id===preset);assert.equal(saved.scope.curriculum.selected.length,3);
   await page.locator('#editPromptProfile').click();await page.locator('#scopePresetPicker').selectOption(preset);assert.equal(await box('m2-6.4').isChecked(),false);await page.locator('#closeDialog').click();assert.equal((await page.evaluate(()=>window.exam.boot())).project.scope.curriculum.selected.length,4);
   await page.locator('#promptProfile').selectOption('release-scope-1');await page.waitForFunction(async()=>(await window.exam.boot()).project.scope.curriculum?.selected.length===12);
   await page.locator('#editPromptProfile').click();await page.getByRole('searchbox',{name:'단원·개념 검색',exact:true}).fill('원주각');assert.ok(await box('m3-u7').isVisible());
   await page.getByRole('searchbox',{name:'단원·개념 검색',exact:true}).fill('');await page.screenshot({path:path.join(dir,'scope-tree.png')});
   assert.deepEqual(errors,[]);console.log('PASS scope tree: parents, partial selection, no-document save, preset persistence, import draft, cancel and search');console.log(dir);
  }finally{await app.close();}
 })().catch(e=>{console.error(e);process.exitCode=1;});
}
