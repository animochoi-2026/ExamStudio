// Official CLI raw download/unbundle, isolated output; never deploys a function.
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
if(!process.env.SUPABASE_ACCESS_TOKEN)throw Error('SCOPED_READ_PAT_REQUIRED');
const dir=resolve('tests/artifacts/r2/deployed-bank-verify');
await mkdir(resolve(dir,'supabase/functions'),{recursive:true});
const linuxDir='/mnt/'+dir[0].toLowerCase()+dir.slice(2).replaceAll('\\','/');
const env={...process.env,WSLENV:[process.env.WSLENV,'SUPABASE_ACCESS_TOKEN'].filter(Boolean).join(':')};
const child=spawn('wsl',['-d','podman-lossless-trial-20261007','-u','root','--','/tmp/examstudio-r2-cli/supabase','functions','download','bank-verify','--project-ref','bjxxqdbftefughjkcrqj','--workdir',linuxDir],{env,stdio:['ignore','pipe','pipe']});
let log='';child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);
child.on('close',code=>{console.log(JSON.stringify({operation:'read deployed bank-verify source via official CLI',exitCode:code,outputDirectory:dir,diagnostic:log.replaceAll(process.env.SUPABASE_ACCESS_TOKEN,'[REDACTED]').split('\n').filter(x=>/error|failed|denied|status|not found|permission/i.test(x)).slice(-4).map(x=>x.slice(0,400)),bundleRetrievalError:/retrieve.*bundle|bundle.*retrieve/i.test(log),dockerError:/docker.*not found|podman.*not found|connect.*docker/i.test(log)}));process.exitCode=code;});
