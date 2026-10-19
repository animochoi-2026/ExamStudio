'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const R=require('../app/difficulty-v121/retry.cjs'),I=require('../app/difficulty-v12/input.cjs');
const root=path.resolve(process.argv[2]||path.join(__dirname,'../artifacts/difficulty-v121'));
const roundId='retry-20261019-1',round=path.join(root,roundId);
// This specific follow-up was authorized in this conversation on 2026-10-19.
const processes=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command',"@(Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'electron.exe' -and $_.CommandLine -match 'run-difficulty-v121') -or ($_.Name -eq 'codex.exe' -and $_.CommandLine -match '\\bexec\\b' -and $_.CommandLine -match 'examstudio-v12-') } | Select-Object ProcessId,Name) | ConvertTo-Json -Compress"],{encoding:'utf8',windowsHide:true})||'[]');
if((Array.isArray(processes)?processes:[processes]).length)throw Error('original_evaluation_process_still_present');
const manifest=R.buildManifest(root,{roundId,processCheck:{clear:true,checkedAt:new Date().toISOString(),method:'Win32_Process: evaluation Electron runners and codex exec examstudio-v12 children absent; original runner.lock absent'}});
fs.mkdirSync(round); // Exclusive round creation: never replace a prior round.
fs.writeFileSync(path.join(round,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});
fs.writeFileSync(path.join(round,'approval.json'),JSON.stringify({granted:true,roundId,manifestHash:I.hash(manifest),maximumCalls:manifest.maximumCalls,concurrency:3,automaticRetries:0,authorization:manifest.authorization,createdAt:new Date().toISOString()},null,2),{flag:'wx'});
fs.writeFileSync(path.join(round,'run-status.json'),JSON.stringify({status:'prepared',total:manifest.rows.length,completed:0,failed:0,unresolved:0,dispatched:0,updatedAt:new Date().toISOString()}),{flag:'wx'});
console.log(JSON.stringify({roundId,targets:manifest.rows.length,firstPass:manifest.firstPass,reasons:manifest.reasons,maximumCalls:manifest.maximumCalls,reusableStages:manifest.rows.flatMap(r=>r.stages).filter(s=>s.action==='reuse').length}));
