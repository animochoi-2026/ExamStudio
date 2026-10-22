'use strict';
// Pure scheduling: all transports and persistence are explicit dependencies.
const I=require('./input.cjs'),K=require('./contracts.cjs'),C=require('./canonical.cjs');
const P=require('./policy.cjs'),V=require('../difficulty-v123/profiles.cjs'),Schema=require('../difficulty-v123/profiles.cjs'),R=require('../difficulty-v123/authority.cjs');
const version='phase-barrier-concurrency3-r1';
function snapshot(sources,versions){
 const prepared=sources.map(s=>I.prepare(s)),identities=prepared.map(p=>K.identity(p,versions));
 if(new Set(identities.map(K.evaluationKey)).size!==identities.length)throw Error('duplicate_snapshot_identity');
 const manifest={batch_policy_version:version,concurrency:3,identities};
 return {prepared,manifest,hash:C.hash(manifest)};
}
function systemic(call){
 return !!call.systemicFailure||/authentication|unauthorized|invalid.api.key|model.*(?:not.found|unavailable)|invalid json schema|regex lookaround|bundle.*(?:mismatch|invalid)/i.test(
  [call.reason,...(call.evidence?.errors||[]).map(e=>e.message)].join(' '));
}
async function run(sources,runtime){
 require('../difficulty-v123/versions.cjs').assertVersions(runtime.versions);P.assertPolicy(runtime.policyVersion);
 if(typeof runtime.runStage!=='function')throw Error('explicit_stage_transport_required');
 const snap=snapshot(sources,runtime.versions),cp=runtime.batchStore||runtime.store.openBatch?.(snap.hash);
 if(!cp)throw Error('atomic_batch_checkpoint_required');
 const store=runtime.store,limit=runtime.callLimit??Infinity,maxStage=runtime.smoke?2:3;
 let state,stopped=false,lastCommon=null,repeats=0;
 cp.acquire();
 const save=()=>{cp.write('checkpoint.json',state,true);cp.heartbeat();};
 const event=(type,more={})=>{state.events.push({at:new Date().toISOString(),type,...more});};
 try{
  const old=cp.read('manifest.json');
  if(old&&C.hash(old)!==snap.hash)throw Error('manifest_hash_mismatch');
  cp.write('manifest.json',snap.manifest);
  state=cp.read('checkpoint.json')||{manifest_hash:snap.hash,policy:version,calls:0,events:[],items:snap.manifest.identities.map((i,index)=>({
   index,key:K.evaluationKey(i),next:1,status:'pending',result:null,reused:false
  }))};
  if(state.manifest_hash!==snap.hash)throw Error('manifest_hash_mismatch');
  if(state.stopped)throw Error('batch_requires_explicit_recovery:'+state.stopped);
  save();
  for(let stage=1;stage<=maxStage;stage++){
   const candidates=state.items.filter(x=>x.next===stage&&!x.result).map(x=>x.index);
   const frozen=cp.read('stage-'+stage+'-candidates.json');
   // On resume the original candidate set is retained, including finished rows.
   const target=frozen?.indices||candidates;
   if(frozen&&(frozen.manifest_hash!==snap.hash||frozen.stage!==stage))throw Error('candidate_manifest_mismatch');
   cp.write('stage-'+stage+'-candidates.json',frozen||{manifest_hash:snap.hash,stage,indices:target});
   if(!target.length)continue;
   const stageCircuit=R.circuit();event('stage_started',{stage});save();
   let cursor=0;
   async function one(index){
    const item=state.items[index],prepared=snap.prepared[index],identity=snap.manifest.identities[index];
    if(item.result||item.next!==stage)return;
    const prior=await store.get(item.key);
    if(prior){K.verifyEnvelope(prior);item.result=prior;item.reused=true;item.status=prior.status;item.next=null;save();return;}
    if(runtime.readCurrent){
     const current=await runtime.readCurrent(sources[index],index);
     if(C.hash(K.identity(current,runtime.versions))!==C.hash(identity)){
      item.status='stale_input';item.next=null;event('stale_input',{index,stage});save();return;
     }
    }
    const id=K.stageKey(item.key,stage),requestEnvelope=require('./response-contract.cjs').bind(prepared,id);
    let envelope=await store.getStage?.(id),result;
    if(envelope){
     K.verifyEnvelope(envelope);
     result={...envelope,raw:null,rawResponseHash:envelope.raw_response_hash};
    }else{
     const owner=await store.getIntent?.(item.key);
     if(owner&&owner.batch_manifest_hash!==snap.hash){
      item.status='unresolved';item.next=null;item.reason='foreign_or_unknown_evaluation_intent';save();return;
     }
     if(!owner&&!await store.claim(item.key,{evaluation_key:item.key,batch_manifest_hash:snap.hash,identity})){
      item.status='unresolved';item.next=null;item.reason='evaluation_already_claimed';save();return;
     }
     if(state.calls>=limit){stopped=true;state.stopped='call_limit_reached';save();return;}
     if(!await store.claim(id,{request_envelope:requestEnvelope,stage_request_id:id,idempotency_key:id,stage,binding:P.stages[stage-1],identity,
       started_at:new Date().toISOString(),batch_manifest_hash:snap.hash})){
      item.status='unresolved';item.next=null;item.reason='existing_intent_without_completed_result';save();return;
     }
     if(state.calls>=limit){stopped=true;state.stopped='call_limit_reached';save();return;}
     // Persist the budget reservation before dispatch; a crash never frees it.
     state.calls++;item.status='running';event('call_reserved',{stage,index,id});save();
     const started=new Date().toISOString();let call;
     try{call=await runtime.runStage({prepared,request_envelope:requestEnvelope,payload:prepared.payload,instructions:runtime.instructions,
      schema:Schema.schema(prepared.payload),...P.stages[stage-1],request_id:id,idempotency_key:id});}
     catch(e){call={status:'unresolved',reason:'result_unknown',raw:null,evidence:{code:e.code||'transport_outcome_unknown'}};}
     call={...call,started_at:call.started_at||started,completed_at:call.completed_at||new Date().toISOString()};
     if(call.model&&call.model!==P.stages[stage-1].model||call.effort&&call.effort!==P.stages[stage-1].effort){
      call={...call,status:'failed',raw:null,reason:'model_binding_mismatch',systemicFailure:true};
     }
     if(call.status==='processing')call={...call,status:'unresolved',reason:'result_unknown'};
     const checked=call.status==='complete'&&call.raw?V.evaluateResponse(call.raw,prepared.payload,requestEnvelope,call.request_binding_hash===requestEnvelope.envelope_hash?id:'unbound_response'):{
      validation:{valid:false,reason:call.reason||'result_unknown'},
      computed:{status:'failed',reason:call.reason||'result_unknown',score:null,problem_tier:null}};
     result={...call,...checked,status:call.status==='unresolved'?'unresolved':checked.computed.status};
     envelope=K.envelope(prepared,runtime.versions,stage,call,checked,requestEnvelope);
     cp.write('calls/'+id+'.json',{identity,stage,request_id:id,idempotency_key:id,call,envelope});
     await store.stage(id,envelope);
     if(systemic(call)||checked.systemicFailure){stopped=true;state.stopped='systemic_execution_failure';}
    }
    if(stageCircuit.observe(identity.question_id,result)){stopped=true;state.stopped='repeated_common_structure_error';}
    const next=R.next(stage,result,{smoke:!!runtime.smoke});
    item.status=envelope.status;
    if(next===null){
     await store.finish(item.key,envelope);item.result=envelope;item.next=null;
    }else item.next=next;
    event('stage_item_saved',{stage,index,status:item.status,next:item.next});save();
    if(runtime.smoke&&runtime.stopOnSmokeFailure!==false&&envelope.status!=='complete'){stopped=true;state.stopped=state.stopped||'smoke_item_failure';save();}
   }
   async function worker(){
    while(!stopped&&cursor<target.length){
     const index=target[cursor++];
     try{await one(index);}
     catch(e){stopped=true;state.stopped=e.code||e.message||'checkpoint_error';throw e;}
    }
   }
   const settled=await Promise.allSettled(Array.from({length:3},worker));
   const error=settled.find(r=>r.status==='rejected');
   if(error){try{save();}catch{}throw error.reason;}
   if(stopped){save();break;}
   // All workers have settled and persisted before the next manifest is made.
   event('stage_finished',{stage});save();
  }
  state.complete=!stopped&&state.items.every(i=>i.result||['unresolved','stale_input'].includes(i.status));
  event(state.complete?'batch_finished':'batch_stopped');save();
  return state.items.map(i=>({reused:i.reused,result:i.result,status:i.result?.status||i.status,reason:i.reason,
   batchStopped:state.stopped||null}));
 }finally{cp.release();}
}
module.exports={run,snapshot,version};
