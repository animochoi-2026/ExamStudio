// Values stay in memory. Output counts and offending paths only, never values.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const names=['SUPABASE_ACCESS_TOKEN','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_RUNTIME_ACCESS_KEY_ID','R2_RUNTIME_SECRET_ACCESS_KEY','MIGRATION_STATE_KEY','SUPABASE_READ_KEY','SOURCE_S3_ACCESS_KEY_ID','SOURCE_S3_SECRET_ACCESS_KEY'];
const secrets=names.map(n=>process.env[n]).filter(v=>v&&v.length>=16).map(v=>Buffer.from(v));
if(secrets.length<3)throw Error('AUDIT_VAULT_NOT_LOADED');
const staged=execFileSync('git',['diff','--cached','--name-only','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const tracked=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const files=new Set([...staged,...tracked]);function walk(d){if(!fs.existsSync(d))return;for(const x of fs.readdirSync(d)){const p=path.join(d,x),s=fs.lstatSync(p);if(s.isSymbolicLink())continue;if(s.isDirectory())walk(p);else files.add(p);}}
walk('tests/artifacts/r2/web');walk('builds/2026-10-10T12-28-17-910Z-d9b098e6/ExamStudio-win32-x64/resources/app');
const matches=[];for(const file of files){const bytes=fs.readFileSync(file);if(secrets.some(s=>bytes.includes(s)))matches.push(file);}
const forbidden=staged.filter(p=>/(?:^|\/)(?:node_modules|builds|artifacts|\.private)(?:\/|$)|\.clixml$|(?:^|\/)\.env$/.test(p));
const result={stagedFiles:staged.length,trackedFiles:tracked.length,scannedFiles:files.size,credentialValuesChecked:secrets.length,matches,forbiddenArtifacts:forbidden};
fs.writeFileSync('tests/artifacts/r2/candidate-secret-audit.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(matches.length||forbidden.length)process.exitCode=1;
