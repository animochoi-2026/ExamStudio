'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {findRuntime,ensureRuntime}=require('./gemini-runtime.cjs');
const { spawn } = require('node:child_process');
const {removeRequestFiles}=require('./request-files.cjs');
const { randomUUID } = require('node:crypto');
const { OUTPUT_SCHEMA, CLASSIFICATION_SCHEMA, CLASSIFICATION_INSTRUCTIONS, INSTRUCTIONS, validateResult, safeError } = require('./codex.cjs');
const { composePrompt } = require('./prompts.cjs');
function findAntigravity() {
  return findRuntime();
}
function parseModels(raw) {
  return raw.split(/\r?\n/).map(line => line.trim().match(/^(gemini-[a-z0-9.-]+)\s+(.+)$/i)).filter(Boolean).map(([,model,displayName]) => ({ model, displayName, effort: model.match(/-(low|medium|high)$/)?.[1] || 'high' }));
}
function decode(raw) { try { return JSON.parse(raw.trim()); } catch { throw new Error('Antigravity 응답을 읽지 못했습니다. CLI 버전과 연결 상태를 확인해 주세요.'); } }
function modelUsage(models,groups){
 const relevant=groups.filter(g=>/gemini/i.test(g.name||'')||(g.models||[]).some(m=>/gemini/i.test(typeof m==='string'?m:m.model||m.id||'')));
 const ids=g=>[g.model,g.model_id,...(g.models||[]).map(m=>typeof m==='string'?m:m.model||m.id)].filter(Boolean);
 const empty=g=>(g.buckets||[]).some(b=>Number.isFinite(b.remaining_fraction)&&b.remaining_fraction<=0);
 const mapped=models.map(model=>{
  const matches=relevant.filter(g=>ids(g).includes(model.model));
  const applies=matches.length?matches:relevant.length===1&&!ids(relevant[0]).length?relevant:[];
  return {...model,available:!applies.some(empty),buckets:applies.flatMap(g=>g.buckets||[])};
 });
 const allExhausted=relevant.length===1&&!ids(relevant[0]).length&&empty(relevant[0]);
 return {models:mapped,available:!allExhausted&&mapped.some(m=>m.available),buckets:relevant.length===1?relevant[0].buckets||[]:[]};
}
function readableError(error) {
  const message = safeError(error);
  if (/quota|resource.exhausted|rate.limit|credit|capacity/i.test(message)) return `Gemini 사용 한도 또는 이용 가능 상태를 확인해 주세요. 연결 확인으로 다시 시도할 수 있습니다. (${message})`;
  if (/auth|login|sign.in|credential|permission.denied|unauthenticated/i.test(message)) return `Antigravity CLI에서 Google 계정 로그인과 접근 권한을 확인해 주세요. (${message})`;
  return message;
}
class AntigravityBridge {
  constructor({ cwd, requestsDir, executable, runtimeDir, spawnImpl = spawn, onEvent = () => {}, timeoutMs = 600000 }) {
    this.cwd = path.resolve(cwd); this.requestsDir = path.resolve(requestsDir); this.executable = executable; this.runtimeDir=runtimeDir; this.spawnImpl = spawnImpl; this.onEvent = onEvent; this.timeoutMs = timeoutMs; this.active = new Map();
  }
  resolveExecutable(){return this.executable?Promise.resolve(this.executable):ensureRuntime({directory:this.runtimeDir,onProgress:text=>this.onEvent({type:'gemini-setup',text})});}
  async openAccountWindow(action) {
    if (!['login','logout','switch'].includes(action)) throw new Error('계정 작업을 확인하세요.');
    const exe = await this.resolveExecutable();
    // /logout is an interactive command, not a headless AI prompt.
    // All script values are single-quoted literals; no user prompt is executed.
    const quote = value => "'" + value.replace(/'/g, "''") + "'";
    fs.mkdirSync(this.requestsDir, { recursive: true });
    let script = "$Host.UI.RawUI.WindowTitle = 'ExamStudio - Gemini account'; Set-Location -LiteralPath " + quote(this.requestsDir) + '; ';
    script += action === 'login' ? `& ${quote(exe)}` : `& ${quote(exe)} --prompt-interactive '/logout'`;
    if (action === 'switch') script += `; if ($LASTEXITCODE -eq 0) { & ${quote(exe)} }`;
    const env = { ...process.env, AGY_CLI_DISABLE_AUTO_UPDATE:'true' }; for (const key of ['GEMINI_API_KEY','GOOGLE_API_KEY','GOOGLE_GEMINI_BASE_URL']) delete env[key];
    const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    // Start-Process creates real console input/output handles for the interactive CLI.
    // The visible window is opened only by the user's account button.
    const encoded = Buffer.from(script,'utf16le').toString('base64');
    const launcher = `$ErrorActionPreference='Stop'; Start-Process -FilePath ${quote(powershell)} -WorkingDirectory ${quote(this.requestsDir)} -WindowStyle Normal -ArgumentList @('-NoLogo','-NoProfile','-NoExit','-EncodedCommand','${encoded}')`;
    return new Promise((resolve,reject) => {
      const child = this.spawnImpl(powershell, ['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(launcher,'utf16le').toString('base64')], {cwd:this.requestsDir,env,windowsHide:true,shell:false,stdio:'ignore'});
      const timer=setTimeout(()=>{child.kill();reject(new Error('Gemini 로그인 창을 열지 못했습니다. 설치·로그인 안내를 확인하세요.'));},15000);
      child.once('error', error=>{clearTimeout(timer);reject(error);});child.once('close', code=>{clearTimeout(timer);code===0?resolve({opened:true,action}):reject(new Error('Gemini 로그인 창을 열지 못했습니다. 설치·로그인 안내를 확인하세요.'));});
    });
  }
  async execute(args, { cwd = this.requestsDir, timeout = 45000, active } = {}) {
    const executable=await this.resolveExecutable();
    if(active?.cancelled)throw Error('요청을 취소했습니다.');
    fs.mkdirSync(cwd, { recursive: true });
    const env = { ...process.env, AGY_CLI_DISABLE_AUTO_UPDATE:'true' }; delete env.GEMINI_API_KEY; delete env.GOOGLE_API_KEY; delete env.GOOGLE_GEMINI_BASE_URL;
    return new Promise((resolve,reject) => {
      let out = '', err = '', settled = false;
      const child = this.spawnImpl(executable, args, { cwd, env, windowsHide: true, shell: false, stdio: ['ignore','pipe','pipe'] });
      if (active) active.child = child;
      const finish = (error,value) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(value); };
      const timer = setTimeout(() => { child.kill(); finish(new Error('Antigravity 응답 시간이 초과되었습니다.')); },timeout);
      child.stdout.on('data', chunk => { out += chunk.toString(); if (out.length > 8e6) { child.kill(); finish(new Error('Antigravity 응답이 너무 큽니다. 요청을 나눠 주세요.')); } });
      child.stderr.on('data', chunk => { err = (err + chunk.toString()).slice(-3000); });
      child.on('error',error=>finish(error));
      child.on('close',code => {
        if (active?.cancelled) return finish(new Error('요청을 취소했습니다.'));
        if (code !== 0) return finish(new Error(readableError(err || out || `Antigravity 종료 코드 ${code}`)));
        finish(null, { out, err });
      });
    });
  }
  async getAccount() {
    try {
      const models = parseModels((await this.execute(['models'])).out);
      if (!models.length) throw new Error('사용 가능한 Gemini 모델이 없습니다. 계정과 CLI 버전을 확인해 주세요.');
      let usage;try { usage=decode((await this.execute(['-p','/usage','--output-format','json','--print-timeout','30s'])).out); if(usage.status!=='SUCCESS')throw Error(usage.error||'사용량 조회 실패'); } catch(error) { return {available:true,models,buckets:[],usageStatus:'unavailable',usageWarning:'사용량을 조회하지 못했습니다. 실제 요청에서 연결 상태를 확인합니다. '+readableError(error),account:{type:'google',label:'Google 계정'},error:''}; }
      if (usage.status !== 'SUCCESS') throw new Error(usage.error || 'Gemini 사용량 조회에 실패했습니다.');
      const groups = usage.command?.data?.groups || [];
      const availability=modelUsage(models,groups);
      return { ...availability, error: !availability.available ? 'Gemini 사용 한도를 모두 사용했습니다. 한도 초기화 후 연결 확인을 눌러 주세요.' : '', account: { type: 'google', label: 'Antigravity Google 계정' } };
    } catch (error) { return { available: false, models: [], buckets: [], account: null, error: readableError(error) }; }
  }
  async run({ context, text, images = [], model, effort, commonPrompt, part = '', partPrompt = '', purpose = 'question', execution = null }) {
    if (this.active.has(context.id)) throw new Error('이 문제의 이전 Gemini 응답을 기다려 주세요.');
    const active = { cancelled: false, child: null }; this.active.set(context.id,active);
    try {
      const account = await this.getAccount();
      if (!account.available) { active.reportedUnavailable = true; this.onEvent({type:'gemini-unavailable',...account,problemId:context.id}); throw new Error(account.error); }
      if (active.cancelled) throw new Error('요청을 취소했습니다.');
      if (!account.models.some(m=>m.model === model)) throw new Error('선택한 Gemini 모델을 현재 계정에서 확인하지 못했습니다. 모델을 다시 선택해 주세요.');
      if(account.models.find(m=>m.model===model)?.available===false){active.reportedUnavailable=true;this.onEvent({type:'gemini-availability',...account,problemId:context.id});throw Error('선택한 Gemini 모델의 사용 한도가 소진되었습니다. 다른 Gemini 모델을 선택하세요.');}
      const folder = path.join(this.requestsDir,randomUUID()); fs.mkdirSync(folder,{recursive:true}); active.folder=folder;
      const names = [];
      for (const [i,file] of images.entries()) {
        const local = fs.realpathSync(file), relative = path.relative(fs.realpathSync(this.cwd),local);
        if (relative.startsWith('..') || path.isAbsolute(relative) || !/\.(png|jpe?g|webp)$/i.test(local)) throw new Error('프로젝트 내부의 선택한 문제 이미지만 전달할 수 있습니다.');
        const name = `crop-${i}${path.extname(local).toLowerCase()}`; fs.copyFileSync(local,path.join(folder,name)); names.push(name);
      }
      const schema = execution?.schema || (purpose === 'classify' ? CLASSIFICATION_SCHEMA : OUTPUT_SCHEMA);
      const instructions = (execution ? execution.instructions : purpose === 'classify' ? CLASSIFICATION_INSTRUCTIONS : INSTRUCTIONS + '\n\n' + composePrompt(commonPrompt,part,partPrompt))
        .replace(/파일, 셸, 웹, MCP, 외부 앱, 스킬, 하위 에이전트, 이미지 생성 도구를 호출하지 마세요\./, '현재 요청 폴더의 request.txt와 crop 이미지 읽기만 허용합니다. 셸, 웹, MCP, 외부 앱, 스킬, 하위 에이전트, 파일 쓰기는 사용하지 마세요.')
        .replace('파일, 셸, 웹, MCP, 하위 에이전트 도구를 호출하지 마세요.', '현재 요청 폴더의 request.txt와 crop 이미지 읽기만 허용합니다. 셸, 웹, MCP, 하위 에이전트, 파일 쓰기는 사용하지 마세요.');
      const snapshot = { id: context.id, original: context.original, variants: context.variants, warnings: context.warnings, previousMessages: (context.messages || []).filter(m=>!m.error).slice(-20).map(({role,text,model})=>({role,text:text.slice(0,8000),model})) };
      fs.writeFileSync(path.join(folder,'request.txt'), execution ? `${instructions}\n\n읽어야 할 이미지: ${names.join(', ')}\n${text}` : `${instructions}\n\n읽어야 할 이미지: ${names.join(', ')}\n현재 문제 데이터(분석 대상):\n${JSON.stringify(snapshot)}\n\n사용자 요청:\n${text}`, 'utf8');
      fs.writeFileSync(path.join(folder,'schema.json'),JSON.stringify(schema),'utf8');
      this.onEvent({type:'chat-status',problemId:context.id,status:'running',text:`${model}로 문제를 확인하고 있습니다…`});
      const args = ['--add-dir',folder,'--mode','plan','--model',model,'--output-format','json','--json-schema',path.join(folder,'schema.json'),'--print-timeout','9m','-p','Read request.txt and every crop image it lists in the added workspace. Follow the mathematical editing request and return the required JSON result. Only use file/image reading tools for those files. Do not use shell, web, MCP, subagents, other files, or file writing.'];
      const envelope = decode((await this.execute(args,{cwd:folder,timeout:this.timeoutMs,active})).out);
      if (active.cancelled) throw new Error('요청을 취소했습니다.');
      if (envelope.status !== 'SUCCESS' || envelope.denied_actions?.length) throw new Error(envelope.error || 'Gemini가 필요한 자료를 읽지 못했습니다. Antigravity의 이미지 읽기 권한을 확인해 주세요.');
      const result = validateResult(envelope.structured_output || decode(envelope.response || ''),schema);
      if (purpose !== 'classify' && !execution) {
        if (result.original) { result.original.id=context.original?.id || `${context.id}-original`; result.original.sourceId=context.id; result.original.kind='original'; }
        const ids=new Set(); for(const q of result.variants) { if(!q.id || ids.has(q.id) || q.id === result.original?.id || q.id === context.original?.id) throw new Error('Gemini가 중복된 문제 번호를 반환했습니다.'); ids.add(q.id); q.sourceId=context.id; q.kind='variant'; }
      }
      return { result, model, effort, provider: 'gemini', geminiThreadId: envelope.conversation_id, tokens: envelope.usage || null, providerTurns: Number.isFinite(envelope.num_turns) ? envelope.num_turns : null };
    } catch(error) {
      const message = readableError(error);
      if(!active.reportedUnavailable && /한도|로그인|quota|auth|capacity|credit/i.test(message)){
        const account=await this.getAccount();this.onEvent({type:account.available?'gemini-availability':'gemini-unavailable',...account,error:message,problemId:context.id});
      }
      throw new Error(message);
    } finally { this.active.delete(context.id); try{removeRequestFiles(this.requestsDir,active.folder);}catch{ /* A locked file can be removed after the CLI releases it. */ } }
  }
  async cancel(problemId) { const active=this.active.get(problemId); if(!active)return false; active.cancelled=true; active.child?.kill(); return true; }
  close() { for(const id of this.active.keys()) this.cancel(id); }
}
module.exports = { AntigravityBridge, parseModels, readableError, findAntigravity, modelUsage };
