const test=require('node:test'),assert=require('node:assert/strict');
const {openChatGptLogin}=require('../app/account-login.cjs');
test('login offers a manual URL when the browser cannot open',async()=>{
 const bridge={login:async()=>({authUrl:'https://auth.openai.com/authorize?state=test'})};
 const result=await openChatGptLogin(bridge,{openExternal:async()=>{throw Error('OS failure');}});
 assert.equal(result.opened,false);assert.equal(result.authUrl,'https://auth.openai.com/authorize?state=test');assert.match(result.message,/복사/);
 assert.equal((await openChatGptLogin(bridge,{openExternal:async()=>{}})).opened,true);
});
test('login rejects missing or untrusted addresses and propagates startup errors',async()=>{
 let opened=false;
 for(const authUrl of [undefined,'http://auth.openai.com/a','https://openai.com.example.com/a','https://user:password@auth.openai.com/a'])await assert.rejects(()=>openChatGptLogin({login:async()=>({authUrl})},{openExternal:async()=>{opened=true;}}));
 assert.equal(opened,false);await assert.rejects(()=>openChatGptLogin({login:async()=>{throw Error('Codex 설치 필요');}},{}),/설치 필요/);
});
