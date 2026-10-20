'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),base=path.join(root,'artifacts/difficulty-v122-rc1'),out=path.resolve(process.argv[2]);
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const Schema=require('../app/difficulty-v122/schema.cjs'),I=require('../app/difficulty-v122/input.cjs'),Native=require('../app/difficulty-v122/native-source.cjs');
async function main(){
 const cache=require('./difficulty-v122-cache.cjs').createCache(),snapshot=path.join(base,'corpus-snapshot');
 const rows=fs.readdirSync(snapshot).filter(n=>/^page-\d+\.json$/.test(n)).flatMap(n=>read(path.join(snapshot,n)));
 const reviews=read(path.join(base,'approved-review-snapshot.json')).rows,schemas=[Schema.schema];
 for(const row of rows){
  const review=reviews.find(r=>r.question_id===row.question_id&&r.revision_id===row.revision_id);
  if(review)row.metadata.difficulty.v121Active=review.active;
  const source=await Native.fromNative(row,JSON.parse(cache.read(row.files.find(f=>f.role==='data'))),cache.read);
  schemas.push(Schema.forRegistry(I.prepare(source).registry));
 }
 fs.writeFileSync(path.join(out,'schemas.json'),JSON.stringify(schemas));
 fs.writeFileSync(path.join(out,'schema-export.json'),JSON.stringify({
  total:schemas.length,schema_module_sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'app/difficulty-v122/schema.cjs'))).digest('hex')}));
 console.log(JSON.stringify({schemas:schemas.length,AIcalls:0}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
