// Isolated local runtime only. Secrets travel over stdin, never an env file.
import {execFileSync,spawn} from 'node:child_process';
import path from 'node:path';
const prefix=['-d','podman-lossless-trial-20261007','-u','root','--'];
const work='/tmp/examstudio-r2-local',cli='/tmp/examstudio-r2-cli/supabase';
try{
 const source=execFileSync('wsl',[...prefix,'wslpath','-u',path.resolve('supabase/functions').replaceAll('\\','/')],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 execFileSync('wsl',[...prefix,'cp','-a',source,work+'/supabase/'],{stdio:['ignore','pipe','pipe']});
 // Process-scoped Podman override; never modifies global/user engine settings.
 execFileSync('wsl',[...prefix,'tee',work+'/edge-containers.conf'],{input:'[containers]\nlog_driver="k8s-file"\n',stdio:['pipe','pipe','pipe']});
 const config=['BANK_STORAGE_PROVIDER=r2','BANK_FILE_ORIGINS=http://localhost:4173'];
 for(const key of ['R2_ENDPOINT','R2_BUCKET','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY']){
  const value=process.env[key];if(!value||/[\r\n]/.test(value))throw Error('CONFIG_REQUIRED');config.push(key+'='+value);
 }
 const child=spawn('wsl',[...prefix,'env','CONTAINERS_CONF_OVERRIDE='+work+'/edge-containers.conf',cli,'functions','serve','--workdir',work,'--env-file','/dev/stdin','--no-verify-jwt'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
 child.stdin.on('error',()=>{});child.stdin.end(config.join('\n')+'\n');
 // Runtime output is not safe to echo: it may contain request data or env values.
 child.stdout.resume();child.stderr.resume();
 child.on('error',()=>{console.error('LOCAL_EDGE_START_FAILED');process.exitCode=1;});
 child.on('close',code=>{console.log(JSON.stringify({localEdgeExit:code}));process.exitCode=code||0;});
 console.log('LOCAL_EDGE_START_REQUESTED_NO_SECRET_FILE');
}catch{console.error('LOCAL_EDGE_SETUP_FAILED');process.exitCode=1;}
