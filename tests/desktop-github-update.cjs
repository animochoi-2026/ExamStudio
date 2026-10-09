'use strict';
// Verify the update dialog and actual published feed in an isolated packaged app.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {_electron}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'..'),portable=path.resolve(process.argv[2]);
(async()=>{
 const data=fs.mkdtempSync(path.join(root,'data/validation/update-ui-'));
 const stale=path.join(data,'updates/download-stale-test');fs.mkdirSync(path.join(stale,'backup/resources/app'),{recursive:true});
 fs.writeFileSync(path.join(stale,'release.zip'),'old update');fs.writeFileSync(path.join(stale,'backup/resources/app/package.json'),JSON.stringify({version:'0.3.17'}));
 fs.writeFileSync(path.join(stale,'plan.json'),JSON.stringify({root:portable,zip:path.join(stale,'release.zip'),version:'0.3.18',sourceVersion:'0.3.17'}));
 fs.writeFileSync(path.join(stale,'result.json'),JSON.stringify({status:'installed',version:'0.3.18'}));fs.writeFileSync(path.join(data,'work-canary.txt'),'keep work');
 const env={...process.env,EXAM_DATA_DIR:data};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:path.join(portable,'문제공방.exe'),args:['--disable-gpu'],env,timeout:30000});
 try{
  const page=await app.firstWindow();await page.waitForFunction(()=>!!window.exam);
  await page.locator('#claudeTab').click();assert.ok(await page.locator('#claudeControls').isVisible());assert.equal(await page.locator('#claudeModel').inputValue(),'sonnet');
  await page.locator('#editPromptProfile').click();await page.locator('#scopeTree').waitFor();
  assert.equal(await page.locator('[data-scope-node="m1"]').evaluate(n=>n.open),false);assert.equal(await page.locator('[data-scope-node="m2"]').evaluate(n=>n.open),true);assert.equal(await page.locator('[data-scope-node="m3"]').evaluate(n=>n.open),false);
  assert.equal(await page.locator('[data-curriculum-id="m2-u6"]').isChecked(),true);await page.locator('#closeDialog').click();
  await page.locator('#checkUpdates').click();
  await page.locator('#updateVersion').waitFor({timeout:45000});
  assert.ok(await page.getByRole('button',{name:'GitHub 배포 페이지',exact:true}).isVisible());
  const check=await page.evaluate(()=>window.exam.checkUpdate());assert.equal(check.packaged,true);assert.equal(check.current,'0.4.4');assert.equal(check.latest,'0.4.4');assert.equal(check.previous,'0.4.3');assert.equal(check.available,false);
  assert.equal(await page.locator('#updateVersion option').count(),3);await page.locator('#updateVersion').selectOption('0.4.3');assert.equal(await page.locator('#installSelectedUpdate').innerText(),'v0.4.3로 롤백');assert.ok(await page.locator('#installSelectedUpdate').isEnabled());
  assert.ok(!fs.existsSync(path.join(stale,'release.zip')));assert.ok(!fs.existsSync(path.join(stale,'backup')));assert.equal(fs.readFileSync(path.join(data,'work-canary.txt'),'utf8'),'keep work');
  await page.screenshot({path:path.join(data,'update-dialog.png')});
  console.log('PASS updated executable startup, real GitHub feed and update dialog');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
