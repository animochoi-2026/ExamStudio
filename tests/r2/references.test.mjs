import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileReferences,listReferences,assertFrozen} from '../../tools/storage-migration/references.mjs';
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
