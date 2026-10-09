'use strict';
// Explicit operator helper only. No background cleanup or app default changed.
const fs=require('node:fs'),crypto=require('node:crypto');
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function approvedEnvelope(file,expectedHash){
 const bytes=fs.readFileSync(file),hash=crypto.createHash('sha256').update(bytes).digest('hex');
 if(!/^[a-f0-9]{64}$/.test(expectedHash)||hash!==expectedHash)throw Error('Approval manifest hash mismatch');
 const m=JSON.parse(bytes);if(!uuid.test(m.spaceId)||!Array.isArray(m.files)||!Array.isArray(m.revisions))throw Error('Invalid approval manifest');
 const files=m.files.map(f=>({id:f.id,size:f.size,sha256:f.sha256,chunks:f.chunks})),revisions=m.revisions.map(r=>r.id);
 if(files.some(f=>!uuid.test(f.id)||!Number.isSafeInteger(f.size)||f.size<=0||!/^[a-f0-9]{64}$/.test(f.sha256)||f.chunks!==Math.ceil(f.size/6291456))||revisions.some(r=>!uuid.test(r))
  ||new Set(files.map(f=>f.id)).size!==files.length||new Set(revisions).size!==revisions.length)throw Error('Invalid approval descriptors');
 if(m.total?.files!==files.length||m.total?.revisions!==revisions.length||m.total?.physicalBytes!==files.reduce((n,f)=>n+f.size,0))throw Error('Approval totals mismatch');
 return{schema:1,spaceId:m.spaceId,approvalHash:hash,ceilingBytes:m.total.physicalBytes,files,revisions};
}
async function dryRun(storage,manifest){
 if(storage.auth.config().spaceId!==manifest.spaceId)throw Error('Approval space mismatch');
 return storage.rpc('bank_revision_prune_plan',{s:manifest.spaceId,manifest});
}
async function execute(storage,{manifest,jobId,expectedToken,saveCheckpoint}){
 if(!uuid.test(jobId)||!/^[a-f0-9]{32}$/.test(expectedToken)||typeof saveCheckpoint!=='function')throw Error('Persistent approved job checkpoint required');
 if(storage.auth.config().spaceId!==manifest.spaceId)throw Error('Approval space mismatch');
 // Save job identity BEFORE claim: a lost claim response resumes the same ID.
 await saveCheckpoint({jobId,expectedToken,approvalHash:manifest.approvalHash,phase:'claim'});
 const claim=await storage.rpc('bank_revision_prune_claim',{s:manifest.spaceId,j:jobId,manifest,expected_token:expectedToken});
 if(claim.complete){await saveCheckpoint({jobId,expectedToken,approvalHash:manifest.approvalHash,phase:'complete',bytes:claim.bytes});return{complete:true,replayed:true,bytes:claim.bytes};}
 if(claim.spaceId!==manifest.spaceId||claim.token!==expectedToken||!Array.isArray(claim.files))throw Error('Claim identity mismatch');
 const approved=new Map(manifest.files.map(f=>[f.id,f])),objects=[];let sum=0;
 for(const f of claim.files){const a=approved.get(f.id);
  if(!a||f.size!==a.size||f.sha256!==a.sha256||f.chunks!==a.chunks||!Array.isArray(f.objectNames)||f.objectNames.length!==f.chunks)throw Error('Claim exceeds approved descriptors');
  const expected=Array.from({length:f.chunks},(_,i)=>`${manifest.spaceId}/${f.id}/${String(i).padStart(3,'0')}`);
  if(expected.some((n,i)=>f.objectNames[i]!==n))throw Error('Claim Storage names mismatch');
  objects.push(...f.objectNames);sum+=f.size;
 }
 if(new Set(objects).size!==objects.length||sum>manifest.ceilingBytes)throw Error('Claim exceeds approval ceiling');
 // Repeat exact names after partial failures. SQL finish checks actual absence;
 // the Storage API can return [] for already-missing objects on a retry.
 for(let offset=0;offset<objects.length;offset+=100){
  await saveCheckpoint({jobId,expectedToken,approvalHash:manifest.approvalHash,phase:'storage',offset,totalObjects:objects.length});
  await storage.auth.request('/storage/v1/object/question-bank',{method:'DELETE',body:{prefixes:objects.slice(offset,offset+100)},token:await storage.auth.token()});
 }
 await saveCheckpoint({jobId,expectedToken,approvalHash:manifest.approvalHash,phase:'finish'});
 const result=await storage.rpc('bank_revision_prune_finish',{s:manifest.spaceId,j:jobId,expected_token:expectedToken});
 if(result.complete!==true)throw Error('Retirement not completed');
 await saveCheckpoint({jobId,expectedToken,approvalHash:manifest.approvalHash,phase:'complete',bytes:result.bytes});return result;
}
module.exports={approvedEnvelope,dryRun,execute};
