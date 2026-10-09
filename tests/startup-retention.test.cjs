'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),{EventEmitter}=require('node:events');
const {StartupRetentionReview,readPlan}=require('../app/startup-retention.cjs');
const deferred=()=>{let resolve,reject;const promise=new Promise((ok,no)=>{resolve=ok;reject=no;});return{promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
class Owner extends EventEmitter{
 constructor({visible=true,focused=true}={}){super();Object.assign(this,{visible,focused,minimized:false,destroyed:false});}
 isDestroyed(){return this.destroyed;}isVisible(){return this.visible;}isMinimized(){return this.minimized;}isFocused(){return this.focused;}
 focus(value=true){this.focused=value;this.emit(value?'focus':'blur');}show(){this.visible=true;this.emit('show');}close(){this.destroyed=true;this.emit('closed');}
}
function fixture(options={}){const owner=options.owner||new Owner(),decision=deferred(),log=[],data={token:'unchanged-token',policy:'최근 생성·수정 5개를 유지합니다. 삭제 전 확인합니다.',candidates:[{id:'older-existing',title:'기존 작업',updatedAt:'2026-09-01'}]},applyCalls=[];
 const settings={getWindow:()=>owner,plan:async()=>{log.push('plan');return data;},isBusy:()=>false,showDialog:(parent,settings)=>{assert.equal(parent,owner);assert.deepEqual(settings.buttons,['취소','확인 후 영구 삭제']);assert.equal(settings.defaultId,0);assert.equal(settings.cancelId,0);log.push('dialog');return decision.promise;},apply:async params=>{applyCalls.push(params);return{deleted:['older-existing'],recent:[],failed:[]};},...options};
 return{owner,decision,log,data,applyCalls,review:new StartupRetentionReview(settings)};
}

test('owned asynchronous confirmation leaves the event loop and existing data reads responsive; Cancel never applies',async()=>{
 const f=fixture(),pending=f.review.review();await tick();assert.deepEqual(f.log,['plan','dialog']);
 // Pending dialog must not block a main-process IPC/data operation or a renderer frame.
 let read=false;await new Promise(resolve=>setImmediate(()=>{read=true;resolve();}));assert.equal(read,true);
 f.decision.resolve({response:0});assert.deepEqual(await pending,{status:'cancelled'});assert.equal(f.applyCalls.length,0);assert.equal(f.owner.listenerCount('closed'),0);
});
test('closed owner is cancellation even if an outstanding dialog later reports approval',async()=>{
 const f=fixture(),pending=f.review.review();await tick();f.owner.close();assert.deepEqual(await pending,{status:'closed'});f.decision.resolve({response:1});await tick();assert.equal(f.applyCalls.length,0);assert.equal(f.owner.listenerCount('closed'),0);
});
test('inactive/hidden window does not open a hidden dialog or steal focus; review waits for its owner',async()=>{
 const f=fixture({owner:new Owner({visible:false,focused:false})}),pending=f.review.review();await tick();assert.deepEqual(f.log,[]);
 f.owner.show();await tick();assert.deepEqual(f.log,[]);f.owner.focus();await tick();assert.deepEqual(f.log,['plan','dialog']);
 f.decision.resolve({response:0});await pending;for(const event of['show','focus','restore','closed'])assert.equal(f.owner.listenerCount(event),0);
});
test('closing an inactive owner or a window with an outstanding scan releases review without mutation',async()=>{
 const f=fixture({owner:new Owner({focused:false})}),pending=f.review.review();f.owner.close();assert.deepEqual(await pending,{status:'closed'});assert.deepEqual(f.log,[]);
 const scan=deferred(),g=fixture({plan:()=>scan.promise}),waiting=g.review.review();await tick();g.owner.close();assert.deepEqual(await waiting,{status:'closed'});scan.resolve(g.data);await tick();assert.equal(g.applyCalls.length,0);assert.equal(g.log.includes('dialog'),false);
});
test('focus lost during scanning defers dialog and refreshes the plan after focus returns',async()=>{
 const scan=deferred();let calls=0;const f=fixture({plan:()=>++calls===1?scan.promise:Promise.resolve({...f.data,token:'fresh-token'})});const pending=f.review.review();await tick();f.owner.focus(false);scan.resolve(f.data);await tick();assert.equal(f.log.includes('dialog'),false);
 f.owner.focus();await tick();assert.equal(calls,2);assert.equal(f.log.filter(x=>x==='dialog').length,1);f.decision.resolve({response:1});await pending;assert.deepEqual(f.applyCalls,[{token:'fresh-token',confirmed:true}]);
});
test('repeat/parallel boot requests show one dialog per session; a new launch retains the confirmation requirement',async()=>{
 const f=fixture(),a=f.review.review(),b=f.review.review();assert.equal(a,b);await tick();assert.equal(f.log.filter(x=>x==='dialog').length,1);f.decision.resolve({response:0});await a;
 assert.deepEqual(await f.review.review(),{status:'cancelled'});assert.equal(f.log.filter(x=>x==='dialog').length,1);
 const newLaunch=fixture(),next=newLaunch.review.review();await tick();assert.equal(newLaunch.log.includes('dialog'),true);newLaunch.decision.resolve({response:0});await next;assert.equal(newLaunch.applyCalls.length,0);
});
test('only explicit positive response may apply the exact token; busy and stale-state checks remain authoritative',async()=>{
 const f=fixture(),pending=f.review.review();await tick();f.decision.resolve({response:1});assert.equal((await pending).status,'completed');assert.deepEqual(f.applyCalls,[{token:'unchanged-token',confirmed:true}]);
 let busy=false;const g=fixture({isBusy:()=>busy}),waiting=g.review.review();await tick();busy=true;g.decision.resolve({response:1});assert.deepEqual(await waiting,{status:'deferred'});assert.equal(g.applyCalls.length,0);
 const stale=fixture({apply:async()=>{throw Error('정리 대상이 변경되었습니다.');}}),old=stale.review.review();await tick();stale.decision.resolve({response:1});await assert.rejects(old,/정리 대상이 변경/);
});
test('no candidates or a busy app opens no confirmation and performs no cleanup',async()=>{
 const f=fixture({plan:async()=>({candidates:[]})});assert.deepEqual(await f.review.review(),{status:'none'});assert.equal(f.log.includes('dialog'),false);
 const g=fixture({isBusy:()=>true});assert.deepEqual(await g.review.review(),{status:'deferred'});assert.deepEqual(g.log,[]);assert.equal(g.applyCalls.length,0);
});

test('actual renderer boot loads existing project and two frames before starting review; pending/cancelled review never blocks boot',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../app/renderer.js'),'utf8'),start=source.indexOf('function scheduleStartupRetentionReview()'),end=source.lastIndexOf('await boot();');assert(start>=0&&end>start);
 const frames=[],log=[],review=deferred(),nodes=new Map(),project={id:'already-existing',problems:[{original:{body:'기존 문항'}}]},recent=Array.from({length:14},(_,i)=>({id:'existing-'+i,title:'기존 작업 '+i,updatedAt:'2026-10-01'}));
 const context={state:{errors:[]},api:{boot:async()=>({project,recent,notices:[]}),readErrors:async()=>[],reviewProjectRetention:()=>{log.push('review');return review.promise;},projectRetention:()=>assert.fail('Legacy cleanup API invoked during boot')},window:{confirm:()=>assert.fail('Blocking confirm invoked during boot')},requestAnimationFrame:fn=>frames.push(fn),wireEvents(){},updateControls(){},renderAiControls(){},renderErrors(){},renderAccount(){},toast(){},errorText:e=>e.message,element:()=>({append(){}}),button:()=>({append(){}}),guarded:f=>f,$:id=>{if(!nodes.has(id))nodes.set(id,{append(){},checked:false});return nodes.get(id);},loadProject:async p=>{assert.equal(p,project);log.push('project');},workflowUI:{scopeRefresh:async()=>log.push('scope')},selectStartupProvider:()=>{log.push('provider');return Promise.resolve();}};
 vm.runInNewContext(source.slice(start,end)+';globalThis.testBoot=boot;',context);await context.testBoot();assert.deepEqual(log,['project','scope','provider']);assert.equal(context.state.recent.length,14);
 frames.shift()();assert.deepEqual(log,['project','scope','provider']);frames.shift()();assert.deepEqual(log,['project','scope','provider','review']);
 assert.equal(context.state.recent.length,14);review.resolve({status:'cancelled'});await tick();assert.equal(context.state.recent.length,14);assert.equal(project.problems[0].original.body,'기존 문항');
});

test('read-only worker uses unchanged retention policy and leaves its isolated empty store untouched',async t=>{
 const temporaryRoot=path.resolve(os.tmpdir()),directory=fs.mkdtempSync(path.join(temporaryRoot,'exam-startup-review-'));
 t.after(()=>{const absolute=path.resolve(directory);assert.equal(path.dirname(absolute),temporaryRoot);assert(path.basename(absolute).startsWith('exam-startup-review-'));assert.equal(fs.lstatSync(absolute).isSymbolicLink(),false);fs.rmSync(absolute,{recursive:true,force:true});});
 fs.mkdirSync(path.join(directory,'projects'));fs.writeFileSync(path.join(directory,'index.json'),JSON.stringify({lastId:null,recent:[]}));const before=fs.readFileSync(path.join(directory,'index.json'));
 const plan=await readPlan(directory);assert.equal(plan.candidates.length,0);assert.equal(plan.keep.length,0);assert.match(plan.policy,/5개/);assert.deepEqual(fs.readFileSync(path.join(directory,'index.json')),before);assert.deepEqual(fs.readdirSync(path.join(directory,'projects')),[]);
 const main=fs.readFileSync(path.join(__dirname,'../app/main.cjs'),'utf8');assert.match(main,/showDialog:\(owner,options\)=>dialog\.showMessageBox\(owner,options\)/);assert.doesNotMatch(main.match(/handle\('boot',[^\n]+/)[0],/retention|\.plan\(store\)/);
});
