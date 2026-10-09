'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {StringDecoder}=require('node:string_decoder');
const {ensureRuntime}=require('./claude-runtime.cjs');
const {validateResult,safeError,OUTPUT_SCHEMA,CLASSIFICATION_SCHEMA,INSTRUCTIONS,CLASSIFICATION_INSTRUCTIONS}=require('./codex.cjs');
const {composePrompt}=require('./prompts.cjs');
const MODELS=['sonnet','opus'].map(model=>({model,displayName:'Claude '+(model==='sonnet'?'Sonnet':'Opus'),inputModalities:['text','image'],defaultReasoningEffort:'medium',supportedReasoningEfforts:['low','medium','high'].map(reasoningEffort=>({reasoningEffort}))}));
function selection(value){if(!MODELS.some(m=>m.model===value?.model)||!['low','medium','high'].includes(value?.effort))throw Error('Claude 모델과 추론 수준을 선택하세요.');return {model:value.model,effort:value.effort};}
function environment(base=process.env){const env={...base,DISABLE_AUTOUPDATER:'1',CLAUDE_CODE_SKIP_PROMPT_HISTORY:'1'};for(const key of Object.keys(env))if(/^(ANTHROPIC_|CLAUDE_CODE_(?:OAUTH_TOKEN|USE_BEDROCK|USE_VERTEX|USE_FOUNDRY)|CLAUDE_CONFIG_DIR$)/.test(key))delete env[key];return env;}
function parseJson(text){try{return JSON.parse(text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}catch{throw Error('Claude 응답 형식을 읽지 못했습니다. 다시 시도해 주세요.');}}
function resultEnvelope(raw){const messages=raw.trim().split(/\r?\n/).filter(Boolean).map(parseJson);const result=messages.findLast(m=>m.type==='result');if(!result)throw Error('Claude 최종 응답이 없습니다. 연결 상태를 확인하세요.');if(result.is_error||result.subtype!=='success')throw Error(safeError(result.errors?.join('\n')||result.result||'Claude 요청을 완료하지 못했습니다. 로그인·사용 한도를 확인하세요.'));return result;}
function executionError(out,err){try{resultEnvelope(out);}catch(e){if(!/최종 응답이 없습니다|응답 형식/.test(e.message))return e;}return Error(safeError(err||'Claude 실행에 실패했습니다. 로그인·사용 한도와 연결 상태를 확인하세요.'));}
class ClaudeBridge{
 constructor({cwd,requestsDir,runtimeDir,executable,spawnImpl=spawn,onEvent=()=>{},timeoutMs=600000}){Object.assign(this,{cwd:path.resolve(cwd),requestsDir:path.resolve(requestsDir),runtimeDir,executable,spawnImpl,onEvent,timeoutMs});this.active=new Map();}
 resolveExecutable(){return this.executable?Promise.resolve(this.executable):ensureRuntime({directory:this.runtimeDir,onProgress:text=>this.onEvent({type:'claude-setup',text})});}
 async execute(args,{input='',active,timeout=45000,allowLoggedOut=false}={}){
  const exe=await this.resolveExecutable();if(active?.cancelled)throw Error('요청을 취소했습니다.');fs.mkdirSync(this.requestsDir,{recursive:true});
  return new Promise((resolve,reject)=>{
   let out='',err='',done=false;const decode=new StringDecoder('utf8');
   const child=this.spawnImpl(exe,args,{cwd:this.requestsDir,env:environment(),windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});if(active)active.child=child;
   const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(value);};
   const timer=setTimeout(()=>{child.kill();finish(Error('Claude 응답 시간이 초과되었습니다.'));},timeout);
   child.stdout.on('data',b=>{out+=decode.write(b);if(out.length>16e6){child.kill();finish(Error('Claude 응답이 너무 큽니다.'));}});
   child.stderr.on('data',b=>{err=(err+b.toString()).slice(-3000);});
   child.once('error',e=>finish(e));child.stdin.on('error',e=>{if(e.code!=='EPIPE')finish(e);});
   child.once('close',code=>{out+=decode.end();if(active?.cancelled)return finish(Error('요청을 취소했습니다.'));if(code!==0&&!(allowLoggedOut&&code===1))return finish(executionError(out,err));finish(null,out);});
   child.stdin.end(input);
  });
 }
 async getAccount({active}={}){try{const data=parseJson(await this.execute(['auth','status'],{allowLoggedOut:true,active}));const available=data.loggedIn===true&&data.authMethod==='claude.ai';return {available,models:MODELS,account:available?{type:'claude',label:'Claude 계정'}:null,error:available?'':'Claude 구독 계정으로 로그인해 주세요. API 키로 자동 전환하지 않습니다.'};}catch(e){return {available:false,models:MODELS,account:null,error:safeError(e)};}}
 async openAccountWindow(action){
  if(!['login','logout','switch'].includes(action))throw Error('계정 작업을 확인하세요.');
  if(action!=='login')await this.execute(['auth','logout']);if(action==='logout')return {opened:false,action,message:'Claude에서 로그아웃했습니다.'};
  const exe=await this.resolveExecutable(),quote=s=>"'"+s.replace(/'/g,"''")+"'";fs.mkdirSync(this.requestsDir,{recursive:true});
  const ps=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
  const script=`$Host.UI.RawUI.WindowTitle='ExamStudio - Claude account'; Set-Location -LiteralPath ${quote(this.requestsDir)}; & ${quote(exe)} auth login`;
  // A visible account console is requested explicitly by the login button.
  const launch=`$ErrorActionPreference='Stop'; Start-Process -FilePath ${quote(ps)} -WorkingDirectory ${quote(this.requestsDir)} -WindowStyle Normal -ArgumentList @('-NoLogo','-NoProfile','-NoExit','-EncodedCommand','${Buffer.from(script,'utf16le').toString('base64')}')`;
  await new Promise((resolve,reject)=>{const child=this.spawnImpl(ps,['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(launch,'utf16le').toString('base64')],{cwd:this.requestsDir,env:environment(),windowsHide:true,shell:false,stdio:'ignore'});const timer=setTimeout(()=>{child.kill();reject(Error('Claude 로그인 창을 열지 못했습니다.'));},15000);child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('close',code=>{clearTimeout(timer);code===0?resolve():reject(Error('Claude 로그인 창을 열지 못했습니다.'));});});
  return {opened:true,action};
 }
 async run({context,text,images=[],model,effort,execution,purpose='question',commonPrompt,part='',partPrompt=''}){
  selection({model,effort});if(this.active.has(context.id))throw Error('이 문제의 이전 Claude 응답을 기다려 주세요.');const active={cancelled:false};this.active.set(context.id,active);
  try{
   const account=await this.getAccount({active});if(active.cancelled)throw Error('요청을 취소했습니다.');if(!account.available)throw Error(account.error);
   const schema=execution?.schema||(purpose==='classify'?CLASSIFICATION_SCHEMA:OUTPUT_SCHEMA);
   const instructions=execution?.instructions||(purpose==='classify'?CLASSIFICATION_INSTRUCTIONS:INSTRUCTIONS+'\n'+composePrompt(commonPrompt,part,partPrompt));
   const content=[{type:'text',text:instructions+'\n\n응답은 다음 JSON Schema를 만족하는 JSON 객체 하나만 작성하세요. 코드 울타리나 부연 설명은 넣지 마세요.\n'+JSON.stringify(schema)+'\n\n'+(!execution?'현재 문제 데이터(분석 대상):\n'+JSON.stringify({original:context.original,variants:context.variants,messages:(context.messages||[]).filter(m=>!m.error).slice(-20)})+'\n':'')+'사용자 요청:\n'+text}];
   for(const file of images){const real=fs.realpathSync(file),rel=path.relative(fs.realpathSync(this.cwd),real);if(rel.startsWith('..')||path.isAbsolute(rel)||!/\.(png|jpe?g|webp)$/i.test(real))throw Error('프로젝트 내부의 선택한 문제 이미지만 전달할 수 있습니다.');if(fs.statSync(real).size>5*1024*1024)throw Error('Claude에 보낼 문제 이미지가 5MB를 넘습니다. 영역을 줄여 주세요.');content.push({type:'image',source:{type:'base64',media_type:/\.png$/i.test(real)?'image/png':/\.webp$/i.test(real)?'image/webp':'image/jpeg',data:fs.readFileSync(real).toString('base64')}});}
   this.onEvent({type:'chat-status',problemId:context.id,status:'running',text:`Claude ${model}로 문제를 확인하고 있습니다…`});
   const args=['-p','--input-format','stream-json','--output-format','stream-json','--verbose','--no-session-persistence','--safe-mode','--disable-slash-commands','--setting-sources','','--tools','','--strict-mcp-config','--mcp-config','{"mcpServers":{}}','--model',model,'--effort',effort];
   const envelope=resultEnvelope(await this.execute(args,{active,timeout:this.timeoutMs,input:JSON.stringify({type:'user',message:{role:'user',content},parent_tool_use_id:null})+'\n'}));
   const result=validateResult(envelope.structured_output||parseJson(envelope.result||''),schema);
   if(!execution&&purpose!=='classify'){if(result.original)Object.assign(result.original,{id:context.original?.id||context.id+'-original',sourceId:context.id,kind:'original'});const ids=new Set();for(const q of result.variants){if(!q.id||ids.has(q.id)||q.id===result.original?.id||q.id===context.original?.id)throw Error('Claude가 중복된 문제 번호를 반환했습니다.');ids.add(q.id);Object.assign(q,{sourceId:context.id,kind:'variant'});}}
   return {result,model,effort,provider:'claude',tokens:envelope.usage||null,providerTurns:envelope.num_turns??null};
  }finally{this.active.delete(context.id);}
 }
 async cancel(id){const active=this.active.get(id);if(!active)return false;active.cancelled=true;active.child?.kill();return true;}
 close(){for(const id of this.active.keys())this.cancel(id);}
}
module.exports={ClaudeBridge,MODELS,selection,environment,parseJson,resultEnvelope};
