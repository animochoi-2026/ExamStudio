'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {QueueScopeHistory}=require('../app/queue-scope-history.cjs'),{DEFAULT_SCOPE}=require('../app/rules.cjs');
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'queue-scopes-'));t.after(()=>{assert.equal(path.dirname(dir),os.tmpdir());fs.rmSync(dir,{recursive:true,force:true});});return {dir,history:new QueueScopeHistory(dir)};}
test('multiple selected scopes survive restart and reordered equivalent selections deduplicate',t=>{
 const {dir,history}=fixture(t),a=structuredClone(DEFAULT_SCOPE),b={...a,units:['삼각형의 성질'],forbidden:[...a.forbidden,'사각형의 성질']};
 history.remember(a);history.remember(b);history.remember({...a,units:[...a.units].reverse(),forbidden:[...a.forbidden].reverse()});
 const saved=new QueueScopeHistory(dir).list();assert.equal(saved.length,2);assert.deepEqual(saved[0].scope.units,[...a.units].reverse());assert.deepEqual(saved[1].scope,b);assert.match(saved[0].name,/중학교 2학년/);
});
test('existing confirmed queue scopes are available without changing queue or results',t=>{
 const {dir,history}=fixture(t),items=[{scope:DEFAULT_SCOPE,scopeConfirmed:true,steps:{solve:{status:'complete'}}},{scope:{...DEFAULT_SCOPE,units:['닮음']},scopeConfirmed:false}],before=JSON.stringify(items);
 const first=history.list(items);assert.equal(first.length,1);assert.equal(JSON.stringify(items),before);assert.deepEqual(history.list(items),first);assert.equal(new QueueScopeHistory(dir).list([]).length,1);
});
test('cancel/read and invalid selection preserve the previous saved scopes',t=>{
 const {history}=fixture(t);history.remember(DEFAULT_SCOPE);const before=fs.readFileSync(history.file,'utf8');history.list();assert.throws(()=>history.remember({...DEFAULT_SCOPE,units:[]}));assert.equal(fs.readFileSync(history.file,'utf8'),before);
});
test('same unit selection with different prerequisite or forbidden policy remains distinct',t=>{
 const {history}=fixture(t);history.remember(DEFAULT_SCOPE);history.remember({...DEFAULT_SCOPE,forbidden:[...DEFAULT_SCOPE.forbidden,'추가 금지 개념']});assert.equal(history.list().length,2);
});
test('automatic selection uses latest exact grade semester exam across schools and restarts',t=>{
 const {dir,history}=fixture(t),metadata={grade:'중2',semester:'2학기',exam:'중간고사',school:'학교 A'},a=DEFAULT_SCOPE,b={...a,units:['삼각형의 성질']};
 history.remember(a,metadata);history.remember(b,metadata);const next=new QueueScopeHistory(dir);
 assert.deepEqual(next.match({...metadata,school:'학교 B',grade:'중학교 2학년',exam:'중간'}).scope,b);
 for(const patch of [{grade:'고2'},{semester:'1학기'},{exam:'기말고사'},{grade:''}])assert.equal(next.match({...metadata,...patch}),null);
 assert.equal(next.list().length,2);
});
test('historical scope migration never replaces a more recently remembered choice',t=>{
 const {history}=fixture(t),metadata={grade:'중2',semester:'2학기',exam:'중간고사'},a=DEFAULT_SCOPE,b={...a,units:['삼각형의 성질']};
 history.list([{scope:a,scopeConfirmed:true,metadata}]);history.remember(b,metadata);
 history.list([{scope:a,scopeConfirmed:true,metadata}]);assert.deepEqual(history.match(metadata).scope,b);
});
