'use strict';
const {test,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {createCache}=require('../scripts/difficulty-v122-cache.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'difficulty-cache-test-'));
after(()=>fs.rmSync(root,{recursive:true,force:true}));
const id='00000000-0000-4000-8000-000000000001',bytes=Buffer.from('verified source');
const file={id,size:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
function put(folder,name,content){fs.mkdirSync(path.join(root,folder),{recursive:true});fs.writeFileSync(path.join(root,folder,name),content);}
test('common v12 cache and .json suffix are discovered',()=>{
 put('difficulty-v12/files',id+'.json',bytes);
 assert.deepEqual(createCache(root).read(file),bytes);
});
test('wrong earlier duplicate cannot override matching cached content',()=>{
 put('difficulty-v121/files',id,Buffer.from('stale'));
 const cache=createCache(root);
 assert.deepEqual(cache.read(file),bytes);
 assert.equal(cache.report().verified_files[0].rejected.length,1);
});
test('other artifact cache directories are discovered in one inventory',()=>{
 const other={...file,id:'00000000-0000-4000-8000-000000000002'};
 put('other-school/nested/cache',other.id,bytes);
 assert.deepEqual(createCache(root).read(other),bytes);
});
test('missing or mismatched content fails closed',()=>{
 const cache=createCache(root);
 assert.throws(()=>cache.read({...file,id:'00000000-0000-4000-8000-000000000003'}),/verified_asset_cache_missing/);
 assert.throws(()=>cache.read({...file,sha256:'0'.repeat(64)}),/verified_asset_cache_mismatch/);
});
test('invalid ID and metadata are rejected',()=>{
 const cache=createCache(root);
 assert.throws(()=>cache.read({...file,id:'../escape'}),/invalid_cache_file_metadata/);
 assert.throws(()=>cache.read({...file,size:null}),/invalid_cache_file_metadata/);
});
