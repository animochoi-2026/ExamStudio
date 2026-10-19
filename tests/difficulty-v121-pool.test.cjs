'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {runPool}=require('../app/difficulty-v121/pool.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
test('three independent items run, one slow item does not block the next, stage order stays local',async()=>{
 const gates=Array.from({length:5},gate),started=[],steps=[];let active=0,peak=0;
 const pending=runPool([0,1,2,3,4],{concurrency:3},async id=>{
  started.push(id);peak=Math.max(peak,++active);steps.push(id+':1');await gates[id].promise;steps.push(id+':2');await tick();steps.push(id+':3');active--;
 });
 await tick();assert.deepEqual(started,[0,1,2]);
 gates[1].resolve();await tick();await tick();assert.deepEqual(started,[0,1,2,3]);
 for(const g of gates)g.resolve();await pending;
 assert.equal(peak,3);assert.equal(active,0);assert.equal(new Set(started).size,5);
 for(let i=0;i<5;i++)assert.deepEqual(steps.filter(s=>s.startsWith(i+':')),[i+':1',i+':2',i+':3']);
});
test('fatal error stops new dispatch but drains other active items before rejection',async()=>{
 const hold=gate(),started=[],finished=[];let ended=false;
 const pending=runPool([0,1,2,3,4],{concurrency:3},async id=>{started.push(id);if(id===0)throw Error('integrity');await hold.promise;finished.push(id);});
 const checked=assert.rejects(pending,/integrity/).then(()=>ended=true);
 await tick();assert.equal(ended,false);assert.deepEqual(started,[0,1,2]);
 hold.resolve();await checked;assert.equal(finished.length,2);assert.equal(started.length,3);
});
test('operator drain preserves in-flight work and authorization constrains concurrency',async()=>{
 let stop=false;const hold=gate(),started=[];
 const pending=runPool([0,1,2,3],{concurrency:3,shouldStop:()=>stop},async id=>{started.push(id);await hold.promise;});
 await tick();stop=true;hold.resolve();await assert.rejects(pending,/operator_stop/);assert.deepEqual(started,[0,1,2]);
 await assert.rejects(runPool([1],{concurrency:4},async()=>{}),/approval/);
});
