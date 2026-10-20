'use strict';
const C=require('./canonical.cjs'),Policy=require('./policy.cjs'),Native=require('./native-source.cjs');
const Input=require('./input.cjs'),Adapter=require('./adapters.cjs'),Runtime=require('./edge-runtime.cjs');
const versions=require('./candidate-versions.json').versions;
function handler({env,fetchImpl=fetch,readFile}){
 const base=env('SUPABASE_URL'),service=env('SUPABASE_SERVICE_ROLE_KEY'),anon=env('SUPABASE_ANON_KEY');
 async function json(route,token,body){
  const response=await fetchImpl(base+route,{method:body?'POST':'GET',
   headers:{apikey:token===service?service:anon,authorization:token===service?'Bearer '+service:token,'content-type':'application/json'},
   ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(40000)});
  const result=await response.json();if(!response.ok)throw Object.assign(Error('staging_request_failed'),{status:response.status});return result;
 }
 const db=(op,j,v={})=>json('/rest/v1/rpc/bank_v12_service',service,{op,j,v});
 async function load(question,revision,authorization,space){
  const rows=await json('/rest/v1/bank_catalog?revision_id=eq.'+encodeURIComponent(revision),authorization);
  const snapshot=rows[0];
  if(!snapshot||snapshot.question_id!==question||snapshot.space_id!==space)throw Error('source_scope_mismatch');
  const revisions=await json('/rest/v1/bank_revisions?question_id=eq.'+encodeURIComponent(question)+'&committed=eq.true&select=id,parent_id',authorization);
  const heads=revisions.filter(r=>!revisions.some(n=>n.parent_id===r.id));
  if(heads.length!==1||heads[0].id!==revision)throw Error('latest_revision_changed');
  const file=snapshot.files.find(f=>f.role==='data');if(!file)throw Error('native_source_missing');
  const bytes=Buffer.from(await readFile(file,space,authorization));
  if(bytes.length!==file.size||C.bytesHash(bytes)!==file.sha256)throw Error('native_source_hash_mismatch');
  return Native.fromNative(snapshot,JSON.parse(bytes.toString('utf8')),f=>readFile(f,space,authorization));
 }
 return async req=>{
  const origin=req.headers.get('origin'),allowed=(env('BANK_FILE_ORIGINS')||'https://examstudio-shared-bank.pages.dev').split(',');
  const headers={'Cache-Control':'no-store',Vary:'Origin','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info,x-exam-grade','Access-Control-Allow-Methods':'POST,OPTIONS'};
  if(origin&&!allowed.includes(origin))return new Response(null,{status:403});
  if(origin)headers['Access-Control-Allow-Origin']=origin;
  const reply=(status,value)=>Response.json(value,{status,headers});
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return reply(405,{error:'POST required'});
  try{
   const authorization=req.headers.get('authorization');if(!authorization?.startsWith('Bearer '))return reply(401,{error:'login_required'});
   const user=await json('/auth/v1/user',authorization);if(!user.id||!user.email_confirmed_at)return reply(403,{error:'verified_account_required'});
   const text=await req.text();if(text.length>8*1024*1024)return reply(413,{error:'request_too_large'});
   const body=JSON.parse(text),{action,id}=body;
   if(id&&!/^[a-f0-9-]{36}$/.test(id))return reply(400,{error:'invalid_job_id'});
   const job=id?await db('status',id):null,space=job?.space_id||body.spaceId;
   const upload=job?.kind==='upload'||action==='upload';
   if(upload&&job&&job.actor!==user.id)return reply(403,{error:'upload_owner_required'});
   if(await json('/rest/v1/rpc/'+(upload?'bank_v12_upload_access':'bank_v12_access'),authorization,{s:space})!==true)return reply(403,{error:'access_denied'});
   if(body.model_policy_version!==Policy.model_policy_version)return reply(200,{status:'evaluation_pending',reason:'difficulty_policy_upgrade_required'});
   if(action==='policy')return reply(200,{policy:Policy,criteria_payload_hash:versions.criteria_payload_hash});
   if(action==='status')return reply(200,job);
   if(action==='results')return reply(200,{entries:await db('results',id)});
   if(!['run','evaluate'].includes(action))return reply(200,{status:'evaluation_pending',reason:'canonical_staging_job_required'});
   // RC cannot silently execute old jobs or activate anything. Deployment and
   // separately approved staging job preparation remain outside this endpoint.
   if(!job||job.policy?.model_policy_version!==Policy.model_policy_version||job.policy?.criteria_payload_hash!==versions.criteria_payload_hash)
    return reply(200,{status:'evaluation_pending',reason:'difficulty_policy_upgrade_required'});
   if(!['approved','running'].includes(job.status)||!Number.isInteger(job.approval?.maxCalls)||job.approval.maxCalls<=0)
    return reply(409,{error:'approved_staging_job_required'});
   if(env('DIFFICULTY_V122_STAGING_ENABLED')!=='true'||!env('OPENAI_API_KEY'))
    return reply(200,{status:'evaluation_pending',reason:'canonical_execution_not_enabled'});
   const claimed=await db('claim',id);if(!claimed)return reply(200,{status:'evaluation_pending',reason:'job_locked_or_finished'});
   try{
    if(claimed.job.id!==id||claimed.job.policy?.criteria_payload_hash!==versions.criteria_payload_hash)throw Error('claimed_job_policy_changed');
    const readSource=()=>load(claimed.item.question_id,claimed.item.revision_id,authorization,space);
    const source=await readSource();
    const runtime=Runtime.createRuntime({claimed,db,fetchImpl,apiKey:env('OPENAI_API_KEY'),readCurrent:async()=>Input.prepare(await readSource())});
    return reply(200,await Adapter.server(source,runtime));
   }finally{await db('release',id,{lease:claimed.lease});}
  }catch(e){return reply(e.status||400,{error:e.message});}
 };
}
module.exports={handler};
