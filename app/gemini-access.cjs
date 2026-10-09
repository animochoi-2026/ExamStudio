'use strict';
const fs=require('node:fs'),path=require('node:path');
const {atomicWrite}=require('./store.cjs');
const STATES=['unknown','subscribed','unsubscribed'];
function validate(value){if(!STATES.includes(value))throw new Error('Gemini 구독 상태를 선택하세요.');return value;}
class GeminiAccessStore{
 constructor(directory){this.file=path.join(directory,'gemini-access.json');}
 read(){try{return validate(JSON.parse(fs.readFileSync(this.file,'utf8')).status);}catch(e){if(e.code==='ENOENT')return 'unknown';throw new Error('Gemini 구독 설정을 읽지 못했습니다. 기존 파일을 보존합니다.');}}
 save(status){validate(status);atomicWrite(this.file,{version:1,status,source:'user_setting'});return status;}
}
function blockedGeminiStatus(status){
 validate(status);if(status==='subscribed')return null;
 return{available:false,models:[],buckets:[],account:null,subscription:{status,source:'user_setting'},error:status==='unsubscribed'?'Gemini 미구독으로 설정되어 비활성화되었습니다.':'Gemini 구독 상태를 선택해 주세요. 현재 연결에서는 유료 구독을 자동 확인할 수 없습니다.'};
}
module.exports={GeminiAccessStore,blockedGeminiStatus};
