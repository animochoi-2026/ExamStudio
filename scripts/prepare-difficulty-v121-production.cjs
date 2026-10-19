'use strict';
const fs=require('node:fs'),path=require('node:path'),I=require('../app/difficulty-v12/input.cjs');
const root=path.resolve(__dirname,'../artifacts/difficulty-v121'),out=path.join(root,'production-20261019');
const p=require('../app/difficulty-v121/activation.cjs').prepare(root);
fs.mkdirSync(out,{recursive:true});const file=path.join(out,'prepared.json');
if(fs.existsSync(file)){if(I.hash(JSON.parse(fs.readFileSync(file)))!==I.hash(p))throw Error('Frozen production preparation differs');}
else fs.writeFileSync(file,JSON.stringify(p,null,2),{flag:'wx'});
console.log(JSON.stringify({file,batchId:p.batchId,hash:I.hash(p),...p.summary}));
