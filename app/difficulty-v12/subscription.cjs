'use strict';
// Trusted LOCAL pilot only. Never deploy the user's Codex login to a server.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn,spawnSync}=require('node:child_process');
const I=require('./input.cjs'),S=require('./schema.cjs');
const settings=Object.freeze({provider:'codex-chatgpt-subscription',model:'gpt-6.1-sol',effort:'high',adapter:2,automaticRetries:0});
const evaluationVersion=I.hash({base:I.evaluationVersion,settings});
function profile(id='legacy'){const p=require('./scoring-profiles.cjs').get(id);return {...p,evaluationVersion:id==='legacy'?evaluationVersion:I.hash({base:evaluationVersion,profile:id,promptHash:p.promptHash,scorerVersion:p.scorerVersion})};}
function cleanEnv(env=process.env){return Object.fromEntries(Object.entries(env).filter(([k])=>!/(API_KEY|ACCESS_TOKEN|AUTH_TOKEN|SERVICE_ROLE|R2_SECRET|^OPENAI_|^CHATGPT_BASE_URL$)/i.test(k)));}
function verifyInput(p){
 if(!p?.payload||!p.images?.length)throw Error('원문과 이미지가 필요합니다.');
 const q=p.payload,reconstructed=I.input({question:q.question,scope:q.curriculum_scope,scopeContext:q.scope_context,restrictions:q.solution_restrictions,images:p.images,target:q.target_question});
 if(reconstructed.contentHash!==p.contentHash||reconstructed.inputVersion!==p.inputVersion)throw Error('입력 버전/해시 불일치');
 return p;
}
function validatePilot(entries){
 if(!Array.isArray(entries)||entries.length!==30)throw Error('은행 22개와 외부 V1–V8 전체 입력 30개가 필요합니다.');
 const bank=entries.filter(e=>e.questionId),ext=entries.filter(e=>!e.questionId);
 if(bank.length!==22||new Set(bank.map(e=>e.questionId)).size!==22||ext.length!==8||!Array.from({length:8},(_,i)=>'V'+(i+1)).every(id=>ext.some(e=>e.id===id)))throw Error('파일럿 대상이 일치하지 않습니다.');
 if(new Set(entries.map(e=>e.id)).size!==30)throw Error('중복 작업 ID');
 for(const e of entries)verifyInput(e.input);
 return I.hash(entries.map(e=>({id:e.id,questionId:e.questionId||null,revisionId:e.revisionId||null,reviewVersion:e.reviewVersion??null,inputVersion:e.input.inputVersion})));
}
function argsFor({cwd,schemaFile,outputFile,images}){
 return ['exec','--ignore-user-config','--skip-git-repo-check','--ephemeral','--json','--color','never','--sandbox','read-only','--cd',cwd,'--model',settings.model,
 '-c','model_provider="openai"','-c','forced_login_method="chatgpt"','-c','model_reasoning_effort="high"','-c','web_search="disabled"','-c','features.shell_tool=false','-c','features.remote_plugin=false','-c','project_doc_max_bytes=0',
 '--output-schema',schemaFile,'--output-last-message',outputFile,...images.flatMap(p=>['--image',p]),'-'];
}
function promptFor(prepared,scoringProfile='legacy'){return profile(scoringProfile).instructions+'\n\n평가 대상 원문 JSON:\n'+JSON.stringify(prepared.payload);}
function assertSubscription(executable='codex'){
 const r=spawnSync(executable,['login','status'],{encoding:'utf8',windowsHide:true,env:cleanEnv(),timeout:15000});
 if(r.status!==0||!/Logged in using ChatGPT/i.test((r.stdout||'')+(r.stderr||'')))throw Error('Codex ChatGPT 구독 로그인이 확인되지 않아 실행을 중단합니다. API로 전환하지 않습니다.');
}
async function runOne(entry,{executable='codex',outputRoot,launch=spawn,timeoutMs=15*60*1000,scoringProfile='legacy'}){
 verifyInput(entry.input);
 const selected=profile(scoringProfile),evaluationVersion=selected.evaluationVersion;
 const key=I.hash({inputVersion:entry.input.inputVersion,evaluationVersion});
 const folder=path.resolve(outputRoot,key);fs.mkdirSync(folder,{recursive:true});
 const resultFile=path.join(folder,'result.json'),intentFile=path.join(folder,'intent.json');
 if(fs.existsSync(resultFile))return JSON.parse(fs.readFileSync(resultFile,'utf8'));
 // Exclusive create protects two local runners. An interrupted/unknown run is never replayed.
 const intent={key,id:entry.id,inputVersion:entry.input.inputVersion,evaluationVersion,settings,scoringProfile,promptHash:selected.promptHash,scorerVersion:selected.scorerVersion,startedAt:new Date().toISOString()};
 fs.writeFileSync(intentFile,JSON.stringify(intent,null,2),{flag:'wx'});
 const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'examstudio-v12-'));
 const schemaFile=path.join(cwd,'schema.json'),outputFile=path.join(cwd,'response.json');
 fs.writeFileSync(schemaFile,JSON.stringify(S.schema));
 const images=entry.input.images.map((img,i)=>{
  const m=/^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(img.dataUrl);
  if(!m)throw Error('원문 이미지 바이트 누락');
  const file=path.join(cwd,'source-'+i+'.'+m[1]);fs.writeFileSync(file,Buffer.from(m[2],'base64'));return file;
 });
 const child=launch(executable,argsFor({cwd,schemaFile,outputFile,images}),{cwd,env:cleanEnv(),windowsHide:true,stdio:['pipe','pipe','pipe']});
 const evidence={threadId:null,usage:null,completed:false,failed:false,exitCode:null,diagnostic:null};let pending='',timedOut=false,diagnostic='';
 const parse=line=>{try{const e=JSON.parse(line);if(e.type==='thread.started')evidence.threadId=e.thread_id;if(e.type==='turn.completed'){evidence.completed=true;evidence.usage=e.usage;}if(e.type==='turn.failed'||e.type==='error')evidence.failed=true;}catch{}};
 child.stdout.on('data',b=>{pending+=b.toString();let n;while((n=pending.indexOf('\n'))>=0){parse(pending.slice(0,n));pending=pending.slice(n+1);}});
 child.stderr.on('data',b=>{diagnostic=(diagnostic+b.toString()).slice(-6000);});
 child.stdin.on('error',()=>{});child.stdin.end(promptFor(entry.input,scoringProfile));
 const timer=setTimeout(()=>{timedOut=true;child.kill();},timeoutMs);
 const exitCode=await new Promise(resolve=>{child.once('error',e=>{diagnostic+=' process '+e.code;resolve(-1);});child.once('close',resolve);});clearTimeout(timer);if(pending.trim())parse(pending);
 evidence.exitCode=exitCode;
 if(exitCode!==0)evidence.diagnostic=diagnostic.replace(/https?:\/\/[^\s]+/g,'[URL]').replace(/Bearer\s+\S+|sk-[\w-]+|eyJ[\w.-]+/g,'[REDACTED]').slice(-2000);
 let result={...intent,finishedAt:new Date().toISOString(),evidence,status:'failed',raw:null,computed:{status:'failed',score:null,reason:timedOut?'outcome_unknown_timeout':'subscription_execution_failed'}};
 if(exitCode===0&&evidence.completed&&!evidence.failed&&fs.existsSync(outputFile)){
  try{const evaluated=selected.evaluate(JSON.parse(fs.readFileSync(outputFile,'utf8')));result={...result,...evaluated,status:evaluated.computed.status==='failed'?'failed':'complete'};}catch{result.computed.reason='invalid_response';}
 }
 fs.writeFileSync(resultFile+'.tmp',JSON.stringify(result,null,2));fs.renameSync(resultFile+'.tmp',resultFile);
 // Remove only explicitly created input/output files; no recursive deletion or auth copying.
 for(const file of [...images,schemaFile,outputFile])if(fs.existsSync(file))fs.unlinkSync(file);fs.rmdirSync(cwd);
 return result;
}
module.exports={profile,settings,evaluationVersion,cleanEnv,verifyInput,validatePilot,argsFor,promptFor,assertSubscription,runOne};
