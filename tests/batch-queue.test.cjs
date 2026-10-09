const test=require('node:test'),assert=require('node:assert/strict');
const {run,pendingRecognition}=require('../app/batch-queue.js');
test('recognition failure is counted once and dependent steps are skipped while other problems continue',async()=>{
 const {pipeline}=require('../app/batch-queue.js'),seen=[];
 const out=await pipeline(['a','b'],async(task,id)=>{seen.push(task+id);if(task==='recognition'&&id==='a')throw Error('본문 누락');},{through:'solve'});
 assert.deepEqual(seen,['recognitiona','recognitionb','reviewb','solveb']);assert.equal(out.results.filter(r=>r.status==='failed').length,1);assert.equal(out.results.filter(r=>r.status==='skipped').length,2);
 assert.equal(pendingRecognition({regions:[{}],recognition:{body:' '}}),true);
});
test('automatic pipeline continues later phases after failed solve and stops all phases on cancel',async()=>{
 const {pipeline}=require('../app/batch-queue.js'),seen=[];
 const out=await pipeline(['a','b'],async(task,id)=>{seen.push(task+id);if(task==='solve'&&id==='a')throw Error('held');});
 assert.deepEqual(seen,['recognitiona','recognitionb','reviewa','reviewb','solvea','solveb','generationa','generationb']);assert.equal(out.results.filter(r=>r.status==='failed').length,1);
 const signal={};seen.length=0;await pipeline(['a','b'],async(task,id)=>{seen.push(task+id);signal.cancelled=true;},{signal});assert.deepEqual(seen,['recognitiona']);
});
test('stage completion reflects partial work and invalidates stale recognition',()=>{
 const {stages}=require('../app/batch-queue.js');assert.equal(stages().current,'regions');assert.equal(stages().complete.regions,false);
 const p={regions:[{}],recognition:{version:1,confirmed:false,uncertainties:[]},original:{},variants:[]};
 assert.equal(stages([p]).current,'review');p.recognition.confirmed=true;assert.equal(stages([p]).current,'solve');
 p.original={answer:'2',solution:'풀이'};assert.equal(stages([p]).current,'generation');
 p.variants=[{body:'변형',answer:'3',solution:'풀이',sourceVersion:1}];assert.equal(stages([p]).complete.generation,true);
 assert.equal(stages([p,{regions:[{}]}]).complete.recognition,false);
 p.recognition.sourceStale=true;assert.equal(stages([p]).current,'recognition');assert.equal(stages([p]).complete.generation,false);
});
test('batch serializes work, preserves successes and continues after one failure',async()=>{
 const seen=[];let active=0;
 const out=await run(['a','b','c'],async id=>{assert.equal(++active,1);seen.push(id);await Promise.resolve();active--;if(id==='b')throw Error('failure');return id;});
 assert.deepEqual(seen,['a','b','c']);assert.deepEqual(out.results.map(r=>r.status),['completed','failed','completed']);assert.deepEqual(out.remaining,[]);
});
test('batch cancellation starts no further requests and leaves remaining work available',async()=>{
 const signal={};const out=await run([1,2,3],async id=>{signal.cancelled=true;return id;},{signal});
 assert.equal(out.results.length,1);assert.deepEqual(out.remaining,[2,3]);assert.equal(out.cancelled,true);
});
test('recognition collection reuses unchanged results and protects user corrections',()=>{
 const p={regions:[{page:1}]};assert.equal(pendingRecognition(p),true);
 p.recognition={confirmed:false,body:'인식한 문제'};assert.equal(pendingRecognition(p),false);
 p.recognition.sourceStale=true;assert.equal(pendingRecognition(p),true);
 p.recognition.correctedByUser=true;assert.equal(pendingRecognition(p),false);
 assert.equal(pendingRecognition({regions:[]}),false);
});

test('source-only automatic pipeline ends after solve without generation',async()=>{const calls=[];const {pipeline}=require('../app/batch-queue.js');await pipeline(['a','b'],async(task,id)=>calls.push(task+id),{through:'solve'});assert.deepEqual(calls,['recognitiona','recognitionb','reviewa','reviewb','solvea','solveb']);});
