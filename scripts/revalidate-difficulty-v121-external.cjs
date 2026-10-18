'use strict';
// Local evidence repair only. Never invokes a model or changes model inputs.
const fs=require('node:fs'),path=require('node:path');
const I=require('../app/difficulty-v12/input.cjs'),P=require('../app/difficulty-v121/profile.cjs'),V=require('../app/difficulty-v121/schema.cjs'),Run=require('../app/difficulty-v121/run.cjs'),Policy=require('../app/difficulty-v121/policy.cjs');
const root=path.resolve('artifacts/difficulty-v121/external'),read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
if(fs.existsSync(path.join(root,'runner.lock')))throw Error('Wait for the external runner to finish');
const manifest=read('manifest.json'),approval=read('../execution-approval.json');
if(approval.granted!==true||approval.profileVersion!==P.version||approval.promptHash!==P.promptHash||approval.schemaHash!==P.schemaHash||manifest.profileVersion===P.version)throw Error('Expected unchanged approved model contract and repaired local validator');
const archive=path.join(root,'validation-history',manifest.profileVersion);fs.mkdirSync(archive,{recursive:true});
for(const item of manifest.entries){
 const e=read('entries/'+item.id+'.json'),all=[];
 for(const folder of fs.readdirSync(path.join(root,'calls'))){
  const file=path.join(root,'calls',folder,'result.json');if(!fs.existsSync(file))throw Error('Unconfirmed call remains');
  const old=JSON.parse(fs.readFileSync(file,'utf8'));if(old.id!==e.id||old.revalidatedFrom)continue;
  if(old.promptHash!==P.promptHash||old.scoringProfile!==P.id||old.inputVersion!==e.input.inputVersion||!old.evidence?.completed||!old.raw)throw Error('Cannot locally reuse changed or unconfirmed evidence');
  all.push({...old,...V.evaluate(old.raw,e.validationContext),originalCacheKey:folder});
 }
 all.sort((a,b)=>Policy.stages.findIndex(s=>s.id===a.executionProfile)-Policy.stages.findIndex(s=>s.id===b.executionProfile));
 const selected=[];for(const stage of all){selected.push(stage);if(!Policy.decide(selected.length,stage).next)break;}
 if(!selected.length||Policy.decide(selected.length,selected.at(-1)).next)throw Error('External stages incomplete: '+item.id);
 const result={...Run.finalRecord(e,selected),profile_version:P.version,input_identity:P.inputIdentity(e),validation_repair:{originalProfile:manifest.profileVersion,modelCalls:0,preservedCalls:all.map(s=>s.originalCacheKey)}};
 const file=path.join(root,'results',item.id+'.json');fs.copyFileSync(file,path.join(archive,item.id+'.json'),fs.constants.COPYFILE_EXCL);
 fs.writeFileSync(file,JSON.stringify(result));item.identity=P.inputIdentity(e);
}
fs.copyFileSync(path.join(root,'manifest.json'),path.join(archive,'manifest.json'),fs.constants.COPYFILE_EXCL);
manifest.profileVersion=P.version;manifest.hash=I.hash(manifest.entries);fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({revalidated:manifest.entries.length,modelCalls:0,profileVersion:P.version}));
