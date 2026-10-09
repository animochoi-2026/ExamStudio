'use strict';
// Run under Electron: safeStorage decrypts only this Windows user's existing login.
const {app,safeStorage}=require('electron'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');app.setPath('userData',path.join(root,'data/desktop'));
app.whenReady().then(async()=>{try{
 const {SharedBankAuth}=require('../app/shared-bank-auth.cjs'),{SharedBankStorage}=require('../app/shared-bank-storage.cjs');
 const auth=new SharedBankAuth({directory:path.join(root,'data/shared-bank-auth'),safeStorage,openExternal:async()=>{throw Error('재로그인이 필요합니다.');}}),storage=new SharedBankStorage({auth});
 const bank={auth,storage,readCommit:async meta=>JSON.parse((await storage.download(meta.id)).toString('utf8'))};
 const target=path.join(root,'data/backups/integrated-bank-remote-'+new Date().toISOString().replace(/[:.]/g,'-'));
 const result=await require('../app/bank-transfer.cjs').backup(bank,target,{admin:true});
 fs.writeFileSync(path.join(root,'data/backups/integrated-bank-remote-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(e){console.error(e.message);process.exitCode=1;}finally{app.quit();}});
