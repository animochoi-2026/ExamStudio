'use strict';
// Keep the short-lived login URL only in the account dialog, never in project logs.
async function openChatGptLogin(bridge,shell){
 const result=await bridge.login();
 let url;try{url=new URL(result.authUrl);}catch{throw Error('Codex가 로그인 주소를 반환하지 않았습니다. Codex를 업데이트하고 다시 시도해 주세요.');}
 if(url.protocol!=='https:'||url.username||url.password||!/(^|\.)openai\.com$|(^|\.)chatgpt\.com$/.test(url.hostname))throw Error('공식 로그인 주소를 확인하지 못했습니다.');
 try{await shell.openExternal(url.href);return{opened:true,authUrl:url.href};}
 catch{return{opened:false,authUrl:url.href,message:'기본 브라우저를 열지 못했습니다. 아래 로그인 주소를 복사하여 이 컴퓨터의 브라우저 주소창에 붙여 넣으세요.'};}
}
module.exports={openChatGptLogin};
