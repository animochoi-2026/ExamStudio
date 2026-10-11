// Verify encrypted durable inventory readback; print aggregates only.
import {readFile,writeFile} from 'node:fs/promises';
import {s3Store} from './adapters.mjs';
import {unseal,sha} from './core.mjs';
const e=process.env,job=e.MIGRATION_JOB;
try{
 if(!/^[a-z0-9-]{1,64}$/.test(job||''))throw Error('INVALID_JOB');
 if(e.MIGRATION_REPORT_PROGRESS==='true'){
  const state=unseal(await readFile(new URL(`./.private/${job}/state.enc`,import.meta.url)),e.MIGRATION_STATE_KEY);
  const since=e.MIGRATION_PROGRESS_SINCE;
  console.log(JSON.stringify({job,checkedObjects:Object.keys(state.files||{}).length,...(since?{checkedThisPhase:Object.values(state.files||{}).filter(f=>Date.parse(f.verifiedAt)>=Date.parse(since)).length}:{}),failures:state.failures?.length||0,complete:state.complete,verified:state.verified}));
  process.exit(0);
 }
 const local=await readFile(new URL(`./.private/${job}/manifest.enc`,import.meta.url));
 const target=s3Store({endpoint:e.R2_ENDPOINT,region:'auto',bucket:e.R2_BUCKET,accessKeyId:e.R2_ACCESS_KEY_ID,secretAccessKey:e.R2_SECRET_ACCESS_KEY});
 const remote=await target.get(`__migration/${job}/manifest.enc`);
 if(sha(local)!==sha(remote.body))throw Error('JOURNAL_READBACK_MISMATCH');
 const m=unseal(remote.body,e.MIGRATION_STATE_KEY);
 const report={job,measuredAt:m.measuredAt,...m.summary,logicalFiles:m.referenceCheck.logicalFiles,referenceFailures:m.referenceCheck.failures.length,referenceCheckPassed:m.referenceCheck.ok,targetSummary:m.targetSummary,writesFrozen:m.writesFrozen,inventorySHA256:m.inventorySHA256,encryptedRemoteReadback:true,sourceContentDownloaded:false};
 await writeFile('tests/artifacts/r2/preflight-summary.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch{console.error('PREFLIGHT_REPORT_FAILED');process.exitCode=1;}
