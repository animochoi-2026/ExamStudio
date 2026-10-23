const test=require('node:test'),assert=require('node:assert/strict');
test('translated database timeout retains retry eligibility, permissions and query cancellation do not',async()=>{
 const {isTransientPreparationError,retryTransientPreview}=await import('../web-bank/preview-wait.js'),{errorText}=require('../web-bank/request-errors.cjs');
 const raw={message:'canceling statement due to statement timeout',code:'57014'};
 const translated=Object.assign(Error(errorText(raw)),{code:raw.code,originalMessage:raw.message});let calls=0;
 assert.equal(await retryTransientPreview({ready:()=>false,layoutError:()=>translated,render:async()=>calls++}),true);assert.equal(calls,1);
 for(const e of [{...translated,code:'42501'},{code:'57014',originalMessage:'canceling statement due to user request'},{status:403,message:'Failed to fetch'},{name:'AbortError',code:'57014',originalMessage:raw.message}])assert.equal(isTransientPreparationError(e),false);
 assert.equal(isTransientPreparationError({status:503,message:'서버 오류'}),true);
});
test('preview waits explain stalled resources and accept a later independent retry',async()=>{
 const {previewWait}=await import('../web-bank/preview-wait.js'),c=new AbortController(),wait=previewWait(c.signal,{timeoutMs:15});
 await assert.rejects(wait(new Promise(()=>{}),'폼 로고'),/폼 로고 응답이 지연.*배치 다시 시도/);
 assert.equal(await wait(Promise.resolve('ready')),'ready');
});
test('superseded preview wait cancels promptly and ignores a late result',async()=>{
 const {previewWait}=await import('../web-bank/preview-wait.js'),c=new AbortController();let release;
 const p=previewWait(c.signal)(new Promise(r=>release=r),'글꼴');c.abort();await assert.rejects(p,{name:'AbortError'});release('late');
 await assert.rejects(previewWait(c.signal)(Promise.resolve('ready')),{name:'AbortError'});
});
test('resource errors are preserved rather than treated as a usable layout',async()=>{
 const {previewWait}=await import('../web-bank/preview-wait.js');
 await assert.rejects(previewWait(new AbortController().signal)(Promise.reject(Error('image unavailable'))),/image unavailable/);
});
test('mock preparation retries transient failures once with the same editor and options',async()=>{
 const {retryTransientPreview}=await import('../web-bank/preview-wait.js');
 for(const error of [new TypeError('Failed to fetch'),Object.assign(Error('세트 정보 지연'),{code:'PREVIEW_RESOURCE_TIMEOUT'}),new DOMException('decode failed','EncodingError')]){
  const calls=[],paper={items:['same-question']},signal=new AbortController().signal;
  const handle={ready:()=>false,layoutError:()=>error,render:async options=>{calls.push(options);assert.deepEqual(paper.items,['same-question']);}};
  assert.equal(await retryTransientPreview(handle,{signal,sortAutomatic:true}),true);
  assert.equal(calls.length,1);assert.equal(calls[0].signal,signal);assert.equal(calls[0].sortAutomatic,true);assert.equal(calls[0].persistLayout,false);
 }
});
test('mock preparation keeps structural failures, overflow, permissions and cancellation blocked',async()=>{
 const {retryTransientPreview}=await import('../web-bank/preview-wait.js');let calls=0;
 for(const error of [Error('파일 참조 무결성 불일치'),Error('그림이 누락되었습니다.'),Error('permission denied'),Error('세트 구성 확인이 필요합니다.'),new DOMException('cancel','AbortError'),null]){
  assert.equal(await retryTransientPreview({ready:()=>false,layoutError:()=>error,render:async()=>calls++}),false);
 }
 const abort=new AbortController();abort.abort();
 assert.equal(await retryTransientPreview({ready:()=>false,layoutError:()=>new TypeError('Failed to fetch'),render:async()=>calls++},{signal:abort.signal}),false);
 assert.equal(calls,0);
});
