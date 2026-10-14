const test=require('node:test'),assert=require('node:assert/strict');
test('PDF gateway verifies identity, bytes and upload before publishing; cleans only exact derived keys',async()=>{
 const {paperPdfGateway}=await import('../supabase/functions/_shared/paper-pdf.mjs');
 const key='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa/paper-pdf/bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb/questions/cccccccc-cccc-4ccc-accc-cccccccccccc.pdf';
 const old=key.replace('cccccccc-cccc-4ccc-accc-cccccccccccc','dddddddd-dddd-4ddd-addd-dddddddddddd'),objects=new Map(),calls=[];
 let failPut=false,failDelete=false,active=old;const payload=new TextEncoder().encode('%PDF-1.4\nfixture'),sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',payload))].map(n=>n.toString(16).padStart(2,'0')).join('');
 objects.set(old,{bytes:payload,sha});
 const env=k=>({SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'service',BANK_STORAGE_PROVIDER:'r2',R2_ENDPOINT:'https://'+'a'.repeat(32)+'.r2.cloudflarestorage.com',R2_BUCKET:'test-pdfs'})[k];
 const fetchImpl=async(input,options={})=>{const req=input instanceof Request?input:new Request(input,options),url=new URL(req.url);
  if(url.pathname==='/auth/v1/user')return req.headers.get('authorization')==='Bearer member'?Response.json({id:'member',email_confirmed_at:'yes'}):Response.json({}, {status:401});
  if(url.pathname.endsWith('/bank_paper_pdf_service')){const {actor,job}=await req.json();calls.push({actor,...job});if(job.operation==='gc'){if(job.secret!=='scheduled')return Response.json({message:'denied'},{status:403});return Response.json([old]);}if(job.operation==='upload')return Response.json({key});if(job.operation==='commit'){active=key;return Response.json({stored:true,obsolete:old});}if(job.operation==='read')return Response.json({hit:true,key:active,bytes:payload.length,sha256:sha});return Response.json({});}
  const k=url.pathname.split('/test-pdfs/')[1];assert([key,old].includes(k));
  if(req.method==='PUT'){if(failPut)return new Response(null,{status:503});objects.set(k,{bytes:new Uint8Array(await req.arrayBuffer()),sha:req.headers.get('x-amz-meta-sha256')});return new Response(null,{status:200});}
  if(req.method==='DELETE'){if(failDelete)return new Response(null,{status:503});objects.delete(k);return new Response(null,{status:204});}
  const o=objects.get(k);return new Response(null,{status:o?200:404,headers:o?{'content-length':String(o.bytes.length),'x-amz-meta-sha256':o.sha}:{}});
 };
 const handle=paperPdfGateway({env,fetchImpl,signer:{sign:async(url,options={})=>new Request(url,options)}});
 const request=(job,bytes)=>new Request('https://test/bank-paper-pdf',{method:'POST',headers:{authorization:'Bearer member',...(bytes?{'x-pdf-job':JSON.stringify(job)}:{'Content-Type':'application/json'})},body:bytes||JSON.stringify(job)});
 assert.equal((await handle(new Request('https://test/',{method:'POST',body:'{"operation":"read"}'}))).status,401);
 assert.equal((await handle(request({operation:'commit'}))).status,400);
 failPut=true;assert.equal((await handle(request({operation:'upload',key},payload))).status,400);assert.equal(active,old);assert(objects.has(old));assert(!calls.some(c=>c.operation==='commit'));
 failPut=false;failDelete=true;const uploaded=await handle(request({operation:'upload',key},payload));assert.equal(uploaded.status,200);assert.equal((await uploaded.json()).cleanupPending,true);assert.equal(active,key);assert(objects.has(old));assert(objects.has(key));
 const read=await handle(request({operation:'read'}));assert.equal((await read.json()).sha256,sha);
 failDelete=false;assert.equal((await handle(request({operation:'cleanup',secret:'bad'}))).status,400);assert(objects.has(old));
 assert.equal((await (await handle(request({operation:'cleanup',secret:'scheduled'}))).json()).deleted,1);assert(!objects.has(old));assert(objects.has(key));assert(calls.some(c=>c.operation==='gc_done'&&c.key===old));
 assert.equal((await handle(request({operation:'upload',key},new TextEncoder().encode('not pdf')))).status,400);
});
