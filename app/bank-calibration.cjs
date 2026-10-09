'use strict';
const version='paired-residual-local-v2';
const median=v=>{const a=v.slice().sort((x,y)=>x-y),n=a.length;return n?(a[(n-1)>>1]+a[n>>1])/2:0;};
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const stratum=x=>JSON.stringify(canonical([x.model,x.criteriaVersion,x.grade,x.scopeKey,x.type]));
function calibrate(target,ratings){
 try{require('./difficulty-assessment.cjs').score(target.rawScore);require('./difficulty-assessment.cjs').score(target.confirmedScore);}catch(e){return {score:null,changed:false,status:'format_error',reason:e.message,version};}
 if(target.confirmedScore!=null)return {score:String(Number(target.confirmedScore).toFixed(1)),changed:false,reason:'확정값 보존',version};
 if(target.rawScore==null)return {score:null,changed:false,reason:'AI 원점수 없음',version};
 if([target.model,target.criteriaVersion,target.grade,target.scopeKey,target.type].some(x=>x==null||x===''))return {score:Number(target.rawScore).toFixed(1),changed:false,reason:'모델·기준·학년·범위·유형 정보가 없어 보정하지 않음',version};
 // Keep only the last rating for each person/question. Calibration never reads its own output.
 const unique=new Map();for(const r of ratings.filter(r=>r.adopted&&r.rawScore!=null&&Number.isFinite(Number(r.score))&&Number(r.score)>=0&&Number(r.score)<=10&&Number(r.rawScore)>=0&&Number(r.rawScore)<=10&&stratum(r)===stratum(target))){const key=r.raterId+':'+r.questionId,old=unique.get(key);if(!old||r.updatedAt>old.updatedAt)unique.set(key,r);}
 const families=new Map();for(const r of unique.values()){const key=r.familyId||r.questionId;if(!families.has(key))families.set(key,[]);families.get(key).push({raw:Number(r.rawScore),residual:Math.max(-2,Math.min(2,Number(r.score)-Number(r.rawScore)))});}
 const samples=[...families.values()].map(rs=>({raw:median(rs.map(r=>r.raw)),residual:median(rs.map(r=>r.residual))})),raw=Number(target.rawScore);
 // Local kernel weights distinguish easy and hard evidence without inventing
 // grade boundaries. Each source family has at most one unit of weight.
 const at=x=>{let weight=0,sum=0;for(const r of samples){const w=Math.exp(-(((r.raw-x)/1.5)**2)/2);weight+=w;sum+=w*r.residual;}return{offset:sum/(weight+8),weight};};
 const knots=[...new Set(samples.map(s=>s.raw))].sort((a,b)=>a-b).map(x=>({x,offset:at(x).offset}));
 // Bound offset slope to +/-0.5. Interpolation stays monotone with score slope
 // at least 0.5, avoiding inversions and artificial plateaus (except cap 10).
 for(let i=1;i<knots.length;i++){const p=knots[i-1],k=knots[i],limit=(k.x-p.x)*.5;k.offset=Math.max(p.offset-limit,Math.min(p.offset+limit,k.offset));}
 let offset=0;if(knots.length){if(raw<=knots[0].x)offset=knots[0].offset*Math.exp(-(((raw-knots[0].x)/1.5)**2)/2);else if(raw>=knots.at(-1).x)offset=knots.at(-1).offset*Math.exp(-(((raw-knots.at(-1).x)/1.5)**2)/2);else{const i=knots.findIndex(k=>k.x>=raw),a=knots[i-1],b=knots[i];offset=a.offset+(b.offset-a.offset)*(raw-a.x)/(b.x-a.x);}}
 const score=Math.min(10,raw+offset).toFixed(1),local=at(raw).weight;
 return {score,changed:score!==raw.toFixed(1),offset:Number(offset.toFixed(3)),families:families.size,ratings:unique.size,effectiveFamilies:Number(local.toFixed(2)),initial:local<8,version,reason:`동일 모델·기준·학년·범위·유형 ${families.size}계열 중 가까운 AI 원점수의 평가를 더 반영, 유효 표본 ${local.toFixed(1)}, 순서 보존·소표본 축소`};
}
module.exports={calibrate,version};
