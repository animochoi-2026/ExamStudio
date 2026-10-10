'use strict';
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
const args=['-d','podman-lossless-trial-20261007','-u','root','--','podman','exec','-i','examstudio-freeze-prep-test','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'];
const sql=q=>cp.execFileSync('wsl',args,{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
(async()=>{
 sql(fs.readFileSync('supabase/migrations/20261010132634_r2_freeze_preparation_only.sql','utf8'));
 const child=cp.spawn('wsl',args,{windowsHide:true,stdio:['pipe','pipe','pipe']});
 const done=new Promise((res,rej)=>{child.on('error',rej);child.on('close',c=>c===0?res():rej(Error('Local transaction failed')));});
 const ready=new Promise((res,rej)=>{child.stdout.on('data',b=>{if(b.toString().includes('LOCK_READY'))res();});child.on('error',rej);});
 child.stderr.resume();
 child.stdin.end("begin;update bank_personal set id=id where false;select 'LOCK_READY';select pg_sleep(3);commit;");
 await ready;
 let denied=false;try{sql("set lock_timeout='300ms';select bank_storage_private.set_frozen(true)");}catch(e){denied=/lock timeout/.test(String(e.stderr));}
 assert.equal(denied,true);await done;
 assert.equal(JSON.parse(sql('select public.bank_storage_status()')).frozen,false);
 sql(fs.readFileSync('docs/r2/freeze-preparation-rollback.sql','utf8'));
 const p='tests/artifacts/r2-freeze/sql-test-result.json',result=JSON.parse(fs.readFileSync(p,'utf8'));
 result.checks=result.checks.map(x=>x.replace('including service role','under DB owner execution'));
 result.checks.push('Freeze transition waits for in-flight metadata transaction; timeout leaves state unfrozen');
 result.passed=result.checks.length;
 fs.writeFileSync(p,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({passed:result.passed,newCheck:result.checks.at(-1),rollback:true}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
