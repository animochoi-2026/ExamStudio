'use strict';
// Optional bounded production smoke test. Uses existing local OS-encrypted logins.
// Creates exactly one email-bound .invalid invite and cancels it in finally.
const {app,safeStorage}=require('electron');
const path=require('node:path');
const crypto=require('node:crypto');
const {SharedBankAuth}=require('../app/shared-bank-auth.cjs');
const root=path.resolve(__dirname,'..');
app.setPath('userData',path.join(root,'data/desktop'));
app.whenReady().then(async()=>{
 let owner,id,results={};
 try{
  const dirs=['data/shared-bank-auth','data/deployment/bjxxqdbftefughjkcrqj/teacher-auth'];
  const auths=dirs.map(d=>new SharedBankAuth({directory:path.join(root,d),safeStorage}));
  owner=auths.find(a=>a.status().account?.email==='animochoi@gmail.com');
  const teacher=auths.find(a=>a.status().account?.email==='realspy1234@gmail.com');
  if(!owner||!teacher)throw Error('Both existing authenticated test accounts are required');
  const s=owner.config().spaceId;
  const rawToken=crypto.randomBytes(32);
  const digest=crypto.createHash('sha256').update(rawToken).digest('hex');
  const teacherToken=await teacher.token();
  try{await teacher.request('/rest/v1/rpc/bank_invite_create',{method:'POST',body:{s,token_digest:digest,email_address:'nobody@example.invalid'},token:teacherToken});results.teacherCreate='UNEXPECTED_SUCCESS';}
  catch(e){results.teacherCreate=e.code==='auth'?'denied':'error: '+e.code;}
  const ownerToken=await owner.token();
  id=await owner.request('/rest/v1/rpc/bank_invite_create',{method:'POST',body:{s,token_digest:digest,email_address:'nobody@example.invalid',note_text:'자동 배포 검증 — 취소 예정'},token:ownerToken});
  results.ownerCreate=typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id)?'created':'unexpected';
  const invite=await owner.request('/rest/v1/bank_invitations?select=id,status,invited_email,expires_at&id=eq.'+id,{token:ownerToken});
  results.list=invite?.[0]?.status==='active'&&invite[0].invited_email==='nobody@example.invalid'?'visible':'unexpected';
  const mismatch=await teacher.request('/rest/v1/rpc/bank_invite_accept',{method:'POST',body:{token_digest:digest},token:teacherToken});
  results.wrongEmail=mismatch?.status==='email_mismatch'?'blocked':'UNEXPECTED';
  const c=owner.config();
  const mail=await fetch(c.url+'/functions/v1/bank-invite-mail',{method:'POST',headers:{apikey:c.publishableKey,Authorization:'Bearer '+ownerToken,'Content-Type':'application/json',Origin:'https://examstudio-shared-bank.pages.dev'},body:JSON.stringify({inviteId:id,token:rawToken.toString('base64url')})});
  const mailResult=await mail.json();
  results.email=mail.status===200&&mailResult.status==='unconfigured'?'unconfigured (link remains usable)':'unexpected HTTP '+mail.status;
 }catch(e){results.error=e.message;process.exitCode=1;}
 finally{
  if(id&&owner){try{const token=await owner.token();await owner.request('/rest/v1/rpc/bank_invite_cancel',{method:'POST',body:{invite_id:id},token});const state=await owner.request('/rest/v1/bank_invitations?select=status&id=eq.'+id,{token});results.cancel=state?.[0]?.status==='cancelled'?'cancelled and verified':'FAILED: not cancelled';}catch(e){results.cancel='FAILED: '+e.message;process.exitCode=1;}}
  console.log(JSON.stringify(results));app.quit();
 }
});
