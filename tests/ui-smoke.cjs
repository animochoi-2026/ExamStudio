const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const {_electron:electron}=require('C:/Users/reals/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const ROOT=path.resolve(__dirname,'..');
async function main(){
  const artifacts=path.join(__dirname,'artifacts');fs.mkdirSync(artifacts,{recursive:true});
  const env={...process.env,EXAM_DATA_DIR:path.join(ROOT,'data','ui-test'),EXAM_TEST_SOURCE:path.join(ROOT,'data','validation','original-triangle.png'),EXAM_TEST_EXPORT:path.join(artifacts,'ui-export.docx')};delete env.ELECTRON_RUN_AS_NODE;
  const app=await electron.launch({executablePath:require('electron'),args:[ROOT],env,timeout:30000});
  try{
    const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.waitForSelector('#emptyImport');
    await page.screenshot({path:path.join(artifacts,'desktop-empty.png')});
    await page.locator('#importSource').click();
    await page.waitForFunction(()=>{const c=document.querySelector('#pageCanvas');return c&&c.width>100&&!document.querySelector('#pageStage').hidden;},{timeout:10000});
    await page.screenshot({path:path.join(artifacts,'desktop-source.png')});
    const dims=await page.locator('#selectionLayer').boundingBox();assert.ok(dims&&dims.width>100);
    // Verify the real native bridge is available; inference is separately exercised by the one-shot protocol smoke.
    const state=await page.evaluate(()=>window.exam.boot());assert.ok(state.project.source.path.endsWith('.png'));
    console.log(JSON.stringify({title:await page.title(),sourceSize:dims,errors,projectId:state.project.id}));
    assert.deepEqual(errors,[]);
  }finally{await app.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
