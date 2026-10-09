const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const ROOT=path.resolve(__dirname,'..');
const OUT=path.join(ROOT,'data','validation','hwp-compat');
if(!process.versions.electron) {
  const environment={...process.env};delete environment.ELECTRON_RUN_AS_NODE;
  const child=spawn(path.join(ROOT,'node_modules','electron','dist','electron.exe'),[__filename],{cwd:ROOT,env:environment,stdio:'inherit',windowsHide:true});
  child.on('exit',code=>{process.exitCode=code??1;});
} else {
  const {app,BrowserWindow}=require('electron');
  fs.mkdirSync(OUT,{recursive:true});
  app.setPath('userData',path.join(OUT,'electron-profile'));
  app.disableHardwareAcceleration();
  app.on('window-all-closed',()=>{});
  app.whenReady().then(async()=>{
    const {renderEquationImages,equationPlan}=require('../scripts/hwp_math.cjs');
    const source=path.join(ROOT,'dist','ExamStudio-win32-x64','data','projects','80146ae9-61c2-4003-bd6a-acde3e45b40a','exports','export-input.json');
    const manifestPath=await renderEquationImages({BrowserWindow,snapshotPath:source,outputDir:OUT});
    const manifest=JSON.parse(fs.readFileSync(manifestPath));
    const {default:assert}=await import('node:assert/strict');
    const expected=equationPlan(JSON.parse(fs.readFileSync(source)));
    assert.equal(manifest.images.length,expected.length);
    assert.ok(manifest.images.every(image=>image.part==='word/document.xml'));
    assert.ok(manifest.images.some(image=>image.fontPt===9));
    const seen=new Map();
    for(const image of manifest.images){
      assert.equal(image.fontPt,expected[image.index].fontPt);
      const key=JSON.stringify([image.latex,image.display,image.fontPt]);
      const bytes=fs.readFileSync(path.join(OUT,image.file));
      // Repeated equations separated by other renders detect stale-frame captures.
      if(seen.has(key))assert.deepEqual(bytes,seen.get(key));
      else seen.set(key,bytes);
    }
    const spectrumDir=path.join(OUT,'spectrum');fs.mkdirSync(spectrumDir,{recursive:true});
    const spectrumPath=path.join(spectrumDir,'snapshot.json');
    fs.writeFileSync(spectrumPath,JSON.stringify({questions:[{body:String.raw`$1$ $\frac{1+\sqrt{2}}{3}$ $\alpha+\beta=\theta$ $$\begin{aligned}x&=2\\y&=3\end{aligned}$$ $1$`,answer:'',solution:''}]}));
    const spectrum=JSON.parse(fs.readFileSync(await renderEquationImages({BrowserWindow,snapshotPath:spectrumPath,outputDir:spectrumDir})));
    assert.equal(spectrum.images.length,5);
    assert.ok(spectrum.images[1].heightPt>spectrum.images[0].heightPt);
    assert.ok(spectrum.images[3].heightPt>spectrum.images[0].heightPt);
    assert.deepEqual(fs.readFileSync(path.join(spectrumDir,spectrum.images[0].file)),fs.readFileSync(path.join(spectrumDir,spectrum.images[4].file)));
    console.log(JSON.stringify({ok:true,manifestPath,count:manifest.images.length,first:manifest.images[0]}));
    app.exit(0);
  }).catch(error=>{console.error(error);app.exit(1);});
}
