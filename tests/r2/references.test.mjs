import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileReferences,listReferences,listManagementReferences,assertFrozen} from '../../tools/storage-migration/references.mjs';
import {preflight,transfer} from '../../tools/storage-migration/core.mjs';
const entry={id:'file',space_id:'space',size:6291457,chunks:2,verified:true,created_at:'2026-01-01'};
test('operator acknowledgement alone cannot replace the actual server write freeze',async()=>{
 for(const value of [{provider:'supabase',frozen:false},{provider:'r2',frozen:true}])await assert.rejects(assertFrozen({url:'https://fixture.supabase.co',key:'fixture',provider:'supabase',fetchImpl:async()=>Response.json(value)}),/SERVER_FREEZE_NOT_CONFIRMED/);
 await assertFrozen({url:'https://fixture.supabase.co',key:'fixture',provider:'supabase',fetchImpl:async()=>Response.json({provider:'supabase',frozen:true})});
});
test('DB references distinguish logical files from objects and compare every chunk size',()=>{
 const ok=reconcileReferences([entry],[{key:'space/file/000',size:6291456},{key:'space/file/001',size:1}]);assert.equal(ok.ok,true);assert.equal(ok.logicalFiles,1);assert.equal(ok.expectedObjects,2);
 const bad=reconcileReferences([entry],[{key:'space/file/000',size:4},{key:'other',size:1}]);assert.deepEqual(bad.failures.map(f=>f.code),['REFERENCE_SIZE_MISMATCH','UNREFERENCED_OBJECT','REFERENCED_OBJECT_MISSING']);
});
test('reference metadata date changes alter baseline; invalid chunk counts fail',()=>{
 assert.notEqual(reconcileReferences([entry],[]).sha256,reconcileReferences([{...entry,created_at:'changed'}],[]).sha256);
 assert.throws(()=>reconcileReferences([{...entry,chunks:1}],[]),/INVALID_DB_FILE_REFERENCE/);
});
test('reference listing follows actual page count, not assumed server page size',async()=>{
 let calls=0;const key='x.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.x';
 const rows=await listReferences({url:'https://fixture.supabase.co',key,fetchImpl:async url=>{calls++;const offset=Number(new URL(url).searchParams.get('offset'));return Response.json([{...entry,id:'f'+offset}],{headers:{'Content-Range':`${offset}-${offset}/3`}});}});
 assert.equal(rows.length,3);assert.equal(calls,3);
 await assert.rejects(listReferences({url:'https://fixture.supabase.co',key:'user-jwt'}),/COMPLETE_DB_READ/);
});
test('DB reference mismatch prevents any source content read or copy',async()=>{
 let gets=0;const source={identity:'s',list:async()=>[],references:async()=>[entry],get:async()=>{gets++;}},target={identity:'t',list:async()=>[]};
 const manifest=await preflight(source,target);assert.equal(manifest.referenceCheck.ok,false);
 await assert.rejects(transfer({source,target,manifest,state:{},save:async()=>{},mode:'copy'}),/DB_REFERENCE_MISMATCH/);assert.equal(gets,0);
});
test('scoped Management references paginate read-only and bind project to source URL',async()=>{
 let calls=0;
 const rows=await listManagementReferences({url:'https://fixture.supabase.co',token:'artificial',fetchImpl:async(url,options)=>{
  assert.equal(url,'https://api.supabase.com/v1/projects/fixture/database/query');
  assert.equal(options.method,'POST');const body=JSON.parse(options.body);assert.equal(body.read_only,true);
  assert.match(body.query,new RegExp('offset '+calls+'\\) p$'));
  return Response.json([{total:3,entries:[{...entry,id:'f'+calls++}]}]);
 }});assert.equal(rows.length,3);assert.equal(calls,3);
});
test('scoped reference pagination rejects drift, truncation and duplicates',async()=>{
 for(const [pages,code] of [
  [[{total:2,entries:[entry]},{total:3,entries:[]}],'DB_REFERENCE_LIST_CHANGED'],
  [[{total:2,entries:[entry]},{total:2,entries:[]}],'INCOMPLETE_DB_REFERENCES'],
  [[{total:2,entries:[entry]},{total:2,entries:[entry]}],'DUPLICATE_DB_REFERENCE']
 ])await assert.rejects(listManagementReferences({url:'https://fixture.supabase.co',token:'artificial',fetchImpl:async()=>Response.json([pages.shift()])}),new RegExp(code));
});
test('scoped reference errors never expose response bodies or token',async()=>{
 await assert.rejects(listManagementReferences({url:'https://fixture.supabase.co',token:'artificial',fetchImpl:async()=>new Response('sensitive',{status:403})}),{message:'SCOPED_DB_REFERENCE_READ_FAILED'});
 await assert.rejects(listManagementReferences({url:'https://untrusted.example',token:'artificial'}),/SCOPED_DB_READ_CREDENTIAL_REQUIRED/);
});
