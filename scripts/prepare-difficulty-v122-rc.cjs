'use strict';
// Preparation only: no model, database, browser, or deployment clients.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/difficulty-v122-rc1');
const authority=JSON.parse(fs.readFileSync('C:/Users/reals/Desktop/문제생성기/.git/examstudio-current.json','utf8'));
const parents=path.join(authority.checkout,'artifacts/difficulty-v121');
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const git=(...args)=>cp.execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
fs.mkdirSync(out,{recursive:true});
function save(file,value){fs.writeFileSync(path.join(out,file),JSON.stringify(value,null,2)+'\n',{flag:'wx'});}
const expected={
 'canonical-prompt.txt':'4833fd58dfbdee9002e7f67fbaa1eb39cfc2e9bbc310b86ef12b4fe91371a97c',
 'schema.json':'aabb012ec95298f59753369a7cf2b6838a78f3db4b5dd7252fe58df1386d1ce0',
 'schema.cjs':'e131749dac6a90ad1350e550dc9522489cc03744196938aae07d56f64707b6b8',
 'scorer.cjs':'785ec75707a7cce1d706968508d6a5309c5d9a46de931715bb3bb03676546842',
 'projection.cjs':'bb2fbf8b4232ad613744b009a93101b7cebe9f7451ed25da72e6fc022dfb67b2',
 'validate.cjs':'53caf923a4525a8d9e1709fb2b87e0fcaa70a0d3404adbe2410e34b7fd87fd88',
 'runner.cjs':'c2734a9ea51c07c0c4a90c06fda32e6e8cf9c46c454c09be0113291fe56de492'};
const parent=path.join(parents,'shindong-m2-three-stage-20261020');
const checks=Object.entries(expected).map(([file,sha256])=>({file,expected:sha256,actual:hash(path.join(parent,file))}));
save('start.json',{at:new Date().toISOString(),repository:git('rev-parse','--git-common-dir'),worktree:root,branch:git('branch','--show-current'),head:git('rev-parse','HEAD'),authority,
 runtime:process.version,packageManager:'npm 11.17.0',lockfileHash:hash(path.join(root,'package-lock.json')),
 initialGitStatus:'',initialGitStatusObservedBeforeEdits:true,preparationStatus:git('status','--porcelain=v1'),parentChecks:checks,AIcalls:0,productionWrites:0});
for(const c of checks)if(c.actual!==c.expected)throw Error('parent hash mismatch '+c.file);
const baseline=path.join(out,'baseline');
for(const folder of ['shindong-m2-three-stage-20261020','shindong-luna-reference-validator-execution-audit-20261020']){
 fs.cpSync(path.join(parents,folder),path.join(baseline,folder),{recursive:true,errorOnExist:true,force:false});
}
fs.cpSync(path.join(parents,'shingu-direct-routing-fixed-20261020/check-deps/node_modules/acorn'),
 path.join(baseline,'shingu-direct-routing-fixed-20261020/check-deps/node_modules/acorn'),{recursive:true,errorOnExist:true,force:false});
console.log(JSON.stringify({out,parentChecks:checks.length,passed:checks.every(x=>x.actual===x.expected),AIcalls:0}));
