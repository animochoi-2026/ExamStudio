'use strict';
// Parent only launches Node tests. The preload guards external I/O and workers.
// Node's Permission Model disables fsync even with full filesystem permission;
// use the preload so the real atomic checkpoint implementation is exercised.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),guard=path.join(root,'tests/offline-guard.cjs');
const files=process.argv.slice(2);
if(!files.length)files.push(...fs.readdirSync(path.join(root,'tests')).filter(f=>f.endsWith('.test.cjs')).map(f=>'tests/'+f));
let failed=0;
const output=process.env.EXAMSTUDIO_TEST_OUTPUT?path.resolve(process.env.EXAMSTUDIO_TEST_OUTPUT):null,summary=[];
if(output)fs.mkdirSync(output,{recursive:true});
for(const f of files){
 const full=path.resolve(root,f);
 if(!full.startsWith(path.join(root,'tests')+path.sep)||!full.endsWith('.test.cjs')||!fs.existsSync(full))throw Error('Expected a repository test file');
 const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/API_KEY|ACCESS_TOKEN|AUTH_TOKEN|SERVICE_ROLE|SECRET|COOKIE|^OPENAI_|^NODE_OPTIONS$/.test(k)));
 const git=cp.spawnSync('where.exe',['git'],{encoding:'utf8',windowsHide:true});
 env.EXAMSTUDIO_READONLY_GIT=(git.stdout||'').trim().split(/\r?\n/)[0];
 const result=cp.spawnSync(process.execPath,['--test-reporter=tap','--require',guard,full],
  {cwd:root,env,stdio:output?'pipe':'inherit',encoding:'utf8',maxBuffer:8*1024*1024,windowsHide:true,timeout:180000});
 if(output){
  const log=(result.stdout||'')+(result.stderr||'');
  fs.writeFileSync(path.join(output,path.basename(f)+'.log'),log);
  const count=key=>{const match=log.match(new RegExp('^# '+key+' (\\d+)','m'));return match?Number(match[1]):null;};
  summary.push({file:f,exitCode:result.status,error:result.error?.code||null,tests:count('tests'),passed:count('pass'),failed:count('fail'),cancelled:count('cancelled'),skipped:count('skipped')});
  fs.writeFileSync(path.join(output,'test-process-summary.json'),JSON.stringify(summary,null,2)+'\n');
  process.stdout.write(JSON.stringify(summary.at(-1))+'\n');
 }
 if(result.status!==0){failed++;process.stderr.write('Offline test failed: '+f+' ('+(result.error?.code||result.status)+')\n');}
}
process.exitCode=failed?1:0;
