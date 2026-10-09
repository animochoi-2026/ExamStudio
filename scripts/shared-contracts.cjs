'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const source=path.resolve(__dirname,'../app');
// Pure data and layout contracts shared by web, desktop and their workers.
// Desktop workflow, store and UI modules deliberately remain platform-specific.
const files=['solution-print.cjs','bank-exam-model.cjs','exam-layout.js','pdf-pagination.cjs','print-assets.cjs','paper-form-model.cjs','difficulty-access.cjs','difficulty-access-prompt.json','difficulty-assessment.cjs','difficulty-policy.cjs','difficulty-policy-legacy.cjs','rubric-assert.cjs','source-inventory.cjs','exam-scope-allocation.cjs','curriculum.js','bank-question-types.cjs','bank-search-filters.cjs','question-types.cjs','question-type-catalog.json'];
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const manifest=()=>Object.fromEntries(files.map(name=>[name,digest(fs.readFileSync(path.join(source,name)))]));
function stage(directory){const hashes=manifest();fs.mkdirSync(directory,{recursive:true});for(const name of files)fs.copyFileSync(path.join(source,name),path.join(directory,name));fs.writeFileSync(path.join(directory,'shared-contracts.json'),JSON.stringify(hashes,null,2));return verify(directory);}
function verify(directory){const expected=manifest(),actual=JSON.parse(fs.readFileSync(path.join(directory,'shared-contracts.json'),'utf8'));for(const [name,hash]of Object.entries(expected))if(actual[name]!==hash||digest(fs.readFileSync(path.join(directory,name)))!==hash)throw Error('공통 데이터·배치 코드가 서로 다릅니다: '+name);return expected;}
module.exports={files,manifest,stage,verify};
