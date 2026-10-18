'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),S=require('../app/difficulty-v12/scorer.cjs'),I=require('../app/difficulty-v12/input.cjs'),V=require('../app/difficulty-v12/schema.cjs');
const {d,route,raw,score}=require('./fixtures/difficulty-v12-values.cjs');
test('§16 앵커 8개 및 §17 1–6, 8 루틴/발상',()=>{
 const cases=[['H1',[3,3,3,3],2,9.8],['H2',[4,4,3,4],1,9.9],['M1',[2,2,2,3],2,6.8],['M2',[3,2,2,3],1,6.9],['M3',[2,2,1,2],1,4.7],['M4',[1,1,0,0],1,1.2],['L1',[1,1,0,4],1,1.2],['L2',[1,0,0,4],0,1.1]];
 for(const [name,axes,e,n]of cases)assert.equal(score([d(name,...axes)],{execution_load:e}).score,n,name);
 assert.equal(score([d('119to137',1,1,0,4)],{execution_load:1}).problem_tier,'T0');
 assert.ok(score([d('expansion',1,1,1,4)],{execution_load:4}).score<score([d('H2',4,4,3,4)]).score);
});
test('§16 K1–K6 및 §17 11–15 고정 연결/게이트',()=>{
 const assembly=axes=>[d('a',...axes),d('b',2,2,1,2,['a']),d('c',2,2,1,2,['b'])];
 const cases=[['K1',[d('a',3,3,3,3)],1,false,false,'T5',9.8],['K2',assembly([2,2,2,3]),1,false,false,'T4',8.5],['K3',[...assembly([3,2,2,2]),d('d',2,2,1,2,['c'])],2,false,false,'T4',8.7],['K4',[d('a',2,2,2,3)],2,true,false,'T5',9.7],['K5',assembly([2,2,1,2]),3,false,true,'T4',8.6],['K6',[d('a',2,2,2,3)],2,true,false,'T5',9.7]];
 for(const [name,ds,e,lit,extreme,t,n]of cases){const v=score(ds,{execution_load:e,execution_extreme:extreme},lit);assert.equal(v.problem_tier,t,name);assert.equal(v.score,n,name);}
 assert.deepEqual(score([d('a',2,2,2,3)],{execution_load:2}).promotions,[]);
});
test('§17 7,9,10,16,17,18 독립 가지 max / 대체 풀이 min / 미허용 경로 제외',()=>{
 const branches=[0,1,2,3,4].map(n=>({branch_id:String(n),execution_load:3,critical_discoveries:[d('x',1,1,0,4)]}));
 assert.ok(score([],{independent_branches:branches,parallel_branch_count:5}).score<=2.8);
 assert.deepEqual(score([d('a',2,2,2,3),d('b',2,2,2,3),d('c',2,2,2,3)]).promotions,[]);
 const easy=route([d('a',2,2,2,3)]),hard=route([d('a',3,3,3,3)],{route_id:'b'});
 assert.equal(S.scoreProblem([hard,easy]).problem_tier,'T3');
 assert.equal(score([],{independent_branches:[{branch_id:'a',critical_discoveries:easy.critical_discoveries},{branch_id:'b',critical_discoveries:hard.critical_discoveries}]}).problem_tier,'T5');
 assert.equal(S.scoreProblem([hard,{...easy,uses_powerful_tool:true}]).problem_tier,'T5');
 assert.equal(S.scoreProblem([route([],{route_id:'brute_force',uses_powerful_tool:true}),hard]).problem_tier,'T5');
 assert.deepEqual(S.scoreProblem([hard,easy]),S.scoreProblem([easy,hard]));
});
test('§17 19–23 및 §17a 연결·자동 노드·사슬 동률·T5 메타데이터',()=>{
 const ds=[d('a'),d('b',2,2,1,2,['a']),d('c',2,2,1,2,['b'])];
 assert.equal(score(ds).score,6.6);assert.equal(score(ds.map(x=>x.id==='b'?{...x,is_non_obvious:false}:x)).score,4.6);
 assert.equal(score(ds.map(x=>({...x,depends_on:[]}))).score,4.6);
 assert.equal(score([ds[0],d('auto',0,0,0,0,['a'],false),{...ds[1],depends_on:['auto']},d('m1',0,2,0,0,['b'],false),{...ds[2],depends_on:['m1']}]).score,6.6);
 const chain=[d('a',0,4,4,0),d('auto',0,0,0,0,['a'],false),d('b',0,4,4,0,['auto']),d('c',4,4,4,2),d('d',4,4,4,2,['c']),d('unconnected',0,4,4,0)];
 const v=score(chain);assert.equal(v.problem_tier,'T5');assert.equal(v.score,10);assert.equal(v.chain_s_avg,1);assert.deepEqual(v.chain_ids,['c','d']);assert.deepEqual(v,score([...chain].reverse()));
 assert.equal(score(chain,{},true).base_tier,'T5');assert.ok(score(chain,{},true).promotions.includes('literacy'));
 assert.deepEqual(score([]),score([d('synthetic_m0',0,0,0,0)]));
 assert.equal(S.scoreProblem([]).reason,'no_routes');assert.equal(S.scoreProblem([route([],{uses_powerful_tool:true})]).reason,'no_eligible_routes');
 const a=route([d('a')],{route_id:'long',execution_load:4,execution_extreme:true}),b=route([d('a')],{route_id:'short'});assert.deepEqual(S.scoreProblem([a,b]).promotions,[]);
});
test('스키마·범위·불리언·ID·의존 그래프와 파생 필드 무시',()=>{
 const v=raw(route([d('a')]));assert.equal(V.evaluate({...v,score:10,problem_tier:'T5'}).computed.score,4.6);
 for(const bad of [null,{...v,literacy_high:true},{...v,reference_student_match:false},raw(route([d('a'),d('a')])),raw(route([d('a',2,2,1,2,['x'])])),raw(route([d('a',2,2,1,2,['b']),d('b',2,2,1,2,['a'])])),raw(route([d('a',5)])),raw(route([d('a')],{execution_extreme:true})),raw(route([d('a')],{parallel_branch_count:2}))])assert.equal(V.evaluate(bad).computed.status,'failed');
});
test('정규화·입력 재사용·프롬프트 독립성',()=>{
 const a=I.input({question:{body:'x + 2 = 3',choices:['1','2'],difficulty:10},scope:'중2'}),b=I.input({question:{body:'x +\n2 = 3',choices:['1','2'],difficulty:1},scope:'중2'});assert.equal(a.inputVersion,b.inputVersion);
 assert.notEqual(a.inputVersion,I.input({question:{body:'x - 2 = 3',choices:['1','2']},scope:'중2'}).inputVersion);
 assert.notEqual(a.inputVersion,I.input({question:{body:'x + 2 = 3',choices:['1','2']},scope:'중2',restrictions:['피타고라스 미사용']}).inputVersion);
 assert.ok(!JSON.stringify(I.request(a)).includes('difficulty":10'));assert.equal(I.settings.model,'gpt-6.1-sol');assert.equal(I.settings.reasoning.effort,'high');assert.equal(I.promptHash.length,64);
});
