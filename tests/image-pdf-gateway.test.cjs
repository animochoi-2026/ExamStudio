const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
test('image gateway validates actual uploaded bytes; fixed-key copy and interrupted commit recovery preserve old PDF',async()=>{
 const {imagePdfGateway}=await import('../supabase/functions/_shared/image-pdf.mjs');
 const prefix='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa/image-pdf/bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb/',key=prefix+'current.pdf',token='cccccccc-cccc-4ccc-accc-cccccccccccc',tempKey=prefix+token+'.tmp.pdf',backupKey=prefix+token+'.bak.pdf';
 const bytes=Buffer.from('%PDF-1.4\n'+'fixture'.repeat(30)+'\n%%EOF'),hash=crypto.createHash('sha256').update(bytes).digest('hex'),old=Buffer.from('%PDF-1.4\n'+'old pdf'.repeat(25)+'\n%%EOF'),oldHash=crypto.createHash('sha256').update(old).digest('hex');
 const objects=new Map([[key,{bytes:old,sha:oldHash}],[tempKey,{bytes,sha:hash}]]),calls=[];let active=oldHash,failCommit=false,lostCommit=false,lostCopy=false;
 const env=k=>({SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'service',BANK_STORAGE_PROVIDER:'r2',R2_ENDPOINT:'https://'+'a'.repeat(32)+'.r2.cloudflarestorage.com',R2_BUCKET:'pdf'})[k];
 const fetchImpl=async(input,opts={})=>{const req=input instanceof Request?input:new Request(input,opts),u=new URL(req.url);calls.push(u.pathname);
  if(u.pathname==='/auth/v1/user')return req.headers.get('authorization')==='Bearer member'?Response.json({id:'member',email_confirmed_at:'yes'}):new Response(null,{status:401});
  if(u.pathname.endsWith('/bank_image_pdf_service')){const {job}=await req.json();
   if(job.operation==='promote')return Response.json({key,tempKey,backupKey,sha256:active,previous:true});
   if(job.operation==='outcome')return Response.json({key,sha256:active,phase:active===hash?null:'promoting'});
   if(job.operation==='commit'){if(failCommit)return Response.json({message:'changed'},{status:409});active=hash;if(lostCommit)throw Error('lost response');return Response.json({stored:true,key});}
   return Response.json({});
  }
  assert.equal(u.hostname,'a'.repeat(32)+'.r2.cloudflarestorage.com');const k=u.pathname.slice(5);assert([key,tempKey,backupKey].includes(k));
  if(req.method==='PUT'){const from=req.headers.get('x-amz-copy-source').slice(5),obj=objects.get(from);assert(obj);objects.set(k,{...obj});if(lostCopy&&from===tempKey){lostCopy=false;throw Error('lost copy response');}return new Response('<CopyObjectResult/>');}
  if(req.method==='DELETE'){objects.delete(k);return new Response(null,{status:204});}
  const o=objects.get(k);return new Response(req.method==='HEAD'||!o?null:o.bytes,{status:o?200:404,headers:o?{'content-length':String(o.bytes.length),'x-amz-meta-sha256':o.sha,etag:'"'+o.sha+'"'}:{}});
 };
 const handle=imagePdfGateway({env,fetchImpl,signer:{sign:async(u,o)=>new Request(u,o)}}),request=()=>new Request('https://test/fn',{method:'POST',headers:{authorization:'Bearer member'},body:JSON.stringify({job:{operation:'finalize',token,bytes:bytes.length,sha256:hash,pages:1}})});
 assert.equal((await handle(new Request('https://test/fn',{method:'POST',body:'{"job":{"operation":"read"}}'}))).status,401);
 failCommit=true;assert.equal((await handle(request())).status,400);assert.equal(objects.get(key).sha,oldHash);assert.equal(active,oldHash);
 failCommit=false;lostCopy=true;assert.equal((await handle(request())).status,400);assert.equal(objects.get(key).sha,oldHash);assert.equal(active,oldHash);
 failCommit=false;lostCommit=true;assert.equal((await handle(request())).status,200);assert.equal(objects.get(key).sha,hash);assert.equal(active,hash);
 assert(!calls.some(c=>/native-pdf|renderer|browser/.test(c)));
});
