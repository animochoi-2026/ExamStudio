// Optional mail delivery. Invitation creation and acceptance do not depend on
// this function or an email provider. Never log the bearer token or link.
import {createHash} from 'node:crypto';
import {Buffer} from 'node:buffer';

const url=Deno.env.get('SUPABASE_URL')!;
const anon=Deno.env.get('SUPABASE_ANON_KEY')!;
const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const site=Deno.env.get('BANK_SITE_URL')||'https://examstudio-shared-bank.pages.dev';
const origin=new URL(site).origin;
const cors={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
const reply=(status:number,body:Record<string,unknown>)=>Response.json(body,{status,headers:cors});
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const tokenPattern=/^[A-Za-z0-9_-]{43}$/;

Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return reply(405,{error:'POST required'});
 try{
  const bearer=req.headers.get('authorization')||'';
  const personResponse=await fetch(url+'/auth/v1/user',{headers:{apikey:anon,authorization:bearer}});
  if(!personResponse.ok)return reply(401,{error:'다시 로그인하세요.'});
  const person=await personResponse.json();
  if(!person.id||!person.email_confirmed_at)return reply(403,{error:'확인된 Google 계정이 필요합니다.'});
  const body=await req.json();const inviteId=body?.inviteId,token=body?.token;
  if(typeof inviteId!=='string'||!uuid.test(inviteId)||typeof token!=='string'||!tokenPattern.test(token))return reply(400,{error:'초대 링크를 확인하세요.'});
  const raw=Buffer.from(token,'base64url');if(raw.length!==32)return reply(400,{error:'초대 링크를 확인하세요.'});
  const digest=createHash('sha256').update(raw).digest('hex');
  const userHeaders={apikey:anon,authorization:bearer,'Content-Type':'application/json'};
  async function rpc(name:string){const res=await fetch(url+'/rest/v1/rpc/'+name,{method:'POST',headers:userHeaders,body:JSON.stringify({invite_id:inviteId,token_digest:digest})});const result=await res.json().catch(()=>({}));if(!res.ok)throw Error(res.status===403?'관리자 권한이 없습니다.':String(result.message||'초대 상태를 확인하세요.'));return result;}
  const check=await rpc('bank_invite_mail_check');
  const key=Deno.env.get('BANK_RESEND_API_KEY');const from=Deno.env.get('BANK_INVITE_FROM');
  if(!key||!from)return reply(200,{status:'unconfigured'});
  const claim=await rpc('bank_invite_mail_claim');
  const link=origin+new URL(site).pathname+'#invite/'+token;
  const text=`문제공방 공동 문제은행에 초대합니다.\n\n아래 링크를 열어 본인 Google 계정(${claim.email})으로 참여해 주세요.\n${link}\n\n유효기간: ${new Date(claim.expiresAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} (한국시간)\n이 링크는 한 사람만 사용할 수 있습니다.`;
  let sent=false;
  try{
   const delivery=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({from,to:[check.email],subject:'문제공방 공동 문제은행 초대',text})});
   sent=delivery.ok;
  }finally{
   await fetch(url+'/rest/v1/rpc/bank_invite_mail_result',{method:'POST',headers:{apikey:service,authorization:'Bearer '+service,'Content-Type':'application/json'},body:JSON.stringify({invite_id:inviteId,sent})});
  }
  return sent?reply(200,{status:'provider_accepted'}):reply(502,{error:'메일 발송 업체가 요청을 거절했습니다. 링크 복사로 전달할 수 있습니다.'});
 }catch(e){return reply(400,{error:e instanceof Error?e.message:'메일 발송 요청에 실패했습니다.'});}
});
