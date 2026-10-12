// Artificial local output only. No account, original file or production API.
const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path');
app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{
 const root=path.resolve(__dirname,'artifacts/download-security');
 try{for(const code of ['0012','9876']){if(fs.existsSync(path.join(root,code+'.pdf')))continue;const directory=path.join(root,'pdf-'+code);fs.mkdirSync(directory,{recursive:true});const snapshotPath=path.join(root,code+'.json');await require('../app/pdf-export.cjs').exportPdf({BrowserWindow,snapshotPath,directory,target:path.join(root,code+'.pdf')});}console.log('Synthetic Electron PDF output: 2 users');app.exit(0);}
 catch(e){console.error(e.stack);app.exit(1);}
});
