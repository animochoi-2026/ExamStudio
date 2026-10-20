'use strict';
// Local replay of a read-only live snapshot. No provider or DB write client.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const C=require('../app/difficulty-v122/canonical.cjs'),Native=require('../app/difficulty-v122/native-source.cjs');
const I=require('../app/difficulty-v122/input.cjs'),S=require('../app/difficulty-v122/source.cjs');
const Schema=require('../app/difficulty-v122/schema.cjs'),K=require('../app/difficulty-v122/contracts.cjs');
const versions=require('../app/difficulty-v122/candidate-versions.json').versions;
const root=path.resolve(__dirname,'..'),base=path.join(root,'artifacts/difficulty-v122-rc1'),out=process.argv[2]?path.resolve(process.argv[2]):base;
const cache=require('./difficulty-v122-cache.cjs').createCache(),read=cache.read;
async function main(){
 fs.mkdirSync(out,{recursive:true});
 const snapshot=path.join(base,'corpus-snapshot');
 const pages=fs.readdirSync(snapshot).filter(n=>/^page-\d+\.json$/.test(n)).sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0]));
 const rows=pages.flatMap(n=>JSON.parse(fs.readFileSync(path.join(snapshot,n),'utf8')));
 // Supplement the immutable corpus snapshot with the actual read-only approval
 // envelopes; the authorization label alone is deliberately insufficient.
 const reviewsFile=path.join(base,'approved-review-snapshot.json');
 const reviewRows=fs.existsSync(reviewsFile)?JSON.parse(fs.readFileSync(reviewsFile,'utf8')).rows:[];
 for(const row of rows){
  const review=reviewRows.find(r=>r.question_id===row.question_id&&r.revision_id===row.revision_id);
  if(review)row.metadata.difficulty.v121Active=review.active;
 }
 assert.equal(new Set(rows.map(r=>r.question_id)).size,rows.length,'duplicate latest question');
 const results=[],globalIds=new Set(),sizes=[],counts=[],imageSizes=[],imageCounts=[];
 const failures=[];let current=null;
  for(const catalog of rows){
   try{
   current=catalog;
   const data=catalog.files.find(f=>f.role==='data');
   if(!data)throw Error('native_source_missing');
   const bundle=JSON.parse(read(data));
   const source=await Native.fromNative(catalog,bundle,read);
   const prepared=I.prepare(source),repeat=I.prepare(source);
   S.verify(prepared.registry);
   assert.equal(C.hash(prepared),C.hash(repeat),'repeated_input_hash_mismatch');
   for(const entry of prepared.registry.entries){
    assert(!globalIds.has(entry.id),'source ID collision');globalIds.add(entry.id);
    if(entry.allowed_target_ids)assert(entry.allowed_target_ids.every(id=>prepared.registry.targets.some(t=>t.id===id)),'unknown target source');
   }
   const schema=Schema.forRegistry(prepared.registry);
   assert(schema.properties.viable_routes.items.properties.approved_route_id.enum.length,'dynamic schema route IDs missing');
   const identity=K.identity(prepared,versions),key=K.evaluationKey(identity);
   const payloadBytes=Buffer.byteLength(C.json(prepared.payload)),schemaBytes=Buffer.byteLength(C.json(schema));
   const imageBytes=source.images.reduce((n,i)=>n+i.bytes,0),imageCount=source.images.length;
   sizes.push(payloadBytes);counts.push(prepared.registry.entries.length);imageSizes.push(imageBytes);imageCounts.push(imageCount);
   results.push({question_id:catalog.question_id,revision_id:catalog.revision_id,source:catalog.metadata.source,
    ...prepared.identities,reuse_key:key,schema_hash:C.hash(schema),payload_bytes:payloadBytes,schema_bytes:schemaBytes,
    source_id_count:prepared.registry.entries.length,image_count:imageCount,image_bytes:imageBytes,
    ...(prepared.source_provenance?{source_provenance:prepared.source_provenance}:{})});
   }catch(e){
  failures.push({question_id:current?.question_id,revision_id:current?.revision_id,source:current?.metadata.source,
   error:e.message,solution_review:current?.metadata.reviews?.solution?.status,
   answer_review:current?.metadata.reviews?.answer?.status,
   approved_review_authorization:current?.metadata.approved_review_authorization||null});
   }
 }
 const stats=values=>values.length?{max:Math.max(...values),p95:[...values].sort((a,b)=>a-b)[Math.ceil(values.length*.95)-1]}:null;
 const report={at:new Date().toISOString(),selection:
  'Latest committed nonarchived; approved solution OR passed answer OR explicitly authorized production review envelope',
  total:rows.length,input_build_success:results.length,input_build_failure:failures.length,
  untested:0,complete:!failures.length,first_failure:failures[0]||null,failures,
  payload_bytes:stats(sizes),source_ids:stats(counts),image_bytes:stats(imageSizes),image_count:stats(imageCounts),
  limits_check:'not yet completed',actualAIcalls:0,productionWrites:0,computerUse:0,
  snapshot_pages:pages.map(n=>({file:n,sha256:C.bytesHash(fs.readFileSync(path.join(snapshot,n)))})),results};
 fs.writeFileSync(path.join(out,'corpus-preflight.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({...report,results:undefined,snapshot_pages:undefined},null,2));
 if(failures.length)process.exitCode=1;
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
