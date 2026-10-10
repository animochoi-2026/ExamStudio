'use strict';
// Compare schema-only snapshots captured before/after the approved installation.
const fs=require('node:fs'),assert=require('node:assert/strict');
const dir='tests/artifacts/r2-freeze/';
const before=JSON.parse(fs.readFileSync(dir+'production-preapply.json','utf8'));
const after=JSON.parse(fs.readFileSync(dir+'production-after-install.json','utf8')).snapshot;
function canon(v){if(Array.isArray(v))return JSON.stringify(v.map(canon).sort());if(v&&typeof v==='object')return JSON.stringify(Object.fromEntries(Object.keys(v).sort().map(k=>[k,canon(v[k])])));return JSON.stringify(v);}
const tables=after.tables.map(t=>({...t,triggers:(t.triggers||[]).filter(x=>x.name!=='bank_r2_freeze_write')}));
const beforeTables=before.tables.map(t=>({...t,triggers:t.triggers||[]}));
const checks={
 tablesColumnsIndexesConstraintsRlsAclsExistingTriggersUnchanged:canon(tables)===canon(beforeTables),
 storagePoliciesUnchanged:canon(after.policies)===canon(before.policies),
 bucketSettingsUnchanged:canon(after.storage_bucket)===canon(before.storage_bucket),
 defaultAclsUnchanged:canon(after.default_acl)===canon(before.default_acl),
 existingFunctionOwnersAclsUnchanged:canon(after.functions.map(f=>({signature:f.signature,owner:f.owner,acl:f.acl})))===canon(before.functions.map(f=>({signature:f.signature,owner:f.owner,acl:f.acl})))
};
fs.writeFileSync(dir+'impact-checks.json',JSON.stringify(checks,null,2)+'\n');
console.log(JSON.stringify(checks));assert(Object.values(checks).every(Boolean));
