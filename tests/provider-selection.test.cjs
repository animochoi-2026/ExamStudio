const test = require('node:test'), assert = require('node:assert/strict');
const helpers = import('../app/provider-selection.js');
test('sidebar selects only Codex five-hour and weekly limits, never unrelated models',async()=>{
 const {codexUsageWindows:rows}=await helpers;
 const bucket={primary:{usedPercent:12,windowDurationMins:300},secondary:{usedPercent:25,windowDurationMins:10080}};
 const value=rows({rateLimitsByLimitId:{spark:{primary:{usedPercent:99,windowDurationMins:300}},codex:bucket,review:bucket}});
 assert.equal(value.length,2);assert.deepEqual(value.map(r=>r.remaining),[88,75]);
 assert.deepEqual(rows({rateLimits:bucket}).map(r=>r.remaining),[88,75]);
 assert.ok(rows({rateLimitsByLimitId:{spark:bucket}}).every(r=>r.remaining===null));
 assert.ok(rows({rateLimits:{...bucket,limitId:'spark'}}).every(r=>r.remaining===null));
 assert.ok(rows(null).every(r=>r.remaining===null));
 assert.deepEqual(rows({rateLimits:{primary:{usedPercent:120,windowDurationMins:10080}}}).map(r=>r.remaining),[null,0]);
});
const status = (planType = 'pro') => ({account:{type:'chatgpt',planType},models:[{model:'gpt-6-astra',inputModalities:['text','image']}],rateLimits:null});

test('startup prefers Gemini for missing GPT login, API-key-only login and a free account',async()=>{
 const {preferGeminiReason:reason}=await helpers;
 for(const input of [null,{account:null,error:'CLI missing'},{...status(),account:{type:'apiKey'}},status('free')])assert.ok(reason(input,'gpt-6-astra'));
});
test('paid and unknown plans with available models stay on GPT; missing usage is not exhausted usage',async()=>{
 const {preferGeminiReason:reason}=await helpers;
 for(const input of [status(),status('plus'),status(null),{...status(),error:'사용량을 확인하지 못했습니다.'}])assert.equal(reason(input,'gpt-6-astra'),'');
 assert.ok(reason({...status(),models:[]},'gpt-6-astra'));
});
test('only relevant nonexpired exhausted GPT quota changes the startup preference',async()=>{
 const {preferGeminiReason:reason}=await helpers;
 const now=1000000,window={usedPercent:100,resetsAt:2000};
 assert.ok(reason({...status(),rateLimits:{rateLimits:{secondary:window}}},'gpt-6-astra',now));
 assert.equal(reason({...status(),rateLimits:{rateLimits:{secondary:{...window,resetsAt:500}}}},'gpt-6-astra',now),'');
 assert.equal(reason({...status(),rateLimits:{rateLimitsByLimitId:{other:{primary:window}}}},'gpt-6-astra',now),'');
 assert.ok(reason({...status(),rateLimits:{rateLimitsByLimitId:{codex:{primary:window}}}},'gpt-6-astra',now));
});
test('Gemini selection preserves supported saved models and replaces missing catalog entries',async()=>{
 const {selectGeminiModel:select}=await helpers;
 const account={available:true,models:[{model:'gemini-first'},{model:'gemini-saved'}]};
 assert.equal(select(account,'gemini-saved'),'gemini-saved');assert.equal(select(account,'removed-model'),'gemini-first');
 assert.equal(select({...account,available:false},'gemini-saved'),null);assert.equal(select({available:true,models:[]},''),null);
});
test('startup account checks time out without retrying or running inference',async()=>{
 const {boundedAccountCheck:check}=await helpers;let calls=0;
 await assert.rejects(check(()=>{calls++;return new Promise(()=>{});},10),/시간이 초과/);assert.equal(calls,1);
 assert.deepEqual(await check(()=>Promise.resolve(status()),50),status());
});
