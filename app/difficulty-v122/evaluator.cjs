'use strict';
const Input=require('./input.cjs'),Schema=require('./schema.cjs'),V=require('./validate.cjs'),Policy=require('./policy.cjs');
const C=require('./canonical.cjs'),K=require('./contracts.cjs'),Router=require('./router.cjs');
async function evaluate({source,prepared=Input.prepare(source),policyVersion,versions,instructions,store,runStage,readCurrent,circuit=Router.circuit(),smoke=false,savedOnly=false}){
 Policy.assertPolicy(policyVersion);
 const identity=K.identity(prepared,versions),key=K.evaluationKey(identity);
 const prior=await store.get(key);
 if(prior){K.verifyEnvelope(prior);if(prior.evaluation_key!==key)throw Error('reuse identity mismatch');return {reused:true,result:prior};}
 if(savedOnly)return {status:'evaluation_pending',reason:'no_identical_evaluator_key'};
 if(typeof runStage!=='function')return {status:'evaluation_pending',reason:'canonical_provider_unavailable'};
 if(circuit.stopped)throw Error('common_failure_circuit_open');
 if(!await store.claim(key,{evaluation_key:key,identity,started_at:new Date().toISOString()})&&!await store.canResume?.(key))return {status:'evaluation_pending',reason:'evaluation_already_claimed'};
 for(let stage=1;stage<=3;){
  if(circuit.stopped)throw Error('common_failure_circuit_open');
  if(readCurrent){const current=await readCurrent();if(C.hash(K.identity(current,versions))!==C.hash(identity))throw Error('input changed before call');}
  const id=K.stageKey(key,stage),requestEnvelope=require('./response-contract.cjs').bind(prepared,id);
  // A leased Edge checkpoint can resume by reading a completed stage or polling
  // its persisted response ID. A bare intent is never permission to resubmit.
  const saved=await store.getStage?.(id);
  if(saved){
   K.verifyEnvelope(saved);
   const savedResult={...saved,computed:saved.computed,validation:saved.validation,rawResponseHash:saved.raw_response_hash};
   const next=Router.next(stage,savedResult,{smoke});
   if(next===null){await store.finish(key,saved);return {reused:true,result:saved};}
   stage=next;continue;
  }
  if(!await store.claim(id,{request_envelope:requestEnvelope,stage_request_id:id,evaluation_key:key,stage,binding:Policy.stages[stage-1]})&&!await store.canResume?.(id))return {status:'evaluation_pending',reason:'stage_already_claimed'};
  const started=new Date().toISOString();let call;
  try{call=await runStage({prepared,request_envelope:requestEnvelope,payload:prepared.payload,instructions,schema:Schema.forRegistry(prepared.registry),...Policy.stages[stage-1],request_id:id,idempotency_key:id});}
  catch(e){call={status:'unresolved',reason:'result_unknown',evidence:{message:String(e.code||'transport_outcome_unknown')},raw:null};}
  if(call.status==='processing')return {status:'evaluation_pending',reason:'response_processing',stage,stage_request_id:id};
  call.started_at=call.started_at||started;call.completed_at=call.completed_at||new Date().toISOString();
  if(call.model&&call.model!==Policy.stages[stage-1].model||call.effort&&call.effort!==Policy.stages[stage-1].effort)throw Error('actual model binding mismatch');
  const checked=call.status==='complete'&&call.raw?V.evaluateResponse(call.raw,prepared.payload,requestEnvelope,call.request_binding_hash===requestEnvelope.envelope_hash?id:'unbound_response'):
   {validation:{valid:false,reason:call.reason||'result_unknown'},computed:{status:'failed',reason:call.reason||'result_unknown',score:null,problem_tier:null}};
  const result={...call,...checked,status:call.status==='unresolved'?'unresolved':checked.computed.status};
  const envelope=K.envelope(prepared,versions,stage,call,checked,requestEnvelope);
  await store.stage(id,envelope);
  const commonFailure=circuit.observe(identity.question_id,result),n=Router.next(stage,result,{smoke});
  if(commonFailure||n===null){await store.finish(key,envelope);return {reused:false,result:envelope,commonFailure};}
  if(store.yieldAfterStage)return {status:'evaluation_pending',reason:'next_stage_ready',stage:n};
  stage=n;
 }
 throw Error('stage policy exhausted');
}
module.exports={evaluate,prepare:Input.prepare,policy:Policy};
