// Uses the caller's JWT and narrowly scoped RLS. No service-role credential.
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Content-Type':'application/json'};
Deno.serve(async(request:Request)=>{
 if(request.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(request.method!=='POST')return new Response('{}',{status:405,headers:cors});
 const authorization=request.headers.get('authorization')||'';
 if(!authorization.startsWith('Bearer '))return Response.json({error:'로그인이 필요합니다'},{status:401,headers:cors});
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_ANON_KEY');
 const headers={Authorization:authorization,apikey:key||'','Content-Type':'application/json'};
 async function api(path:string,body:unknown,method='POST'){
  const response=await fetch(url+path,{method,headers,body:JSON.stringify(body)});
  // A void RPC returns 204 with no body after successfully committing deletion.
  const text=await response.text(),data=text.trim()?JSON.parse(text):null;
  if(!response.ok)throw Error(data?.message||data?.error||'삭제 처리 실패');return data;
 }
 try{
  const identity=await fetch(url+'/auth/v1/user',{headers});
  if(!identity.ok)return Response.json({error:'로그인이 필요합니다'},{status:401,headers:cors});
  const user=await identity.json();
  if(!user.id||!user.email_confirmed_at||user.is_anonymous===true)return Response.json({error:'인증된 계정이 필요합니다'},{status:403,headers:cors});
  const {questionId,token}=await request.json();
  if(!/^[a-f0-9-]{36}$/.test(questionId)||!/^\w{32}$/.test(token))throw Error('삭제 대상 확인 오류');
  const job=await api('/rest/v1/rpc/bank_question_delete_claim',{q:questionId,expected_token:token});
  if(!job.complete){
   const prefixes:string[]=[];for(const file of job.files)for(let i=0;i<file.chunks;i++)prefixes.push(`${job.spaceId}/${file.id}/${String(i).padStart(3,'0')}`);
   for(let i=0;i<prefixes.length;i+=100)await api('/storage/v1/object/question-bank',{prefixes:prefixes.slice(i,i+100)},'DELETE');
   await api('/rest/v1/rpc/bank_question_delete_finish',{q:questionId,expected_token:token});
  }
  return Response.json({complete:true},{headers:cors});
 }catch(error){return Response.json({complete:false,error:error instanceof Error?error.message:String(error)},{status:400,headers:cors});}
});
