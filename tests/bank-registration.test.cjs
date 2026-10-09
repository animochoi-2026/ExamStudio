'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {inferSourceInfo}=require('../app/bank-source-info.cjs');
test('school exam filename suggestions use explicit metadata, no invented identifiers',()=>{
 const m=inferSourceInfo('2026 광희중 2-2중간고사 기출.pdf');
 assert.deepEqual(m,{kind:'학교기출',materialTitle:'2026 광희중 2-2중간고사 기출',school:'광희중',region:null,academicYear:'2026',grade:'중2',semester:'2학기',exam:'중간고사'});
 const other=inferSourceInfo('2025학년 (압구정중) 2학년 2학기 중간고사 수학원안.pdf');assert.equal(other.school,'압구정중');assert.equal(other.academicYear,'2025');assert.equal(other.grade,'중2');
 const missing=inferSourceInfo('(수학)2023학년도 2학년 2학기 기말고사 원안.pdf');assert.equal(missing.school,null);assert.equal(missing.grade,'2학년');
 assert.equal(inferSourceInfo('신사중 학교프린트(이등변~외내심).pdf').kind,'기타자료');
});
test('dates, ambiguous fields and unknown information stay unknown',()=>{
 for(const name of ['KakaoTalk_20260922_122913187_01.jpg','2026-09-30 시험지.pdf','사진.png']){const m=inferSourceInfo(name);for(const key of ['school','region','academicYear','grade','semester','exam'])assert.equal(m[key],null,name+': '+key);}
 const ambiguous=inferSourceInfo('2025학년도 2026학년도 광희중 신구중 중간 기말.pdf');assert.equal(ambiguous.school,null);assert.equal(ambiguous.academicYear,null);assert.equal(ambiguous.exam,null);
 assert.equal(inferSourceInfo('서울 광희중학교 2026 2학년 1학기 중간고사.pdf').region,'서울');
});
test('Google login opens a normal installed browser with only the official URL',async()=>{
 const {openBankLogin}=require('../app/bank-login-browser.cjs'),{EventEmitter}=require('node:events');const calls=[];
 const deps={platform:'win32',env:{PROGRAMFILES:'C:\\Applications'},exists:p=>p.endsWith('chrome.exe')||p.endsWith('msedge.exe'),spawn:(exe,args,opts)=>{calls.push({exe,args,opts});const child=new EventEmitter();child.unref=()=>{};queueMicrotask(()=>child.emit('spawn'));return child;},shell:{openExternal:()=>assert.fail('must use installed full browser')}};
 const url='https://example.supabase.co/auth/v1/authorize?provider=google&prompt=select_account';assert.equal(await openBankLogin(url,{},deps),'chrome');assert.deepEqual(calls[0].args,[url]);assert.equal(calls[0].opts.shell,false);assert.equal(await openBankLogin(url,{browser:'edge'},deps),'edge');assert.match(calls[1].exe,/msedge\.exe$/);
 await assert.rejects(openBankLogin('https://evil.invalid/login',{},deps),/공식/);await assert.rejects(openBankLogin(url,{browser:'other'},deps),/브라우저/);assert.equal(calls.length,2);
 await assert.rejects(openBankLogin(url,{browser:'chrome'},{...deps,exists:()=>false}),/설치/);
});
