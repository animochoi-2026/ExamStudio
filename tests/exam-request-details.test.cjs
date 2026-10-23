'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),alias=require('../app/school-alias.cjs'),rpc=require('../web-bank/school-alias-rpc.cjs'),past=require('../web-bank/past-print-model.cjs'),provenance=require('../web-bank/fill-provenance.cjs');
test('Sindong aliases select both source exams without merging their identities or other regions',()=>{
 const a={source_id:'one',source:{school:'신동중',region:'서초구',schoolId:'id-a',academicYear:'2025'}},b={source_id:'two',source:{school:'신동중학교',region:'서울 서초구',schoolId:'id-b',academicYear:'2026'}},before=JSON.stringify([a,b]);
 assert.equal(past.schoolKey(a.source),past.schoolKey(b.source));assert(past.matches(b,{schools:[past.schoolKey(a.source)],from:2025,to:2026}));assert.notEqual(past.schoolKey(a.source),past.schoolKey({school:'신동중학교',region:'춘천시'}));
 const result=rpc.response('bank_source_exams',[a,b]);assert.deepEqual(result.map(s=>s.source.school),['신동중','신동중']);assert.deepEqual(result.map(s=>s.source_id),['one','two']);assert.equal(JSON.stringify([a,b]),before);
 assert.deepEqual(rpc.request('bank_exam_candidates',{schools:['신동중']}).schools,['신동중','신동중학교']);assert.deepEqual(rpc.response('bank_mock_schools',['신동중학교','신동중','경원중']),['신동중','경원중']);
 const saved={doc:{schools:['신동중학교']}};assert.equal(rpc.request('bank_mock_save',saved),saved);
});
test('fill popup details use actual school/band/score/count, never estimated target values',()=>{
 const row=(school,score)=>({metadata:{source:{school,region:'서초구'}},confirmed:{difficulty:score}}),rows=[row('신동중',6.8),row('신동중학교',6.8),row('경원중',8.2),row('경원중',null)];
 const lines=provenance.lines(rows);assert(lines.includes('신동중 · 중 · 6.80점 · 2문항'));assert(lines.includes('경원중 · 상 · 8.20점 · 1문항'));assert(lines.some(s=>s.includes('점수 없음')));assert.equal(provenance.summarize(rows).reduce((s,g)=>s+g.count,0),4);
});
test('actual app navigation preserves detail back filters and rejects history snapshots from before a home visit',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),state=await import('../web-bank/source-list-state.js'),source=fs.readFileSync(require.resolve('../web-bank/app.js'),'utf8');
 const navigate=source.slice(source.indexOf('async function navigate('),source.indexOf('async function route('));
 const context={...state,structuredClone,currentGrade:()=> 'm2',member:{},user:{},leaveEdits:async()=>true,accountPopover:{close(){}},cancelOriginalExams(){},$(){return {};},saveUi(){},nav(){},message(){},route:async()=>{},requestAnimationFrame:f=>f(),scrollTo(){},scrollY:30,history:{state:null,pushState(s){this.state=structuredClone(s);},replaceState(s){this.state=structuredClone(s);}}};
 vm.createContext(context);vm.runInContext(`let tab='home',sourceListStates={},sourceListOrigin=null,sourceListEpoch=0,offset=0,searchFilters={},screen=0;${navigate}\nglobalThis.go=navigate;globalThis.get=()=>({states:sourceListStates,origin:sourceListOrigin,epoch:sourceListEpoch});globalThis.filter=()=>{sourceListStates.originals={page:2,filters:{year:'2025',query:'신동'}};};`,context);
 await context.go('originals');context.filter();await context.go('exam-source/test');const back=structuredClone(context.history.state);await context.go('originals',{restore:back});assert.equal(context.get().states.originals.filters.year,'2025');
 await context.go('home');await context.go('originals');assert.equal(context.get().states.originals,undefined);
 await context.go('originals',{restore:back});assert.equal(context.get().states.originals,undefined);assert.equal(context.get().origin,null);
});
