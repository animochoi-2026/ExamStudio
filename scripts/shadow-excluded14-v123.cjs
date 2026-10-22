'use strict';
require('../tests/offline-guard.cjs');
const H=require('./v123-artifacts.cjs'),{fs,assert,C,read,sha}=H,path=require('path');
const dir=path.resolve(__dirname,'../artifacts/excluded14-evaluation-20261023'),plan=read(dir+'/preparation-r2.json'),index=read(plan.prior+'/index.json'),rows=[];
for(const x of index){const row={question_id:x.question_id,revision_id:x.revision_id};try{const r=read(plan.prior+'/'+x.record),p=H.prepare(x.question_id);H.identity(p.identities,r.input_identity);const n=H.normalized(r,p),v=H.V.evaluate(n.raw,p.payload);assert(v.validation.valid,v.validation.detail);assert.equal(C.hash(v.computed),C.hash(n.computed));assert.equal(v.computed.score,x.score);assert.equal(v.computed.problem_tier,x.tier);Object.assign(row,{classification:'N',record_sha256:sha(plan.prior+'/'+x.record),computed_hash:C.hash(v.computed)});}catch(e){Object.assign(row,{classification:'I',error:e.message});}rows.push(row);}
const protectedFiles=read(dir+'/protected-files-r2.json');for(const[f,h]of Object.entries(protectedFiles))assert.equal(sha(f),h);
const counts={N:rows.filter(r=>r.classification==='N').length,I:rows.filter(r=>r.classification==='I').length,S:0};fs.writeFileSync(dir+'/shadow1252.json',C.json({at:new Date().toISOString(),counts,rows,ai_calls:0}),{flag:'wx'});console.log(JSON.stringify({counts,errors:rows.filter(r=>r.error).slice(0,10)}));
