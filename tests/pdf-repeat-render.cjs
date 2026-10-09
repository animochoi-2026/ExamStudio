'use strict';
// Real Chromium/PDF.js pixel regression; no AI or user project mutations.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
if(!process.versions.electron){
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const r=require('node:child_process').spawnSync(require('electron'),[__filename,...process.argv.slice(2)],{env,stdio:'inherit',windowsHide:true});process.exit(r.status??1);
}else{
 const {app,BrowserWindow}=require('electron');
 const dir=fs.mkdtempSync(path.join(root,'data/validation/pdf-repeat-'));
 app.setPath('userData',path.join(dir,'profile'));
 app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,webPreferences:{backgroundThrottling:false}});
  const watchdog=setTimeout(()=>{console.error('PDF render test timed out');app.exit(1);},120000);
  try{
   await win.loadURL(require('node:url').pathToFileURL(path.join(root,'app/index.html')).href);
   const files=process.argv.slice(2).length?process.argv.slice(2):fs.readdirSync(path.join(root,'소스')).filter(f=>f.endsWith('.pdf')).map(f=>path.join(root,'소스',f));
   const reports=[];
   for(const file of files){
    watchdog.refresh();
    const report=await win.webContents.executeJavaScript(`(async()=>{
     const lib=await import('../node_modules/pdfjs-dist/build/pdf.mjs');lib.GlobalWorkerOptions.workerSrc=new URL('../node_modules/pdfjs-dist/build/pdf.worker.mjs',location.href).href;
     const task=lib.getDocument({data:Uint8Array.from(atob(${JSON.stringify(fs.readFileSync(file).toString('base64'))}),c=>c.charCodeAt(0)),cMapUrl:new URL('../node_modules/pdfjs-dist/cmaps/',location.href).href,cMapPacked:true,standardFontDataUrl:new URL('../node_modules/pdfjs-dist/standard_fonts/',location.href).href,wasmUrl:new URL('../node_modules/pdfjs-dist/wasm/',location.href).href});
     const baseline=await task.promise,referencePage=await baseline.getPage(1),reference=document.createElement('canvas'),viewport=referencePage.getViewport({scale:.8});
     reference.width=Math.ceil(viewport.width);reference.height=Math.ceil(viewport.height);await referencePage.render({canvasContext:reference.getContext('2d'),viewport}).promise;const before=reference.toDataURL();await task.destroy();
     const {loadPdfDocument,createPdfRender}=await import('./pdf-rendering.js');
     const fixed=loadPdfDocument(Uint8Array.from(atob(${JSON.stringify(fs.readFileSync(file).toString('base64'))}),c=>c.charCodeAt(0))),pdf=await fixed.promise,page=await pdf.getPage(1);
     const initial=createPdfRender(page,.8);await initial.task.promise;const stable=initial.canvas.toDataURL();
     const dialog=document.createElement('dialog');document.body.append(dialog);dialog.showModal();
     for(let n=1;n<=Math.min(2,pdf.numPages);n++){
      const p=await pdf.getPage(n);
      await Promise.all(Array.from({length:2},()=>createPdfRender(p,3).task.promise));
     }
     for(let n=0;n<5;n++){
      const {task:r}=createPdfRender(page,1+(n%3));await new Promise(resolve=>setTimeout(resolve,n%4));r.cancel();
      await r.promise.catch(e=>{if(e.name!=='RenderingCancelledException')throw e;});
     }
     const final=createPdfRender(page,.8);await final.task.promise;const after=final.canvas.toDataURL();
     dialog.close();dialog.remove();await fixed.destroy();return{same:stable===after,before,after};
    })()`);
    const i=reports.length;for(const key of ['before','after'])fs.writeFileSync(path.join(dir,`${i}-${key}.png`),Buffer.from(report[key].split(',')[1],'base64'));
    const sharp=require('sharp');const a=await sharp(Buffer.from(report.before.split(',')[1],'base64')).removeAlpha().raw().toBuffer(),b=await sharp(Buffer.from(report.after.split(',')[1],'base64')).removeAlpha().raw().toBuffer();assert.equal(a.length,b.length);let difference=0;for(let n=0;n<a.length;n++)difference+=Math.abs(a[n]-b[n]);const meanDifference=difference/a.length;
    reports.push({file,same:report.same,meanDifference});console.log(JSON.stringify(reports.at(-1)));
    fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(reports,null,2));
    // CPU image decoding may round antialiasing differently; missing text is not
    // allowed, while sub-level RGB rounding is expected between the two paths.
    assert.ok(meanDifference<1,'source rendering differs from original baseline');
   }
   fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(reports,null,2));console.log(dir);assert.ok(reports.every(r=>r.same),'repeated source rendering changed pixels');
  }finally{clearTimeout(watchdog);win.destroy();}
 }).then(()=>app.exit(0),e=>{console.error(e);app.exit(1);});
}
