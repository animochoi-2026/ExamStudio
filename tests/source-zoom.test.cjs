'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const source=fs.readFileSync(path.join(__dirname,'../app/renderer.js'),'utf8');
function harness(patch={}){
 const state={sourceSize:{width:1000,height:1200},image:{},zoom:1,fitting:false,renderToken:0,page:1,pages:6,...patch},nodes=new Map();
 const $=id=>{if(!nodes.has(id))nodes.set(id,{style:{},hidden:false,clientWidth:802,clientHeight:602,scrollTop:50,scrollLeft:40,classList:{toggle(){}},events:{},addEventListener(type,fn){this.events[type]=fn;},getContext(){return{fillRect(){},drawImage(){}};}});return nodes.get(id);};
 const context=vm.createContext({state,$,window:{devicePixelRatio:1},getComputedStyle:()=>({paddingLeft:'0',paddingRight:'0',paddingTop:'0',paddingBottom:'0'}),guarded:fn=>fn,renderRegions(){},selected:()=>({})});
 for(const name of ['sourceOperationsBlocked','sourceZoomBlocked'])vm.runInContext(source.split('\n').find(l=>l.startsWith('function '+name+'(')),context);
 const start=source.indexOf("  for (const id of ['fitWidth'"),end=source.indexOf("  $('pageNumber').value",start);
 vm.runInContext('function updateControls(){const blocked=sourceOperationsBlocked(),p=selected();'+source.slice(start,end)+'}',context);
 vm.runInContext(source.slice(source.indexOf('async function renderPage()'),source.indexOf('function normalizedPoint(')),context);
 for(const line of source.split('\n').filter(l=>l.startsWith("  $('zoomIn').addEventListener")||l.startsWith("  $('fitHeight').addEventListener")||l.startsWith("  $('viewer').addEventListener('wheel'")))vm.runInContext(line,context);
 return{state,$,context,update:()=>vm.runInContext('updateControls()',context),click:id=>$(id).events.click(),wheel:extra=>{const event={ctrlKey:true,deltaY:-1,preventDefault(){this.prevented=true;},...extra};$('viewer').events.wheel(event);return event;}};
}
test('queue and AI activity allow zoom but retain source page and deletion locks',async()=>{
 for(const flag of ['queueRunning','busy','batch','saving','documentBusy','savingAi']){
  const h=harness({[flag]:true});h.update();assert.equal(h.$('zoomIn').disabled,false);assert.equal(h.$('fitPage').disabled,false);assert.equal(h.$('pageNumber').disabled,true);assert.equal(h.$('deleteSelection').disabled,true);assert.equal(h.$('nextPage').disabled,true);
  await h.click('zoomIn');assert.equal(h.state.zoom,1.2);assert.equal(h.$('pageCanvas').width,1200);assert.equal(h.$('pageStage').style.width,'1200px');
  await h.click('zoomOut');assert.equal(h.state.zoom,1);
 }
});
test('loading, absent source and active region drag block both button and wheel zoom',async()=>{
 for(const patch of [{loading:true},{sourceSize:null},{drawing:{}}]){const h=harness(patch);h.update();assert.equal(h.$('zoomIn').disabled,true);await h.click('zoomIn');assert.equal(h.state.zoom,1);assert.equal(h.wheel().prevented,undefined);assert.equal(h.state.zoom,1);}
});
test('existing fit controls resize canvas and reset scroll where previously supported',async()=>{
 const h=harness({queueRunning:true});await h.click('fitWidth');assert.equal(h.state.zoom,.8);assert.equal(h.$('pageCanvas').width,800);
 await h.click('fitHeight');assert.equal(h.state.zoom,.5);assert.equal(h.$('pageCanvas').height,600);assert.equal(h.$('viewer').scrollTop,0);
 await h.click('fitPage');assert.equal(h.state.zoom,.5);await h.click('zoomIn');assert.equal(h.state.fitting,false);assert.equal(h.state.zoom,.6);
});
test('Ctrl or Meta wheel zooms and ordinary wheel remains scroll; existing bounds retained',async()=>{
 const h=harness({queueRunning:true});assert.equal(h.wheel({ctrlKey:false}).prevented,undefined);assert.equal(h.state.zoom,1);
 assert.equal(h.wheel().prevented,true);assert.equal(h.state.zoom,1.1);h.wheel({ctrlKey:false,metaKey:true,deltaY:1});assert.equal(h.state.zoom,1);
 h.state.zoom=4;await h.click('zoomIn');h.wheel();assert.equal(h.state.zoom,4);h.state.zoom=.1;await h.click('zoomOut');h.wheel({deltaY:1});assert.equal(h.state.zoom,.1);
});
test('actual PDF render uses requested zoom and publishes resized canvas',async()=>{
 const scales=[],h=harness({queueRunning:true,image:null,pdf:{getPage:async()=>({getViewport:()=>({width:1000,height:1200})})}});
 h.context.createPdfRender=(_page,scale)=>{scales.push(scale);return{canvas:{},task:{promise:Promise.resolve(),cancel(){}}};};
 await h.click('zoomIn');await h.click('zoomOut');assert.deepEqual(scales,[1.2,1]);assert.equal(h.$('pageCanvas').width,1000);assert.equal(h.state.renderTask,null);
});
