'use strict';
// Read-only local cache discovery. A filename match never replaces byte verification.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const artifactRoot='C:/Users/reals/.codex/worktrees/registration-ui-20261017/문제생성기/artifacts';
const preferred=[
 'difficulty-v121/files',
 'difficulty-v12/files',
 'difficulty-v12/shindong-2026-2-midterm/files',
 'difficulty-v12/shingu-2026-2-midterm/files',
];
const idPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function createCache(root=artifactRoot){
 root=path.resolve(root);
 // Pure local traversal also runs inside the no-subprocess test boundary.
 // Like the prior rg invocation, include hidden files and ignore no folders;
 // do not follow directory symlinks out of the cache root.
 const listing=[];
 function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  const file=path.join(dir,entry.name);
  if(entry.isDirectory())walk(file);
  else if(entry.isFile())listing.push(file);
 }}
 walk(root);
 const index=new Map(),used=new Map();
 for(const file of listing){
  const name=path.basename(file),id=name.slice(0,36);
  if(!idPattern.test(id)||!/^(\.(json|png|jpe?g|webp))?$/i.test(name.slice(36)))continue;
  const relative=path.relative(root,file);
  if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('cache_path_outside_root');
  const list=index.get(id.toLowerCase())||[];
  list.push(file);index.set(id.toLowerCase(),list);
 }
 const rank=file=>{
  const dir=path.relative(root,path.dirname(file)).split(path.sep).join('/');
  const i=preferred.indexOf(dir);return i<0?preferred.length:i;
 };
 for(const list of index.values())list.sort((a,b)=>rank(a)-rank(b)||a.localeCompare(b));
 function read(file){
  if(!idPattern.test(file.id)||!Number.isSafeInteger(file.size)||file.size<0||!/^[a-f0-9]{64}$/i.test(file.sha256))
   throw Error('invalid_cache_file_metadata:'+file.id);
  const candidates=index.get(file.id.toLowerCase())||[],rejected=[];
  for(const local of candidates){
   const bytes=fs.readFileSync(local),sha256=hash(bytes);
   if(bytes.length!==file.size||sha256!==file.sha256.toLowerCase()){
    rejected.push({path:local,size:bytes.length,sha256});continue;
   }
   used.set(file.id+':'+sha256,{id:file.id,path:local,size:bytes.length,sha256,
    candidate_count:candidates.length,rejected});
   return bytes;
  }
  const error=Error((candidates.length?'verified_asset_cache_mismatch:':'verified_asset_cache_missing:')+file.id);
  error.candidates=rejected;throw error;
 }
 return {read,report:()=>({root,preferred_directories:preferred.map(d=>path.join(root,d)),
  indexed_ids:index.size,discovered_directories:[...new Set([...index.values()].flat().map(f=>path.dirname(f)))].sort(),
  verified_files:[...used.values()]})};
}
module.exports={createCache};
