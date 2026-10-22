'use strict';
// Transport only. Criteria, schema, routing and scoring belong to the canonical
// evaluator. Never load solution-model settings or fall back to a paid API.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process');
const Sub=require('../difficulty-v12/subscription.cjs'),Prompt=require('./explicit.cjs'),C=require('./canonical.cjs'),Output=require('../difficulty-output-policy.cjs');
function provider({artifactRoot,executable,launch=spawn,timeoutMs=15*60*1000,subscriptionVerified=false}){
 return async request=>{
  if(launch===spawn)require('./test-boundary.cjs').assertLiveTransportAllowed();
  const exe=executable||require('../codex.cjs').findCodex();if(!subscriptionVerified)Sub.assertSubscription(exe);
  if(!/^[a-f0-9]{64}$/.test(request.request_id)||request.request_id!==request.idempotency_key)throw Error('stage identity required');
  const folder=path.join(artifactRoot,request.request_id);fs.mkdirSync(folder,{recursive:true});
  require('./response-contract.cjs').verify(request.request_envelope,request.prepared.payload,request.request_id);
  const rendered=Prompt.render(request.prepared),started=new Date().toISOString(),start=Date.now();
  fs.writeFileSync(path.join(folder,'intent.json'),C.json({...Output.metadata,request_envelope:request.request_envelope,stage_request_id:request.request_id,model:request.model,effort:request.effort,started_at:started,rendered_payload_hash:rendered.rendered_payload_hash,compact_manifest_hash:rendered.compact_manifest_hash}),{flag:'wx'});
  fs.writeFileSync(path.join(folder,'rendered-payload.txt'),rendered.text,{flag:'wx'});
  const schemaFile=path.join(folder,'schema.json'),outputFile=path.join(folder,'raw-response.json');
  fs.writeFileSync(schemaFile,C.json(request.schema),{flag:'wx'});
  const images=request.prepared.images.map((image,i)=>{
   const match=/^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(image.dataUrl||'');
   if(!match)throw Error('image bytes missing');
   const bytes=Buffer.from(match[2],'base64');if(C.bytesHash(bytes)!==image.sha256)throw Error('image hash mismatch');
   const file=path.join(folder,'source-'+i+'.'+match[1]);fs.writeFileSync(file,bytes,{flag:'wx'});return file;
  });
  const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'difficulty-v122-'));
  const args=Sub.argsFor({cwd,schemaFile,outputFile,images,executionProfile:request.stage===1?'luna-medium':request.stage===2?'sol-medium':'sol-high'});
  const evidence={completed:false,usage:null,exitCode:null,errors:[]};let pending='',timeout=false;
  const child=launch(exe,args,{cwd,env:Sub.cleanEnv(),windowsHide:true,stdio:['pipe','pipe','pipe']});
  const parse=line=>{try{const e=JSON.parse(line);if(e.type==='turn.completed'){evidence.completed=true;evidence.usage=e.usage;}
   if(['turn.failed','error'].includes(e.type))evidence.errors.push({type:e.type,message:require('../difficulty-v121/failures.cjs').redact(JSON.stringify(e.error||e.message))});}catch{}};
  child.stdout.on('data',b=>{pending+=b.toString();let n;while((n=pending.indexOf('\n'))>=0){parse(pending.slice(0,n));pending=pending.slice(n+1);}});
  child.stderr.on('data',()=>{}); // Raw transport stderr may contain secrets.
  child.stdin.on('error',()=>{});child.stdin.end(rendered.text);
  const timer=setTimeout(()=>{timeout=true;child.kill();},timeoutMs);
  const exit=await new Promise(resolve=>{child.once('error',()=>resolve(-1));child.once('close',resolve);});
  clearTimeout(timer);if(pending.trim())parse(pending);evidence.exitCode=exit;
  const call={contract_profile:'explicit-relations',request_binding_hash:request.request_envelope.envelope_hash,model:request.model,effort:request.effort,request_id:request.request_id,started_at:started,completed_at:new Date().toISOString(),latency_ms:Date.now()-start,evidence,usage:evidence.usage,raw:null,status:'unresolved',reason:timeout?'outcome_unknown_timeout':'result_unknown'};
  if(!timeout&&exit===0&&evidence.completed&&!evidence.errors.some(e=>e.type==='turn.failed')&&fs.existsSync(outputFile)){
   try{call.raw=JSON.parse(fs.readFileSync(outputFile,'utf8'));call.status='complete';call.reason=null;}
   catch{call.status='failed';call.reason='invalid_response';}
  }else if(!timeout&&!fs.existsSync(outputFile)&&require('./validate.cjs').confirmedFailure({raw:null,computed:{reason:'subscription_execution_failed'},evidence})){
   call.status='failed';call.reason='subscription_execution_failed';
  }
  Object.assign(call,Output.metadata,{finish_reason:evidence.completed?'completed':Output.outputLimit(call)?'max_output_tokens':call.reason,usage_status:evidence.usage?'reported':'not_reported',response_bytes:fs.existsSync(outputFile)?fs.statSync(outputFile).size:0,raw_response_exists:call.raw!==null,raw_response_hash:call.raw?C.hash(call.raw):null,truncated:Output.outputLimit(call),exit_code:exit});
  fs.writeFileSync(path.join(folder,'transport-result.json'),C.json(call),{flag:'wx'});
  try{fs.rmdirSync(cwd);}catch{}
  return call;
 };
}
module.exports={provider};
