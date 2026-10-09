'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {RulesStore,DEFAULT_SCOPE,DEFAULT_PRESETS,compose}=require('../app/rules.cjs');
test('release installs usable defaults and five independent scope examples without personal data',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'release-defaults-')),store=new RulesStore(dir),snapshot=store.snapshot();
 assert.equal(snapshot.presets.length,5);assert.equal(snapshot.modules.filter(m=>m.editable).length,16);
 assert.ok(snapshot.modules.every(m=>m.content.trim()&&m.userContent===null));
 assert.deepEqual(DEFAULT_SCOPE.units,['삼각형의 성질','사각형의 성질']);
 assert.deepEqual(DEFAULT_SCOPE.prerequisites,['여러가지 사각형 이전에 배운 모든 내용']);
 assert.deepEqual(DEFAULT_SCOPE.forbidden,['닮음','피타고라스 정리','삼각비']);
 assert.ok(DEFAULT_PRESETS.some(p=>p.name==='삼각형~닮음'));
 snapshot.presets[0].scope.units.push('test');assert.ok(!store.snapshot().presets[0].scope.units.includes('test'));
 const original=store.snapshot();store.save('validation.common','사용자 개인 검수');
 for(const task of ['generation','revision','validation','solve'])assert.match(compose({task,modules:store.snapshot().modules}).instructions,/사용자 개인 검수/);
 store.save('production.common','test');store.save('production.common','',true);
 const reset=store.snapshot();assert.equal(reset.modules.find(m=>m.id==='production.common').content,original.modules.find(m=>m.id==='production.common').content);
 assert.equal(reset.modules.find(m=>m.id==='validation.common').content,'사용자 개인 검수');assert.deepEqual(reset.presets,original.presets);
});
test('release branding and requested model defaults are wired into startup',()=>{
 const main=fs.readFileSync(path.join(__dirname,'../app/main.cjs'),'utf8'),renderer=fs.readFileSync(path.join(__dirname,'../app/renderer.js'),'utf8');
 assert.match(main,/model:'gpt-6-astra',effort:'medium'/);assert.match(main,/model:'gemini-3\.8-flash-medium',effort:'medium'/);
 assert.equal(require('../app/codex.cjs').DEFAULT_EFFORT,'medium');
 assert.match(main,/title:'문제공방 · Created by animochoi'/);assert.match(renderer,/예\) 22도를 도형밖으로 빼서 안내선으로 이어줘\./);
});
