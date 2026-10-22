'use strict';
const C=require('./canonical.cjs'),K=require('./contracts.cjs'),Policy=require('./policy.cjs'),Prompt=require('../difficulty-v123/profiles.cjs'),Output=require('../difficulty-output-policy.cjs');
const versions=require('./transport-versions.cjs').versions;
// Durable ledger is the existing leased staging item, not an isolate cache or
// /tmp. No new table/migration and no production score write are introduced.
function createRuntime({claimed,db,fetchImpl,apiKey,readCurrent}){
 const {lease,job,item}=claimed;
 let expected=job.version,calls=job.calls;
 const state=JSON.parse(JSON.stringify(item.state||{}));
 state.canonical=state.canonical||{intents:{},stages:{},finals:{},requests:{}};
 const data=state.canonical,startedHere=new Set();
 const keyCheck=k=>{if(!/^[a-f0-9]{64}$/.test(k))throw Error('invalid_ledger_key');};
 async function save(){
  await db('checkpoint',job.id,{lease,expected,id:item.id,state,calls,retries:job.retries,status:'running'});
  expected++;
 }
 const store={
  yieldAfterStage:true,
  get:async k=>{keyCheck(k);return data.finals[k]||null;},
  getStage:async k=>{keyCheck(k);return data.stages[k]||null;},
  claim:async(k,intent)=>{
   keyCheck(k);if(data.intents[k])return false;
   data.intents[k]=intent;state.status='processing';await save();startedHere.add(k);return true;
  },
  canResume:async k=>{
   const intent=data.intents[k];if(!intent)return false;
   if(intent.stage_request_id)return Boolean(data.requests[k]?.response_id);
   // Evaluation may traverse stored stages, but a stage intent with no receipt
   // remains blocked below. The DB lease serializes all concurrent requests.
   return true;
  },
  stage:async(k,value)=>{
   K.verifyEnvelope(value);if(data.stages[k])throw Error('immutable_stage_exists');
   data.stages[k]=value;await save();
  },
  finish:async(k,value)=>{
   K.verifyEnvelope(value);if(data.finals[k]&&C.hash(data.finals[k])!==C.hash(value))throw Error('immutable_final_exists');
   data.finals[k]=value;state.result=value;state.status=value.status==='unresolved'?'result_unknown':value.status;await save();
  },
 };
 async function runStage(req){
  require('./response-contract.cjs').verify(req.request_envelope,req.prepared.payload,req.request_id);
  const id=req.idempotency_key,binding=Policy.stages[req.stage-1],rendered=Prompt.render(req.prepared);
  let record=data.requests[id],response;
  const headers={authorization:'Bearer '+apiKey,'content-type':'application/json','Idempotency-Key':id};
  if(!record){
   if(!startedHere.has(id))return {status:'unresolved',reason:'result_unknown',raw:null};
   if(calls>=job.approval.maxCalls)throw Error('approved_call_budget_exhausted');
   calls++;
   record=data.requests[id]={request_envelope:req.request_envelope,started_at:new Date().toISOString(),model:binding.model,effort:binding.effort,
    rendered_payload_hash:rendered.rendered_payload_hash,status:'submitting',idempotency_key:id};
   await save(); // Permanent intent and charged call budget precede POST.
   const content=[{type:'input_text',text:rendered.text},...req.prepared.images.map(im=>({type:'input_image',image_url:im.dataUrl}))];
   try{
    response=await fetchImpl('https://api.openai.com/v1/responses',{method:'POST',headers,
     body:JSON.stringify(Output.request({model:binding.model,reasoning:{effort:binding.effort},background:true,
      input:[{role:'user',content}],text:{format:{type:'json_schema',name:'difficulty_structure',strict:true,schema:req.schema}}})),
     signal:AbortSignal.timeout(40000)});
   }catch{return {status:'unresolved',reason:'result_unknown',raw:null};}
  }else{
   if(C.hash(record.request_envelope)!==C.hash(req.request_envelope))throw Error('foreign persisted request envelope');
   if(!record.response_id)return {status:'unresolved',reason:'result_unknown',raw:null};
   if(!/^resp_[a-zA-Z0-9_-]+$/.test(record.response_id))throw Error('invalid_response_id');
   try{response=await fetchImpl('https://api.openai.com/v1/responses/'+record.response_id,{headers,signal:AbortSignal.timeout(40000)});}
   catch{return {status:'processing'};} // Polling an existing ID never resubmits.
  }
  if(!response.ok)return {status:'unresolved',reason:'result_unknown',raw:null,evidence:{http_status:response.status}};
  const result=await response.json();
  if(result.id){record.response_id=result.id;record.status=result.status;await save();}
  if(['queued','in_progress'].includes(result.status)&&record.response_id)return {status:'processing'};
  // An API result must report the actual binding; never infer a missing model.
  if(result.model!==binding.model)return {status:'unresolved',reason:'result_unknown',raw:null,evidence:{model_binding_mismatch:true}};
  const completed_at=new Date().toISOString(),common={...Output.metadata,finish_reason:result.incomplete_details?.reason||result.status,usage_status:result.usage?'reported':'not_reported',request_binding_hash:record.request_envelope.envelope_hash,model:result.model,effort:binding.effort,
   request_id:record.response_id||id,started_at:record.started_at,completed_at,
   latency_ms:Date.parse(completed_at)-Date.parse(record.started_at),usage:result.usage||null};
  if(result.status!=='completed')return {...common,status:result.status==='incomplete'?'failed':'unresolved',reason:result.incomplete_details?.reason||'result_unknown',incomplete_details:result.incomplete_details,raw:null};
  const text=result.output_text||(result.output||[]).flatMap(o=>o.content||[]).filter(c=>c.type==='output_text').map(c=>c.text).join('');
  try{return {...common,response_bytes:Buffer.byteLength(text),truncated:false,status:'complete',raw:JSON.parse(text)};}
  catch{return {...common,status:'failed',reason:'invalid_response',raw:null};}
 }
 return {policyVersion:Policy.model_policy_version,outputPolicyVersion:Output.version,versions,instructions:require('./prompt.cjs').instructions,store,runStage,readCurrent};
}
module.exports={createRuntime};
