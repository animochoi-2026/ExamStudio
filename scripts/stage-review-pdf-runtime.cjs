'use strict';
// Pinned dependency, copied into the existing same-origin runtime staging path.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'..'),source=path.join(root,'node_modules/pdfjs-dist'),target=path.join(root,'web-bank/runtime/pdfjs');
fs.mkdirSync(target,{recursive:true});
for(const [from,to] of [['build/pdf.min.mjs','pdf.mjs'],['build/pdf.worker.min.mjs','pdf.worker.mjs'],['LICENSE','LICENSE']])fs.copyFileSync(path.join(source,from),path.join(target,to));
for(const name of ['cmaps','standard_fonts','wasm'])fs.cpSync(path.join(source,name),path.join(target,name),{recursive:true});
function hashes(dir){return Object.fromEntries(fs.readdirSync(dir,{withFileTypes:true}).filter(e=>e.name!=='manifest.json').sort((a,b)=>a.name.localeCompare(b.name)).flatMap(e=>e.isDirectory()?Object.entries(hashes(path.join(dir,e.name))).map(([k,v])=>[e.name+'/'+k,v]):[[e.name,crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,e.name))).digest('hex')]]));}
fs.writeFileSync(path.join(target,'manifest.json'),JSON.stringify({version:JSON.parse(fs.readFileSync(path.join(source,'package.json'))).version,files:hashes(target)},null,2)+'\n');
