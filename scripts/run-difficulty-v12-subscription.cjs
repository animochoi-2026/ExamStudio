'use strict';
const fs=require('node:fs'),path=require('node:path');
const R=require('../app/difficulty-v12/subscription.cjs');
(async()=>{
 const [manifestFile,outputRoot,mode]=process.argv.slice(2);
 if(!manifestFile||!outputRoot)throw Error('Usage: node scripts/run-difficulty-v12-subscription.cjs <30-item-manifest.json> <private-result-directory> [--run-approved]');
 const entries=JSON.parse(fs.readFileSync(manifestFile,'utf8')),manifestHash=R.validatePilot(entries);
 R.assertSubscription(process.env.CODEX_EXECUTABLE||'codex');
 console.log(JSON.stringify({manifestHash,items:entries.length,evaluationVersion:R.evaluationVersion,settings:R.settings,mode:mode==='--run-approved'?'run':'prepare-only'}));
 if(mode!=='--run-approved')return;
 // Sequential evaluation is unrelated to the desktop user's upload concurrency.
 for(const entry of entries){const r=await R.runOne(entry,{outputRoot:path.resolve(outputRoot),executable:process.env.CODEX_EXECUTABLE||'codex'});console.log(JSON.stringify({id:entry.id,status:r.status,tier:r.computed.problem_tier,score:r.computed.score}));if(r.status==='failed'&&!r.evidence?.completed)break;}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
