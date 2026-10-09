'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');
const { CodexBridge, MODEL, DEFAULT_EFFORT, OUTPUT_SCHEMA, validateResult, validateModelSelection, safeError } = require('../app/codex.cjs');

const original = () => ({ id: 'p-original', kind: 'original', sourceId: 'p', body: '$AB=13$인 삼각형', choices: [], answer: '$2$', solution: '$r=\\frac{5+12-13}{2}=2$', diagram: null, include: false, layout: 'auto', needsReview: true });
const output = () => ({ reply: '원문을 인식했습니다.', original: original(), variants: [], replaceVariants: false, warnings: [] });

class FakeChild extends EventEmitter {
  constructor(handler) {
    super(); this.stdout = new PassThrough(); this.stderr = new PassThrough(); this.killed = false; this.messages = [];
    this.stdin = new Writable({ write: (chunk, encoding, cb) => {
      for (const line of chunk.toString().trim().split('\n')) {
        const msg = JSON.parse(line); this.messages.push(msg);
        queueMicrotask(() => handler(msg, this));
      }
      cb();
    } });
  }
  send(msg) { this.stdout.write(JSON.stringify(msg) + '\n'); }
  reply(id, result) { this.send({ id, result }); }
  kill() { this.killed = true; this.stdout.end(); this.stderr.end(); queueMicrotask(() => this.emit('exit', 0)); }
}

function fixture(onRequest = () => {}, options = {}) {
  let child; let spawnArgs; const events = [];
  const bridge = new CodexBridge({ cwd: process.cwd(), executable: 'test-codex.exe', requestTimeoutMs: 300, turnTimeoutMs: 1500, onEvent: event => events.push(event),
    spawnImpl: (file, args, opts) => {
      spawnArgs = { file, args, opts };
      child = new FakeChild((msg, proc) => {
        if (onRequest(msg, proc)) return;
        if (msg.method === 'initialize') proc.reply(msg.id, { userAgent: 'test' });
        if (msg.method === 'account/read') proc.reply(msg.id, { account: { type: 'chatgpt', email: 'test@example.com', planType: 'pro', secret: 'must-not-leak' } });
        if (msg.method === 'model/list') proc.reply(msg.id, { data: [{ id: MODEL, model: MODEL, displayName: 'Astra', description: 'Geometry reasoning', isDefault: true, hidden: false, defaultReasoningEffort: 'medium', supportedReasoningEfforts: [{ reasoningEffort: 'low', description: 'Quick' }, { reasoningEffort: 'medium', description: 'Balanced' }, { reasoningEffort: 'high', description: 'Detailed' }], inputModalities: ['text', 'image'] }], nextCursor: null });
        if (msg.method === 'account/rateLimits/read') proc.reply(msg.id, { rateLimits: { primary: { usedPercent: 12 } } });
        if (msg.method === 'thread/start' || msg.method === 'thread/resume') proc.reply(msg.id, { thread: { id: msg.params.threadId || 'thread-test', ephemeral: true } });
        if (msg.method === 'thread/unsubscribe') proc.reply(msg.id, {status:'unsubscribed'});
        if (msg.method === 'account/login/start') proc.reply(msg.id, { loginId: 'login-test', authUrl: 'https://auth.openai.com/test', extra: 'not-returned' });
        if (msg.method === 'account/login/cancel' || msg.method === 'account/logout') proc.reply(msg.id, {});
      });
      return child;
    }, ...options });
  return { bridge, events, child: () => child, spawnArgs: () => spawnArgs };
}

const nextTick = () => new Promise(resolve => setImmediate(resolve));

test('region detection survives the real protocol response validator with integer reading order',async t=>{
 const {schema}=require('../app/region-detector.cjs');
 const result={regions:[{order:1,x:.05,y:.1,width:.4,height:.3},{order:2,x:.55,y:.1,width:.4,height:.3}]};
 const f=fixture((msg,child)=>{if(msg.method!=='turn/start')return false;assert.deepEqual(msg.params.outputSchema,schema);child.reply(msg.id,{turn:{id:'regions-turn'}});child.send({method:'turn/completed',params:{threadId:msg.params.threadId,turn:{id:'regions-turn',status:'completed',items:[{type:'agentMessage',text:JSON.stringify(result)}]}}});return true;});
 t.after(()=>f.bridge.close());
 const response=await f.bridge.run({context:{id:'regions-test'},text:'시험지의 문제 영역을 찾으세요.',execution:{task:'region_detection',schema,instructions:'문제 위치만 반환합니다.'}});
 assert.deepEqual(response.result,result);
});

test('every compiled GPT task starts an ephemeral session and unsubscribes after completion',async t=>{
 const schema={type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false};
 const f=fixture((msg,child)=>{if(msg.method!=='turn/start')return false;child.reply(msg.id,{turn:{id:'ephemeral-turn'}});child.send({method:'turn/completed',params:{threadId:msg.params.threadId,turn:{id:'ephemeral-turn',status:'completed',items:[{type:'agentMessage',text:'{"ok":true}'}]}}});return true;});t.after(()=>f.bridge.close());
 for(const task of ['recognition','generation','solve','revision','validation'])await f.bridge.run({threadId:'old-persisted-thread',context:{id:'p'},text:task,execution:{task,schema,instructions:'Selected task only'}});
 const starts=f.child().messages.filter(m=>m.method==='thread/start');assert.equal(starts.length,5);assert.ok(starts.every(m=>m.params.ephemeral===true));assert.equal(f.child().messages.filter(m=>m.method==='thread/resume').length,0);assert.equal(f.child().messages.filter(m=>m.method==='thread/unsubscribe').length,5);assert.equal(f.bridge.loadedThreads.size,0);
});

test('unsupported nonpersistent mode stops before inference instead of falling back to saved sessions',async t=>{
 for(const ephemeral of [false,undefined]){
  const f=fixture((msg,child)=>{if(msg.method!=='thread/start')return false;child.reply(msg.id,{thread:{id:'unsupported',...(ephemeral===undefined?{}:{ephemeral})}});return true;});t.after(()=>f.bridge.close());
  await assert.rejects(f.bridge.run({context:{id:'p'},text:'read'}),/세션 기록 미저장/);
  assert.equal(f.child().messages.filter(m=>m.method==='thread/start').length,1);assert.equal(f.child().messages.filter(m=>m.method==='turn/start'||m.method==='thread/resume').length,0);
 }
});

test('legacy saved IDs are ignored while app-owned conversation context remains available',async t=>{
 const f=fixture((msg,child)=>{if(msg.method!=='turn/start')return false;child.reply(msg.id,{turn:{id:'legacy-turn'}});child.send({method:'turn/completed',params:{threadId:msg.params.threadId,turn:{id:'legacy-turn',status:'completed',items:[{type:'agentMessage',text:JSON.stringify(output())}]}}});return true;});t.after(()=>f.bridge.close());
 await f.bridge.run({threadId:'saved-before-update',context:{id:'p',messages:[{role:'user',text:'각도는 안쪽에 표시'}]},text:'continue'});
 assert.equal(f.child().messages.find(m=>m.method==='thread/start').params.ephemeral,true);assert.equal(f.child().messages.some(m=>m.method==='thread/resume'),false);assert.match(f.child().messages.find(m=>m.method==='turn/start').params.input.at(-1).text,/각도는 안쪽에 표시/);
});

test('compiled execution uses its own schema and one rule copy without resuming old task history',async t=>{
 const {recognition}=require('./workflow-fixtures.cjs');const {schemas}=require('../app/task-schemas.cjs');
 const f=fixture((msg,child)=>{if(msg.method!=='turn/start')return false;
  child.reply(msg.id,{turn:{id:'execution-turn'}});
  child.send({method:'thread/tokenUsage/updated',params:{threadId:msg.params.threadId,tokenUsage:{last:{inputTokens:120,outputTokens:80,cachedInputTokens:30}}}});
  child.send({method:'turn/completed',params:{threadId:msg.params.threadId,turn:{id:'execution-turn',status:'completed',items:[{type:'agentMessage',text:JSON.stringify({reply:'인식',recognition:recognition()})}]}}});return true;
 });t.after(()=>f.bridge.close());
 const result=await f.bridge.run({threadId:'old-generation-thread',context:{id:'p',messages:[{role:'user',text:'OLD HISTORY'}]},images:[],text:'SELECTED DATA',execution:{instructions:'ONLY SELECTED RULES',schema:schemas.recognition,task:'recognition'}});
 const opened=f.child().messages.find(m=>m.method==='thread/start');assert.ok(opened);assert.equal(opened.params.developerInstructions,'ONLY SELECTED RULES');assert.doesNotMatch(opened.params.baseInstructions,/ONLY SELECTED/);assert.equal(f.child().messages.some(m=>m.method==='thread/resume'),false);
 const turn=f.child().messages.find(m=>m.method==='turn/start');assert.equal(turn.params.input[0].text,'SELECTED DATA');assert.deepEqual(turn.params.outputSchema,schemas.recognition);assert.equal(result.tokens.cachedInputTokens,30);assert.equal(f.bridge.loadedThreads.size,0);
});

test('quota notifications update the matching cached bucket and drop stale maps for legacy events', async t => {
  const f = fixture(); t.after(() => f.bridge.close()); await f.bridge.getAccount();
  f.bridge.rateLimits = { rateLimitsByLimitId: { codex: { primary: { usedPercent: 10 } }, other: { primary: { usedPercent: 20 } } } };
  f.child().send({ method: 'account/rateLimits/updated', params: { rateLimits: { limitId: 'codex', primary: { usedPercent: 40 } } } });
  await nextTick();
  assert.equal(f.events.at(-1).type, 'usage-updated');
  assert.equal(f.events.at(-1).rateLimits.rateLimitsByLimitId.codex.primary.usedPercent, 40);
  assert.equal(f.events.at(-1).rateLimits.rateLimitsByLimitId.other.primary.usedPercent, 20);
  f.child().send({ method: 'account/rateLimits/updated', params: { rateLimits: { primary: { usedPercent: 55 } } } });
  await nextTick();
  assert.equal(f.events.at(-1).rateLimits.rateLimitsByLimitId, null);
  assert.equal(f.events.at(-1).rateLimits.rateLimits.primary.usedPercent, 55);
});

test('classification uses its own schema and returning from Gemini carries recent conversation', async t => {
  const f=fixture((msg,child)=>{
    if(msg.method!=='turn/start')return false;
    const result=msg.params.outputSchema.properties.confident?{part:'geometry',confident:true,reason:'도형'}:output();
    child.reply(msg.id,{turn:{id:'classification-turn'}});
    child.send({method:'turn/completed',params:{threadId:msg.params.threadId,turn:{id:'classification-turn',status:'completed',items:[{type:'agentMessage',text:JSON.stringify(result)}]}}});return true;
  });t.after(()=>f.bridge.close());
  const result=await f.bridge.run({context:{id:'p'},text:'분류',purpose:'classify'});
  assert.equal(result.result.part,'geometry');assert.equal(result.result.original,undefined);
  await f.bridge.run({threadId:result.threadId,context:{id:'p',lastProvider:'gemini',messages:[{role:'user',text:'Gemini에서 정정한 조건'}]},text:'계속'});
  assert.match(f.child().messages.filter(m=>m.method==='turn/start').at(-1).params.input[0].text,/Gemini에서 정정한 조건/);
});

test('changed common prompt resumes the existing conversation with new rules and required formats', async t => {
  let turns = 0;
  const f = fixture((msg, child) => {
    if (msg.method !== 'turn/start') return false;
    const threadId = msg.params.threadId, turnId = `prompt-turn-${++turns}`;
    child.reply(msg.id, { turn: { id: turnId } });
    child.send({ method: 'item/completed', params: { threadId, turnId, item: { id: 'final', type: 'agentMessage', phase: 'final_answer', text: JSON.stringify(output()) } } });
    child.send({ method: 'turn/completed', params: { threadId, turn: { id: turnId, status: 'completed', items: [] } } });
    return true;
  });
  t.after(() => f.bridge.close());
  const first = await f.bridge.run({ context: { id: 'p' }, text: '인식', commonPrompt: '기존 수업 지침' });
  await f.bridge.run({ threadId: first.threadId, context: { id: 'p' }, text: '계속', commonPrompt: '기존 수업 지침' });
  assert.equal(f.child().messages.filter(m => m.method === 'thread/resume').length, 0);
  await f.bridge.run({ threadId: first.threadId, context: { id: 'p' }, text: '유사문제', commonPrompt: '삼각함수 사용 금지' });
  const resume = f.child().messages.filter(m => m.method === 'thread/resume');
  assert.equal(resume.length, 1);
  assert.equal(resume[0].params.threadId, first.threadId);
  assert.match(resume[0].params.developerInstructions, /삼각함수 사용 금지/);
  assert.doesNotMatch(resume[0].params.developerInstructions, /기존 수업 지침/);
  assert.match(resume[0].params.developerInstructions, /JSON/);
  assert.match(resume[0].params.developerInstructions, /LaTeX/);
  assert.match(resume[0].params.developerInstructions, /도구를 호출하지/);
  assert.deepEqual(f.child().messages.filter(m => m.method === 'turn/start').at(-1).params.outputSchema, OUTPUT_SCHEMA);
  await f.bridge.run({ threadId: first.threadId, context: { id: 'p' }, text: '기하', commonPrompt: '삼각함수 사용 금지', part: 'geometry', partPrompt: '선택한 기하 지침' });
  assert.match(f.child().messages.filter(m => m.method === 'thread/resume').at(-1).params.developerInstructions, /선택한 기하 지침/);
  await f.bridge.run({ threadId: first.threadId, context: { id: 'p' }, text: '정수', commonPrompt: '삼각함수 사용 금지', part: 'integer', partPrompt: '선택한 정수 지침' });
  const changedPart = f.child().messages.filter(m => m.method === 'thread/resume').at(-1);
  assert.equal(changedPart.params.threadId, first.threadId);
  assert.match(changedPart.params.developerInstructions, /선택한 정수 지침/);
  assert.doesNotMatch(changedPart.params.developerInstructions, /선택한 기하 지침/);
  await f.bridge.run({ threadId: first.threadId, context: { id: 'p' }, text: '미지정', commonPrompt: '삼각함수 사용 금지' });
  const clearedPart = f.child().messages.filter(m => m.method === 'thread/resume').at(-1).params.developerInstructions;
  assert.match(clearedPart, /현재 문제 파트: 미지정/);
  assert.doesNotMatch(clearedPart, /선택한 정수 지침/);
});

test('managed ChatGPT account, exact model, schema and no raw credentials exposed', async t => {
  const f = fixture(); t.after(() => f.bridge.close());
  const result = await f.bridge.getAccount();
  assert.equal(result.account.type, 'chatgpt'); assert.equal(result.models[0].model, MODEL);
  assert.equal(result.models[0].defaultReasoningEffort, 'medium');
  assert.equal(result.models[0].supportedReasoningEfforts[2].description, 'Detailed');
  assert.equal(result.models[0].description, 'Geometry reasoning');
  assert.equal(result.models[0].isDefault, true);
  assert.equal(result.account.secret, undefined);
  assert.equal(f.spawnArgs().opts.windowsHide, true);
  assert.ok(f.spawnArgs().args.includes('features.shell_tool=false'));
  assert.ok(f.spawnArgs().args.includes('mcp_servers={}'));
  const methods = f.child().messages.map(m => m.method);
  assert.deepEqual(methods.slice(0, 4), ['initialize', 'initialized', 'account/read', 'model/list']);
  assert.deepEqual(await f.bridge.login(), { loginId: 'login-test', authUrl: 'https://auth.openai.com/test' });
  assert.equal(OUTPUT_SCHEMA.additionalProperties, false);
  assert.deepEqual(validateResult(output()), output());
});

test('account logout cancels pending login and clears account/model/usage state', async t => {
  const f=fixture();t.after(()=>f.bridge.close());await f.bridge.getAccount();await f.bridge.login();await f.bridge.logout();
  assert.deepEqual(f.child().messages.slice(-2).map(m=>m.method),['account/login/cancel','account/logout']);
  assert.equal(f.bridge.account,null);assert.deepEqual(f.bridge.models,[]);assert.equal(f.bridge.rateLimits,null);
  assert.equal(f.events.at(-1).type,'account-updated');assert.equal(f.events.at(-1).account,null);
  await f.bridge.login();assert.equal(f.child().messages.at(-1).method,'account/login/start');
});

test('correlates out-of-order responses and rejects missing response after timeout', async t => {
  const f = fixture((msg, child) => {
    if (msg.method === 'custom/a') { setTimeout(() => child.reply(msg.id, 'a'), 20); return true; }
    if (msg.method === 'custom/b') { child.reply(msg.id, 'b'); return true; }
    if (msg.method === 'custom/timeout') return true;
  });
  t.after(() => f.bridge.close()); await f.bridge.start();
  assert.deepEqual(await Promise.all([f.bridge._request('custom/a'), f.bridge._request('custom/b')]), ['a', 'b']);
  await assert.rejects(f.bridge._request('custom/timeout', {}, 15), /초과/);
  assert.equal(f.bridge.pending.size, 0);
});

test('handles completion before turn/start response, sends images and keeps per-problem thread', async t => {
  let turns = 0;
  const f = fixture((msg, child) => {
    if (msg.method !== 'turn/start') return false;
    turns++;
    const turnId = `turn-${turns}`; const threadId = msg.params.threadId; const result = output();
    child.send({ method: 'turn/started', params: { threadId, turn: { id: turnId } } });
    child.send({ method: 'item/agentMessage/delta', params: { threadId, turnId, itemId: 'final', delta: JSON.stringify(result).slice(0, 20) } });
    child.send({ method: 'item/completed', params: { threadId, turnId, item: { id: 'final', type: 'agentMessage', phase: 'final_answer', text: JSON.stringify(result) } } });
    child.send({ method: 'turn/completed', params: { threadId, turn: { id: turnId, status: 'completed', items: [] } } });
    child.reply(msg.id, { turn: { id: turnId, status: 'inProgress' } });
    return true;
  });
  t.after(() => f.bridge.close());
  const result = await f.bridge.run({ context: { id: 'p' }, text: '인식해줘', images: ['data:image/png;base64,AA=='] });
  assert.equal(result.threadId, 'thread-test'); assert.equal(result.result.original.answer, '$2$');
  assert.equal(result.model, MODEL); assert.equal(result.effort, DEFAULT_EFFORT);
  const request = f.child().messages.find(m => m.method === 'turn/start');
  assert.equal(request.params.model, MODEL);
  assert.equal(request.params.effort, DEFAULT_EFFORT);
  assert.equal(f.child().messages.find(m => m.method === 'thread/start').params.config.model_reasoning_effort, DEFAULT_EFFORT);
  assert.equal(request.params.input[0].detail, 'original');
  assert.equal(request.params.input[0].type, 'image');
  assert.equal(request.params.sandboxPolicy.type, 'readOnly');
  assert.ok(request.params.outputSchema);
  assert.equal(f.events.some(event => event.type === 'chat-delta'), false, 'Raw structured JSON must not stream into chat');
  await f.bridge.run({ threadId: result.threadId, context: { id: 'p', original: result.result.original }, text: '확인', images: [] });
  assert.equal(f.child().messages.filter(m => m.method === 'thread/start').length, 1);
  assert.equal(f.child().messages.filter(m => m.method === 'thread/resume').length, 0);
});

test('does not substitute a different model or use API-key login for inference', async t => {
  for (const mode of ['no-astra', 'apikey']) {
    const f = fixture((msg, child) => {
      if (mode === 'no-astra' && msg.method === 'model/list') { child.reply(msg.id, { data: [{ model: 'gpt-5.6-sol' }] }); return true; }
      if (mode === 'apikey' && msg.method === 'account/read') { child.reply(msg.id, { account: { type: 'apiKey' } }); return true; }
    });
    t.after(() => f.bridge.close());
    await assert.rejects(f.bridge.run({ context: { id: mode }, text: '인식' }), mode === 'no-astra' ? /gpt-6-astra/ : /로그인/);
    assert.equal(f.child().messages.some(m => m.method === 'turn/start'), false);
  }
});

test('cancels only selected problem, declines approval and rejects incomplete result', async t => {
  const f = fixture((msg, child) => {
    if (msg.method === 'turn/start') { child.reply(msg.id, { turn: { id: 'turn-live' } }); return true; }
    if (msg.method === 'turn/interrupt') { child.reply(msg.id, {}); return true; }
  }); t.after(() => f.bridge.close());
  const promise = f.bridge.run({ context: { id: 'p' }, text: '인식' });
  const rejection = assert.rejects(promise, /취소/);
  while (!f.child()?.messages.some(m => m.method === 'turn/start')) await nextTick();
  await nextTick();
  f.child().send({ id: 'approval-1', method: 'item/commandExecution/requestApproval', params: { command: 'ignored' } });
  await nextTick();
  assert.deepEqual(f.child().messages.find(m => m.id === 'approval-1').result, { decision: 'decline' });
  assert.equal(await f.bridge.cancel('other'), false);
  assert.equal(await f.bridge.cancel('p'), true);
  await rejection;
  assert.equal(f.child().messages.find(m => m.method === 'turn/interrupt').params.turnId, 'turn-live');
  assert.throws(() => validateResult({ reply: 'partial' }), /완성된 문제/);
});

test('disconnect rejects outstanding requests and error text redacts credential-shaped strings', async t => {
  const f = fixture(); t.after(() => f.bridge.close()); await f.bridge.start();
  const promise = f.bridge._request('not-answered'); const rejected = assert.rejects(promise, /종료/);
  f.child().emit('exit', 1); await rejected;
  assert.equal(f.bridge.pending.size, 0);
  assert.equal(f.bridge.startPromise, null);
  const redacted = safeError('Bearer abc.def.ghi sk-1234567890abc eyJaaa.bbb.ccc');
  assert.ok(!redacted.includes('1234567890')); assert.ok(!redacted.includes('abc.def'));
});

test('closing an old transport cannot disconnect a newly started transport', async t => {
  const f = fixture(); t.after(() => f.bridge.close()); await f.bridge.start();
  const previous = f.child();
  f.bridge.close();
  await f.bridge.start();
  previous.emit('exit', 1);
  assert.notEqual(f.bridge.proc, null);
  assert.equal((await f.bridge.getAccount()).account.type, 'chatgpt');
});

test('model/effort selection uses advertised options and conservative missing-metadata handling', () => {
  const catalog = [
    { id: 'picker-astra', model: MODEL, supportedReasoningEfforts: [{ reasoningEffort: 'high' }, { reasoningEffort: 'ultra' }], inputModalities: ['text', 'image'] },
    { id: 'text-only', model: 'text-only', defaultReasoningEffort: 'low', supportedReasoningEfforts: ['low', 'medium'], inputModalities: ['text'] },
    { model: 'older-catalog', defaultReasoningEffort: 'medium' },
    { model: 'missing-catalog' }
  ];
  assert.deepEqual(validateModelSelection(catalog, { model: 'picker-astra', effort: 'ultra', requireImage: true }), { model: MODEL, effort: 'ultra' });
  assert.deepEqual(validateModelSelection(catalog, { model: 'older-catalog', effort: 'medium', requireImage: true }), { model: 'older-catalog', effort: 'medium' });
  assert.deepEqual(validateModelSelection(catalog, { model: 'text-only', effort: 'low' }), { model: 'text-only', effort: 'low' });
  assert.throws(() => validateModelSelection(catalog, { model: 'text-only', effort: 'low', requireImage: true }), /이미지 입력을 지원하지/);
  assert.throws(() => validateModelSelection(catalog, { model: 'older-catalog', effort: 'high' }), /선택 가능한 수준: medium/);
  assert.throws(() => validateModelSelection(catalog, { model: 'missing-catalog', effort: 'high' }), /지원 추론 수준을 확인하지/);
  assert.throws(() => validateModelSelection(catalog, { model: MODEL, effort: 'low' }), /지원하지 않습니다/);
  assert.throws(() => validateModelSelection(catalog, { model: 'missing', effort: 'high' }), /모델을 확인하지/);
  assert.throws(() => validateModelSelection(catalog, { model: MODEL, effort: null }), /올바른 추론/);
});

test('model changes keep live temporary history and reconnect starts a fresh ephemeral thread', async t => {
  const otherModel = 'gpt-5.6-sol'; let turnCount = 0, startCount = 0;
  const f = fixture((msg, child) => {
    if (msg.method === 'model/list') {
      child.reply(msg.id, { data: [MODEL, otherModel].map(model => ({ id: model, model, inputModalities: ['text', 'image'], supportedReasoningEfforts: ['low', 'medium', 'high'], defaultReasoningEffort: 'low' })) }); return true;
    }
    if (msg.method === 'thread/start' || msg.method === 'thread/resume') {
      child.reply(msg.id, { thread: { id: msg.params.threadId || 'temporary-'+(++startCount), ephemeral: true }, model: msg.params.model, reasoningEffort: msg.params.config.model_reasoning_effort }); return true;
    }
    if (msg.method === 'turn/start') {
      const turnId = `selected-turn-${++turnCount}`;
      child.reply(msg.id, { turn: { id: turnId } });
      child.send({ method: 'turn/completed', params: { threadId: msg.params.threadId, turn: { id: turnId, status: 'completed', items: [{ type: 'agentMessage', phase: 'final_answer', text: JSON.stringify(output()) }] } } }); return true;
    }
  });
  t.after(() => f.bridge.close());
  const first = await f.bridge.run({ context: { id: 'p' }, text: 'first' });
  assert.deepEqual([first.model, first.effort], [MODEL, DEFAULT_EFFORT]);
  const second = await f.bridge.run({ context: { id: 'p' }, threadId: first.threadId, text: 'change model', model: otherModel, effort: 'low' });
  assert.equal(second.threadId, first.threadId);
  assert.deepEqual([second.model, second.effort], [otherModel, 'low']);
  assert.equal(f.child().messages.filter(m => m.method === 'thread/start').length, 1);
  assert.equal(f.child().messages.filter(m => m.method === 'thread/resume').length, 0);
  f.bridge.loadedThreads.clear(); // Temporary server state is gone after reconnect.
  const third = await f.bridge.run({ context: { id: 'p' }, threadId: first.threadId, text: 'resume', model: otherModel, effort: 'high' });
  assert.notEqual(third.threadId, first.threadId);
  const resume = f.child().messages.filter(m => m.method === 'thread/start').at(-1);
  assert.equal(resume.params.ephemeral, true);
  assert.equal(f.child().messages.some(m => m.method === 'thread/resume'), false);
  assert.equal(resume.params.model, otherModel);
  assert.equal(resume.params.config.model_reasoning_effort, 'high');
  assert.deepEqual(f.child().messages.filter(m => m.method === 'turn/start').map(m => [m.params.threadId, m.params.model, m.params.effort]), [
    [first.threadId, MODEL, DEFAULT_EFFORT], [first.threadId, otherModel, 'low'], [third.threadId, otherModel, 'high']
  ]);
});

test('unsupported effort or image input is rejected before opening a model turn', async t => {
  for (const mode of ['effort', 'image']) {
    const f = fixture((msg, child) => {
      if (msg.method === 'model/list') {
        child.reply(msg.id, { data: [{ model: 'selected', supportedReasoningEfforts: ['low'], defaultReasoningEffort: 'low', inputModalities: ['text'] }] }); return true;
      }
    });
    t.after(() => f.bridge.close());
    await assert.rejects(f.bridge.run({ context: { id: mode }, text: 'read', model: 'selected', effort: mode === 'effort' ? 'high' : 'low', images: mode === 'image' ? ['data:image/png;base64,AA=='] : [] }), mode === 'effort' ? /추론 수준 'high'을 지원하지/ : /이미지 입력을 지원하지/);
    assert.equal(f.child().messages.some(m => m.method === 'thread/start' || m.method === 'turn/start'), false);
  }
});

test('unexpected server model/effort substitution is rejected instead of reporting requested settings', async t => {
  for (const mode of ['model', 'effort']) {
    const f = fixture((msg, child) => {
      if (msg.method === 'thread/start') {
        child.reply(msg.id, { thread: { id: 'server-mismatch', ephemeral: true }, model: mode === 'model' ? 'different-model' : MODEL, reasoningEffort: mode === 'effort' ? 'low' : 'high' }); return true;
      }
    });
    t.after(() => f.bridge.close());
    await assert.rejects(f.bridge.run({ context: { id: mode }, text: 'read' }), error => /대신/.test(error.message) && error.threadId === 'server-mismatch');
    assert.equal(f.child().messages.some(m => m.method === 'turn/start'), false);
  }
});

test('catalog pagination preserves picker metadata and documented image compatibility', async t => {
  const f = fixture((msg, child) => {
    if (msg.method !== 'model/list') return false;
    child.reply(msg.id, msg.params.cursor ? { data: [{ id: 'b', model: 'b', inputModalities: ['text'], supportedReasoningEfforts: ['low'], defaultReasoningEffort: 'low' }], nextCursor: null } : {
      data: [{ id: 'a', model: 'a', displayName: 'Model A', description: 'For reasoning', defaultReasoningEffort: 'high', supportedReasoningEfforts: [{ reasoningEffort: 'high', description: 'Thorough' }], hidden: false, isDefault: true, unknownSecret: 'never-copy' }], nextCursor: 'page-2'
    }); return true;
  }); t.after(() => f.bridge.close());
  const result = await f.bridge.getAccount();
  assert.equal(result.models.length, 2);
  assert.deepEqual(result.models[0].inputModalities, ['text', 'image']);
  assert.deepEqual(result.models[1].inputModalities, ['text']);
  assert.equal(result.models[0].defaultReasoningEffort, 'high');
  assert.equal(result.models[0].supportedReasoningEfforts[0].description, 'Thorough');
  assert.equal(result.models[0].unknownSecret, undefined);
});
