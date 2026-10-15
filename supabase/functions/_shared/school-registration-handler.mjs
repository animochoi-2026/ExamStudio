import {registerSchoolRegion} from './school-registration.mjs';

// Small registration coordinator. The existing binary-backed verifier remains
// the authority for file integrity and bank_finish; no verification is bypassed.
export function schoolRegistrationHandler(env,fetchImpl=fetch,waitUntil=null){
 return async req=>{
  const reply=(status,value)=>Response.json(value,{status});
  if(req.method!=='POST')return reply(405,{error:'POST required'});
  const url=env('SUPABASE_URL'),anon=env('SUPABASE_ANON_KEY'),authorization=req.headers.get('authorization')||'';
  const headers={apikey:anon,authorization};
  try{
   const auth=await fetchImpl(url+'/auth/v1/user',{headers,signal:AbortSignal.timeout(15000)});
   if(!auth.ok)return reply(401,{error:'Sign in again'});
   const user=await auth.json();if(!user.id||!user.email_confirmed_at)return reply(403,{error:'Verified account required'});
   const reader=req.body?.getReader();if(!reader)return reply(400,{error:'Request required'});const chunks=[];let size=0;
   for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1024){await reader.cancel();return reply(413,{error:'Request too large'});}chunks.push(value);}
   const text=await new Blob(chunks).text();
   const {id}=JSON.parse(text);if(typeof id!=='string'||!/^[a-f0-9-]{36}$/i.test(id))return reply(400,{error:'Invalid commit ID'});
   const response=await fetchImpl(url+'/rest/v1/bank_entries?id=eq.'+id+'&select=owner_id,props',{headers,signal:AbortSignal.timeout(15000)});
   const rows=response.ok?await response.json():[];const entry=rows.length===1?rows[0]:null;
   if(!entry||entry.owner_id!==user.id||entry.props?.role!=='commit'||!entry.props.revisionId)return reply(403,{error:'Only the uploader may register this commit'});
   const verified=await fetchImpl(url+'/functions/v1/bank-verify',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({id}),signal:AbortSignal.timeout(150000)});
   const value=await verified.json();if(!verified.ok||value.verified!==true)return reply(verified.ok?502:verified.status,value);
   // A region outage must never turn a successfully committed question into a
   // failed upload. The stored pending/failed state is retriable by the owner.
   const lookup=registerSchoolRegion({revision:entry.props.revisionId,actor:user.id,url,service:env('SUPABASE_SERVICE_ROLE_KEY'),key:env('GOOGLE_MAPS_API_KEY'),fetchImpl}).catch(()=>({pending:true}));
   if(waitUntil){waitUntil(lookup);return reply(200,{verified:true,region:{pending:true}});}
   return reply(200,{verified:true,region:await lookup});
  }catch{return reply(503,{error:'등록 확인에 실패했습니다. 같은 업로드를 재시도하세요.'});}
 };
}
