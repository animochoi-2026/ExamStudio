'use strict';
const {app,safeStorage}=require('electron'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/integrated-stability-20261009');
const prior=path.join(root,'tmp/difficulty-access-v2-production-20261008');
const M=n=>require(path.join(prior,'app',n));
app.setPath('userData',path.join(prior,'operator-profile'));app.setPath('sessionData',path.join(prior,'operator-profile/session'));
app.whenReady().then(async()=>{try{
 const auth=new(M('shared-bank-auth.cjs').SharedBankAuth)({directory:path.join(prior,'operator-auth'),safeStorage,openExternal:async()=>{throw Error('Existing login needs user attention');}});
 const storage=new(M('shared-bank-storage.cjs').SharedBankStorage)({auth}),cfg=auth.config();await auth.membership();
 const rows=[];for(let start=0;;start+=50){const page=await storage.rpc('bank_search_current',{s:cfg.spaceId,filters:{},start_at:start});rows.push(...page);if(page.length<50)break;}
 fs.writeFileSync(path.join(out,'live-catalogs.json'),JSON.stringify({readAt:new Date().toISOString(),rows},null,2));
 console.log(JSON.stringify({currentCount:rows.length,remoteContentWrites:0,aiCalls:0}));
}catch(e){console.error(e.message);process.exitCode=1;}finally{app.quit();}});
