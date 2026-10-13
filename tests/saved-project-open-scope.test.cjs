'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const renderer=fs.readFileSync(path.join(__dirname,'../app/renderer.js'),'utf8');
const source=renderer.slice(renderer.indexOf('async function importProjectWith('),renderer.indexOf('\nfunction ',renderer.indexOf('async function importProjectWith(')));
function setup(){
 const state={project:null,editor:null,loading:false},calls=[];
 const context={state,selected:()=>null,apiRequired(){},sourceOperationsBlocked:()=>false,window:{confirm:()=>true},updateControls(){},projectSources:()=>state.project?.sources||[],loadSource:async()=>calls.push('source'),loadProject:async p=>{state.project=p;calls.push('load');},workflowUI:{scopeRefresh:async()=>calls.push('refresh'),chooseScope:async()=>{calls.push('choose');state.project.scope={changed:true};state.project.problems.forEach(p=>p.original.solutionStale=true);}}};
 vm.createContext(context);vm.runInContext(source+'\nthis.open=importProjectWith;',context);return {state,calls,open:context.open};
}
const saved=()=>({id:'saved',scope:{grade:'중학교 2학년',units:['삼각형의 성질']},sources:[{id:'primary'}],problems:[{recognition:{version:1},original:{answer:'25',solution:'보존할 풀이',solutionStale:false},variants:[]}]});
test('opening a saved project keeps scope and completed solutions without a new scope dialog',async()=>{
 const x=setup(),p=saved(),before=structuredClone(p);await x.open(async()=>p);assert.deepEqual(x.calls,['load','refresh']);assert.deepEqual(p,before);assert.equal(require('../app/batch-queue.js').stages(p.problems).counts.solve,1);assert.equal(x.state.loading,false);
});
test('importing a new source still asks for its initial scope',async()=>{
 const x=setup();await x.open(async()=>saved(),{chooseScopeForNewSource:true});assert.deepEqual(x.calls,['load','refresh','choose']);
});
test('adding a source to the current project preserves its scope',async()=>{
 const x=setup();x.state.project=saved();await x.open(async()=>({...saved(),sources:[{id:'primary'},{id:'added'}]}),{chooseScopeForNewSource:true});assert.deepEqual(x.calls,['source']);assert.equal(x.state.project.problems[0].original.solutionStale,false);
});
test('cancelled saved-file picker changes neither current scope nor project',async()=>{
 const x=setup(),p=saved();x.state.project=p;await x.open(async()=>null);assert.equal(x.state.project,p);assert.deepEqual(x.calls,[]);assert.equal(x.state.loading,false);
});
