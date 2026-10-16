const test=require('node:test'),assert=require('node:assert/strict');
class Element{constructor(tag){this.tag=tag;this.children=[];this.style={};this.events={};}append(...v){for(const x of v){x.parent=this;this.children.push(x);}}replaceChildren(){this.children=[];}setAttribute(){}addEventListener(e,f){this.events[e]=f;}showModal(){this.open=true;}close(){this.open=false;}remove(){this.parent.children=this.parent.children.filter(x=>x!==this);}set value(v){this._value=v;}get value(){return this._value??this.children[0]?.value;} }
const flush=()=>new Promise(r=>setImmediate(r));
test('central dialog is immediate, cancel ignores late lookup, errors retry without starting',async()=>{
 global.document={body:new Element('body'),createElement:tag=>new Element(tag)};global.window={confirm:()=>true};const {checkQueueUploads}=await import('../app/queue-preflight-ui.js');let reply,cancelled=0;
 const result=checkQueueUploads({check:()=>new Promise(r=>reply=r),cancel:async()=>cancelled++});const dialog=document.body.children[0];assert(dialog.open);assert.equal(dialog.children[0].children[0].textContent,'기존 시험지 등록 여부 확인 중');await flush();dialog.children[0].children.find(x=>x.textContent==='취소').onclick();assert.equal(await result,null);reply({rows:[]});await flush();assert.equal(document.body.children.length,0);assert.equal(cancelled,1);
 let calls=0;const retry=checkQueueUploads({check:async()=>{if(!calls++)throw Error('offline');return {rows:[],token:'ok'};},cancel:async()=>{}});await flush();const body=document.body.children[0].children[0];assert.equal(body.children[0].textContent,'등록 여부 조회 실패');body.children.find(x=>x.textContent==='재시도').onclick();assert.equal((await retry).plan.token,'ok');
});
test('completed rows share one chooser; default excludes and explicit re-recognition returns intent only',async()=>{
 const {checkQueueUploads}=await import('../app/queue-preflight-ui.js');const run=()=>checkQueueUploads({check:async()=>({token:'t',rows:[{id:'a',state:'complete',count:25,expected:25,metadata:{school:'테스트중'},registration:'등록 완료'}]}),cancel:async()=>{}});
 let r=run();await flush();let body=document.body.children[0].children[0];assert.equal(document.body.children.length,1);body.children.find(x=>x.textContent==='선택대로 진행').onclick();assert.deepEqual((await r).choices,{a:'exclude'});
 r=run();await flush();body=document.body.children[0].children[0];body.children.find(x=>x.textContent==='전체 다시 인식').onclick();body.children.find(x=>x.textContent==='선택대로 진행').onclick();assert.deepEqual((await r).choices,{a:'rerecognize'});
});
