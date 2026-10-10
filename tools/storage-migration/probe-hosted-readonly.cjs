'use strict';
// Public HTTP checks only. No login, token cache access, user records or file payload requests.
const fs=require('node:fs'),crypto=require('node:crypto');
(async()=>{
 const origin='https://examstudio-shared-bank.pages.dev';
 const page=await fetch(origin+'/'),html=await page.text();
 const app=await fetch(origin+'/app.js'),js=await app.text();
 const configResponse=await fetch(origin+'/config.json'),config=await configResponse.json();
 if(config.url!=='https://bjxxqdbftefughjkcrqj.supabase.co')throw Error('Unexpected production project');
 const auth=await fetch(config.url+'/auth/v1/settings',{headers:{apikey:config.publishableKey}}),settings=await auth.json();
 const oauth=await fetch(config.url+'/auth/v1/authorize?provider=google&redirect_to='+encodeURIComponent(origin+'/'),{redirect:'manual'});
 const redirect=oauth.headers.get('location');
 const report={observedAt:new Date().toISOString(),target:'existing production Supabase web, not R2 candidate',
 homepage:{status:page.status,title:html.match(/<title>(.*?)<\/title>/)?.[1],csp:page.headers.get('content-security-policy')},
 app:{status:app.status,bytes:Buffer.byteLength(js),sha256:crypto.createHash('sha256').update(js).digest('hex'),r2GatewayCodePresent:js.includes('bank-storage')},
 config:{status:configResponse.status,keys:Object.keys(config),projectMatched:true,r2ProviderConfigured:config.storageProvider==='r2'},
 authSettings:{status:auth.status,googleEnabled:settings.external?.google===true},
 googleAuthorize:{status:oauth.status,redirectHost:redirect?new URL(redirect).hostname:null,callbackHost:redirect?new URL(new URL(redirect).searchParams.get('redirect_uri')||origin).hostname:null},
 fullGoogleLogin:false,browserUI:false,electronGUI:false,r2HostedIntegration:false,
 browserBlocker:'cua kernel startup failed: required Windows platform directory not found, HRESULT 0x80070003'};
 fs.writeFileSync('tests/artifacts/r2-freeze/hosted-readonly.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
