'use strict';
const I=require('./input.cjs'),Q=require('./queue.cjs'),B=require('./bundle-input.cjs'),P=require('./responses.cjs');
function handler({env,fetchImpl=fetch,readFile,waitUntil,canonicalRuntime,loadConfirmedSource}){
 const base=env('SUPABASE_URL'),service=env('SUPABASE_SERVICE_ROLE_KEY'),anon=env('SUPABASE_ANON_KEY');
 const headers=token=>({apikey:token===service?service:anon,Authorization:token===service?'Bearer '+service:token,'Content-Type':'application/json'});
 async function json(path,token,body){const r=await fetchImpl(base+path,{method:body?'POST':'GET',headers:headers(token),...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(40000)});const v=await r.json();if(!r.ok)throw Object.assign(Error(r.status===401||r.status===403?'접근 권한을 확인하세요.':v.message||'서버 처리 실패'),{status:r.status});return v;}
 const db=(op,j,v={})=>json('/rest/v1/rpc/bank_v12_service',service,{op,j,v});
 async function readInput(snapshot,authorization){const f=snapshot.files.find(f=>f.role==='data');if(!f)throw Error('원문 데이터 없음');const bytes=await readFile(f,snapshot.space_id,authorization);if(B.digest(bytes)!==f.sha256)throw Error('원문 해시 불일치');return B.fromNative(snapshot,JSON.parse(Buffer.from(bytes).toString('utf8')),f=>readFile(f,snapshot.space_id,authorization));}
 async function current(e,authorization){if(!e.questionId)return {revisionId:e.revisionId,reviewVersion:e.reviewVersion,inputVersion:e.input.inputVersion};const rows=await json('/rest/v1/bank_catalog?revision_id=eq.'+e.revisionId,authorization),versions=await json('/rest/v1/bank_revisions?question_id=eq.'+e.questionId+'&committed=eq.true&select=id,parent_id,review_version',authorization);const heads=versions.filter(r=>!versions.some(n=>n.parent_id===r.id));if(heads.length!==1||heads[0].id!==e.revisionId||!rows[0])return {};return {revisionId:heads[0].id,reviewVersion:heads[0].review_version,inputVersion:(await readInput(rows[0],authorization)).inputVersion};}
 const policy={evaluationVersion:I.evaluationVersion,promptHash:I.promptHash,specRevision:I.specRevision,scorerVersion:require('./scorer.cjs').version,model:I.settings.model,effort:'high',strict_calibration:false};
 async function process(id,authorization){const claimed=await db('claim',id);if(!claimed)return;const {lease,job,item}=claimed;
  try{
   const e={...item.state,id:item.id,questionId:item.question_id,revisionId:item.revision_id,reviewVersion:item.review_version,input:item.input};
   // Hydrate binary inputs only for this one request. DB holds hashes, never signed URLs.
   if(e.questionId){const prepared=await readInput(item.snapshot,authorization);if(prepared.inputVersion!==e.input.inputVersion)throw Error('고정 입력 변경');e.input=prepared;}else if(e.input.images?.some(i=>!i.dataUrl))throw Error('외부 원문 이미지 미준비');
   await Q.step({id,kind:job.kind,manifestHash:job.policy.manifestHash,evaluationVersion:job.policy.evaluationVersion,promptHash:job.policy.promptHash,model:I.settings.model,effort:'high',strict_calibration:false,status:'approved',version:job.version,calls:job.calls,retries:job.retries,approval:job.approval,pilotReview:job.pilot_review,entries:[e]},
    {provider:P.provider({key:env('OPENAI_API_KEY'),fetchImpl}),readCurrent:x=>current(x,authorization),save:async(state,expected)=>{const entry=state.entries[0];const {input,...saved}=entry;await db('checkpoint',id,{lease,expected,id:item.id,state:saved,calls:state.calls,retries:state.retries,status:state.status});}});
  }catch(error){if(!/Lease\/version conflict/.test(error.message)){const fresh=await db('status',id);await db('checkpoint',id,{lease,expected:fresh.version,id:item.id,state:{...item.state,status:'failed',error:{reason:'input_or_processing_error',message:String(error.message).slice(0,300)},result:{computed:{status:'failed',score:null,problem_tier:null,reason:'input_or_processing_error'}}},calls:fresh.calls,retries:fresh.retries,status:'running'});}}finally{await db('release',id,{lease});}
 }
 async function kick(id,authorization,action){const status=await db('status',id);if(action==='run'&&(!['approved','running'].includes(status.status)||Date.parse(status.lease_until)>Date.now()))return;if(action==='run'&&status.nextAttemptAt>Date.now())await new Promise(r=>setTimeout(r,Math.min(30000,status.nextAttemptAt-Date.now())));try{const response=await fetchImpl(base+'/functions/v1/bank-difficulty-v12',{method:'POST',headers:headers(authorization),body:JSON.stringify({action,id}),signal:AbortSignal.timeout(15000)});if(!response.ok)await db('pause',id,{reason:'continuation_failed',status:response.status});}catch{await db('pause',id,{reason:'continuation_connection_lost'});}}
 return async req=>{
  const origin=req.headers.get('origin'),allowed=(env('BANK_FILE_ORIGINS')||'https://examstudio-shared-bank.pages.dev').split(',');const cors={'Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info,x-exam-grade','Access-Control-Allow-Methods':'POST,OPTIONS'};
  if(origin&&!allowed.includes(origin))return new Response(null,{status:403});if(origin)cors['Access-Control-Allow-Origin']=origin;
  const reply=(status,value)=>Response.json(value,{status,headers:cors});if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});if(req.method!=='POST')return reply(405,{error:'POST required'});
  try{
   const authorization=req.headers.get('authorization');if(!authorization?.startsWith('Bearer '))return reply(401,{error:'로그인이 필요합니다.'});
   const user=await json('/auth/v1/user',authorization);if(!user.id||!user.email_confirmed_at)return reply(403,{error:'인증 계정 필요'});
   const text=await req.text();if(text.length>8*1024*1024)return reply(413,{error:'요청 크기 초과'});const body=JSON.parse(text),{action,id}=body;if(id&&!/^[a-f0-9-]{36}$/.test(id))return reply(400,{error:'작업 ID 오류'});
   const job=id?await db('status',id):null,space=job?.space_id||body.spaceId;
   const uploadAction=action==='upload'||job?.kind==='upload'&&['upload-result','run','resume','status'].includes(action);
   if(uploadAction&&job&&job.actor!==user.id)return reply(403,{error:'본인의 업로드 평가만 처리할 수 있습니다.'});
   if(await json('/rest/v1/rpc/'+(uploadAction?'bank_v12_upload_access':'bank_v12_access'),authorization,{s:space})!==true)return reply(403,{error:uploadAction?'공동문제은행 접근 권한 필요':'오너 권한 필요'});
   if(['policy','evaluate','upload','prepare','run','resume','prepare-retry','external','recalculate'].includes(action)){
    return reply(200,await require('../difficulty-v122/server.cjs').dispatch({body,runtime:canonicalRuntime,loadConfirmedSource}));
   }
   if(action==='approve-upload')return reply(200,await db('upload_policy',null,{...body.approval,spaceId:space,actor:user.id,policy}));
   if(action==='upload'){
    const input=I.input(body.source),manifestHash=I.hash([{id:'upload',questionId:null,revisionId:null,reviewVersion:null,inputVersion:input.inputVersion}]);
    const value=await db('upload',null,{spaceId:space,actor:user.id,input,policy:{...policy,manifestHash,inputVersion:input.inputVersion}});
    if(waitUntil)waitUntil(kick(value.id,authorization,'run'));return reply(200,{id:value.id,pending:true});
   }
   if(action==='prepare'){const value=await db('prepare',null,{spaceId:space,actor:user.id,kind:body.kind,questionIds:body.questionIds||null,policy});return reply(200,value);}
   if(!job)return reply(400,{error:'작업을 준비하세요.'});
   if(action==='status')return reply(200,job);
   if(action==='items')return reply(200,await db('items',id,{offset:body.offset||0}));
   if(action==='upload-result'){
    if(job.kind!=='upload'||job.actor!==user.id)return reply(403,{error:'본인의 업로드 평가만 조회할 수 있습니다.'});
    const rows=await db('results',id),state=rows[0]?.state;if(state?.status==='complete')return reply(200,{result:state.result,pending:false});
    if(['failed','conflict'].includes(state?.status))return reply(409,{error:'평가 실패: '+(state.result?.computed?.reason||'평가 입력 확인 필요')});
    if(job.status==='paused')return reply(409,{error:'평가가 일시정지되었습니다. 관리자 작업 상태를 확인하세요.'});
    if(waitUntil)waitUntil(kick(id,authorization,'run'));return reply(200,{id,pending:true});
   }
   if(action==='prepare-next'){
    const item=await db('pending_input',id);if(!item){const manifest=await db('manifest',id);await db('seal',id,{manifestHash:I.hash(manifest)});return reply(200,{sealed:true,manifestHash:I.hash(manifest)});}
    const prepare=async()=>{try{const input=await readInput(item.snapshot,authorization);input.images=input.images.map(({dataUrl,...rest})=>rest);await db('input',id,{id:item.id,input});}catch(e){await db('input_error',id,{id:item.id,error:{reason:'input_preparation_failed',message:String(e.message).slice(0,300)}});}await kick(id,authorization,'prepare-next');};
    if(waitUntil){waitUntil(prepare());return reply(202,{preparing:item.id});}await prepare();return reply(200,{prepared:item.id});
   }
   if(action==='prepare-retry')return reply(200,await db('prepare_retry',id));
   if(action==='external'){const input=I.input(body.source);return reply(200,await db('external',id,{id:body.externalId,input}));}
   if(action==='approve')return reply(200,await db('approve',id,{...body.approval,evaluationVersion:I.evaluationVersion,approvedBy:user.id,approvedAt:new Date().toISOString()}));
   if(action==='run'){
    if(!env('OPENAI_API_KEY'))return reply(503,{error:'서버 OPENAI_API_KEY 설정이 필요합니다.'});if(!['approved','running'].includes(job.status))return reply(409,{error:'같은 프롬프트와 대상의 실행 승인이 필요합니다.'});
    const work=async()=>{await process(id,authorization);await kick(id,authorization,'run');};if(waitUntil){waitUntil(work());return reply(202,{running:true});}await process(id,authorization);return reply(200,await db('status',id));
   }
   if(action==='resume')return reply(200,await db('resume',id));
   if(action==='results'){const entries=await db('results',id);return reply(200,{entries,resultHash:I.hash(entries),usage:require('./cost.cjs').actual(entries)});}
   if(action==='estimate')return reply(200,require('./cost.cjs').estimate(job.total-(job.counts?.complete||0),body.maxCalls||job.total));
   if(action==='report')return reply(200,require('./report.cjs').report(await db('report',id)));
   if(action==='recalculate'){if(job.status!=='complete')return reply(409,{error:'아직 운영 전환하지 않은 완료 작업만 재계산할 수 있습니다.'});const entries=await db('results',id);const values=entries.filter(e=>e.state?.result?.raw).map(e=>({id:e.id,state:Q.recalculate(e.state)}));return reply(200,await db('recalculate',id,{entries:values}));}
   if(action==='pilot-review'){const entries=await db('results',id),review=require('./pilot.cjs').review(entries,body.review);return reply(200,await db('pilot_review',id,{...review,reviewedBy:user.id,evaluationVersion:I.evaluationVersion}));}
   if(action==='attach-pilot')return reply(200,await db('attach_pilot',id,{pilotId:body.pilotId}));
   if(action==='activate'){const entries=await db('results',id);if(body.approval?.resultHash!==I.hash(entries))return reply(409,{error:'검토한 결과와 현재 결과가 다릅니다.'});return reply(200,await db('activate',id,{...body.approval,approvedBy:user.id}));}
   if(action==='rollback')return reply(200,await db('rollback',id,{granted:body.approval?.granted,approvedBy:user.id}));
   return reply(400,{error:'알 수 없는 작업'});
  }catch(e){return reply(e.status||400,{error:e.message});}
 };
}
module.exports={handler};
