'use strict';
// Read-only replay of stored final raw JSON. Never calls AI or writes evaluations.
const fs=require('node:fs'),crypto=require('node:crypto');
const S=require('../app/difficulty-v121/scorer.cjs'),Schema=require('../app/difficulty-v121/schema.cjs'),I=require('../app/difficulty-v12/input.cjs');
function audit(p){
 const increment=(o,k)=>o[k]=(o[k]||0)+1;
 const out={total:p.items.length,tiers:Object.fromEntries(Array.from({length:6},(_,i)=>['T'+i,0])),t3Routing:{ordinary:{},review:{}},promotions:{assembly:0,literacy:0,execution:0,multiple:0,baseT3Promoted:0,baseT4:0,baseT5:0},mismatches:{tier:[],score:[],base:[],promotions:[],route:[],input:[],routing:[],promotionApplication:[],scorerVersion:[]},anchors:[],rows:[],aiCalls:0};
 out.resultSetHash=crypto.createHash('md5').update([...p.items].sort((a,b)=>a.questionId.localeCompare(b.questionId)).map(x=>I.hash(x.result)).join(',')).digest('hex');
 for(const x of p.items){
  const r=x.result,c=r.computed,g=c.promotions||[],review=!!r.production_review_envelope,id=x.questionId;
  increment(out.tiers,r.final_tier);
  if(r.final_tier==='T3')increment(out.t3Routing[review?'review':'ordinary'],[r.final_stage,r.final_model,r.final_reasoning_effort].join('/'));
  for(const k of ['assembly','literacy','execution'])if(g.includes(k))out.promotions[k]++;
  if(g.length>1)out.promotions.multiple++;
  if(c.base_tier==='T3'&&g.length)out.promotions.baseT3Promoted++;
  if(c.base_tier==='T4')out.promotions.baseT4++;
  if(c.base_tier==='T5')out.promotions.baseT5++;
  if(!review&&r.final_stage===1&&Number(r.final_tier.slice(1))>2)out.mismatches.routing.push(id);
  if(Number(r.final_tier.slice(1))!==Math.min(5,Number(c.base_tier?.slice(1))+g.length))out.mismatches.promotionApplication.push(id);
  if(c.scorer_version!==S.version)out.mismatches.scorerVersion.push(id);
  try{
   const raw=r['stage'+r.final_stage+'_raw_json'];Schema.structural(raw);
   const v=S.scoreProblem(raw.viable_routes,raw.literacy_high);
   if(v.status!=='complete')throw Error(v.reason);
   for(const [key,a,b]of [['tier',v.problem_tier,r.final_tier],['score',v.score,r.final_score],['base',v.base_tier,c.base_tier],['promotions',v.promotions,c.promotions],['route',v.selected_route_id,c.selected_route_id]])if(JSON.stringify(a)!==JSON.stringify(b))out.mismatches[key].push({id,stored:b,recalculated:a});
  }catch(e){out.mismatches.input.push({id,error:e.message});}
  const row={id,displayId:x.snapshot.display_id??x.snapshot.metadata?.displayId??null,score:r.final_score,tier:r.final_tier,base:c.base_tier,promotions:g,stage:r.final_stage,model:r.final_model,effort:r.final_reasoning_effort,scorer:c.scorer_version,review};out.rows.push(row);
 }
 // These are textbook reference numbers, not database UUIDs. Scan stored source
 // identifiers, not body/solution numbers, to avoid accidental numeric matches.
 const has=(v,id)=>v&&typeof v==='object'?Object.values(v).some(x=>has(x,id)):String(v)===String(id);
 out.anchors=[1417,1420,1421,1425,1484,1500,1501,1505].map(id=>{const matches=p.items.filter(x=>has(x.snapshot.metadata?.source,id)||has(x.snapshot.display_id,id));return {id,status:matches.length?'active':'대상에 없음',results:matches.map(x=>out.rows.find(r=>r.id===x.questionId))};});
 return out;
}
module.exports={audit};
if(require.main===module){const [input,output]=process.argv.slice(2);const result=audit(JSON.parse(fs.readFileSync(input)));fs.writeFileSync(output,JSON.stringify(result,null,2));console.log(JSON.stringify({...result,rows:undefined},null,2));}
