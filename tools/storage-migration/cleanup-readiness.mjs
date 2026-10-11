// Read-only follow-up: reuse prior content verification; never copy/delete/freeze.
import fs from 'node:fs';
import path from 'node:path';
import {unseal,sha} from './core.mjs';
import {s3Store} from './adapters.mjs';
const job='cutover-20261011-b',backup='backup-20261011-0d020163-87d5-4cb5-ac81-8b91a419e706';
const key=process.env.MIGRATION_STATE_KEY,root='tools/storage-migration/.private';
try{
 const read=(dir,name)=>unseal(fs.readFileSync(path.join(root,dir,name+'.enc')),key);
 const manifest=read(job,'manifest'),state=read(job,'state'),b=read(backup,'manifest');
 if(!state.complete||!state.verified||state.failures.length)throw Error('PRIOR_VERIFICATION_NOT_SUCCESSFUL');
 let decryptedParts=1;
 for(const part of b.parts){const bytes=fs.readFileSync(path.join(root,backup,part.name+'.enc'));if(sha(bytes)!==part.sha256)throw Error('BACKUP_PART_MISMATCH');unseal(bytes,key);decryptedParts++;}
 const r=await fetch('https://api.supabase.com/v1/projects/bjxxqdbftefughjkcrqj/database/query',{method:'POST',headers:{Authorization:'Bearer '+process.env.SUPABASE_ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({read_only:true,query:`select (select coalesce(jsonb_agg(jsonb_build_object('key',name,'size',(metadata->>'size')::bigint) order by name),'[]') from storage.objects where bucket_id='question-bank') objects,(select count(*) from public.bank_entries where kind='file' and created_at > '${b.at}'::timestamptz) post_backup_files,(select coalesce(sum(size),0) from public.bank_entries where kind='file' and created_at > '${b.at}'::timestamptz) post_backup_bytes`}),signal:AbortSignal.timeout(30000)});
 if(!r.ok){const err=await r.json().catch(()=>({}));console.error(JSON.stringify({metadataDiagnostic:String(err.message||'').replace(/sbp_[A-Za-z0-9_-]+|sb_secret_[A-Za-z0-9_-]+/g,'[REDACTED]').slice(0,300),backupAt:b.at}));throw Error('READONLY_METADATA_HTTP_'+r.status);}
 const [current]=await r.json(),old=new Map(manifest.rows.map(x=>[x.key,x.size]));
 const matches=current.objects.filter(x=>old.get(x.key)===Number(x.size));
 const remote=s3Store({endpoint:'https://7b3f670b94ea81a6649c3529b108ee8b.r2.cloudflarestorage.com',region:'auto',bucket:'examstudio-files-prep',accessKeyId:process.env.R2_RUNTIME_ACCESS_KEY_ID,secretAccessKey:process.env.R2_RUNTIME_SECRET_ACCESS_KEY,readOnly:true});
 const remoteManifest=await remote.get('__migration/'+backup+'/manifest.enc');
 const remoteBackup=unseal(remoteManifest.body,key);
 if(remoteBackup.job!==backup||sha(remoteManifest.body)!==sha(fs.readFileSync(path.join(root,backup,'manifest.enc'))))throw Error('REMOTE_BACKUP_MANIFEST_MISMATCH');
 const report={at:new Date().toISOString(),job,priorVerificationAt:state.finishedAt,priorVerifiedObjects:manifest.rows.length,priorVerifiedBytes:manifest.summary.bytes,metadataMatchedCleanupCandidates:matches.length,candidateBytes:matches.reduce((n,x)=>n+Number(x.size),0),sourceObjectsNow:current.objects.length,unmatchedSourceObjects:current.objects.length-matches.length,missingPriorObjects:manifest.rows.length-matches.length,state:current.state,backup,backupAt:b.at,localEncryptedPartsDecryptable:decryptedParts,remoteEncryptedManifestReadback:true,postBackupLogicalFiles:Number(current.post_backup_files),postBackupLogicalBytes:Number(current.post_backup_bytes),postCutoverIndependentBackupConfirmed:false,recoveryKeyUsableOnCurrentWindowsUser:true,sourceContentsDownloaded:false,deleted:false,frozenChanged:false};
 fs.writeFileSync('tests/artifacts/r2-freeze/cleanup-readiness-20261011.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(e){console.error(JSON.stringify({success:false,code:/^[A-Z0-9_]+$/.test(e.message)?e.message:'READINESS_CHECK_FAILED'}));process.exitCode=1;}
