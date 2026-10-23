'use strict';
const sets=require('./question-sets.cjs'),scope=require('./exam-scope-allocation.cjs');
const enabled=rules=>rules?.profile?.driver==='target';
const sum=(rows,B)=>rows.reduce((n,c)=>n+B.numericScore(c),0);
// Optimize actual scores after the existing feasibility allocator has proved
// count, format, chapter and school constraints. Bands are display information.
function optimize(pool,rules,seed,{requiredIds=rules.supplementRequiredIds||[],limit=120000,schoolOf=c=>c.metadata?.source?.school}={}){
 const B=require('./bank-exam-model.cjs'),n=rules.count,target=Number(rules.profile.targetAverage),required=new Set(requiredIds);
 const groups=sets.units(pool,{strict:false});
 for(const g of groups)if(g.some(c=>required.has(c.question_id)))for(const c of g)required.add(c.question_id);
 if([...required].some(id=>!pool.some(c=>c.question_id===id)))throw Error('선택한 보충 문항 또는 세트를 포함할 수 없습니다.');
 const chapters=seed.scopeAllocation?.groups||[],schoolCounts=seed.schoolAllocation?.counts;
 const keys=['total',...Object.keys(rules.types||{}).map(k=>'f:'+k),...chapters.flatMap(g=>['c:'+g.id,...(g.writtenTarget==null?[]:['w:'+g.id])]),...Object.keys(schoolCounts||{}).map(k=>'s:'+k)];
 const vector=rows=>{const v=Object.fromEntries(keys.map(k=>[k,0]));for(const c of rows){v.total++;const f=B.responseType(c.metadata),ch=scope.chapterFor(c,chapters);for(const k of ['f:'+f,'c:'+ch,'s:'+schoolOf(c),...(f==='서술형'?['w:'+ch]:[])])if(k in v)v[k]++;}return keys.map(k=>v[k]);};
 const wanted=vector(seed.items),same=(a,b)=>a.every((x,i)=>x===b[i]),valid=rows=>rows.length===n&&same(vector(rows),wanted)&&[...required].every(id=>rows.some(c=>c.question_id===id));
 const units=groups.map(rows=>({rows,v:vector(rows),sum:sum(rows,B),fixed:rows.some(c=>required.has(c.question_id))}));
 let best=valid(seed.items)?seed.items:null,bestError=best?Math.abs(sum(best,B)-target*n):Infinity,work=0,limited=false,exact=false;
 const update=rows=>{const error=Math.abs(sum(rows,B)-target*n);if(error<bestError-1e-9){best=rows;bestError=error;}};
 // Exhaustive bounded search for small inventories; also finds a valid seed
 // containing explicitly selected supplements before any local exchanges.
 if(units.length<=22||!best){
  const fixed=units.filter(u=>u.fixed),free=units.filter(u=>!u.fixed).sort((a,b)=>Math.abs(a.sum/a.rows.length-target)-Math.abs(b.sum/b.rows.length-target));
  const chosen=fixed.flatMap(u=>u.rows),counts=vector(chosen),suffix=Array(free.length+1);suffix[free.length]=keys.map(()=>0);
  for(let i=free.length-1;i>=0;i--)suffix[i]=suffix[i+1].map((v,j)=>v+free[i].v[j]);
  function visit(at){
   if(bestError<1e-9)return;if(++work>limit){limited=true;return;}
   if(counts.some((v,i)=>v>wanted[i]||v+suffix[at][i]<wanted[i]))return;
   if(counts[0]===n){if(same(counts,wanted))update([...chosen]);return;}
   if(at===free.length)return;const u=free[at];chosen.push(...u.rows);u.v.forEach((v,i)=>counts[i]+=v);visit(at+1);chosen.splice(chosen.length-u.rows.length,u.rows.length);u.v.forEach((v,i)=>counts[i]-=v);if(!limited)visit(at+1);
  }
  visit(0);exact=!limited;
 }
 if(!best)return {...seed,items:[],complete:false,failureKind:limited?'search_limit':'supplement_conflict',searchLimitReached:limited};
 // Exchange complete sets (and pairs of units) only when their constraint
 // vectors agree. Numeric scores may cross low/middle/high boundaries.
 let passes=0;
 while(bestError>1e-9&&work<limit&&passes++<2*n+4){
  const ids=new Set(best.map(c=>c.question_id)),out=units.filter(u=>u.rows.every(c=>ids.has(c.question_id))&&!u.fixed),incoming=units.filter(u=>u.rows.every(c=>!ids.has(c.question_id)));
  const bundles=list=>{const result=list.map(u=>({parts:[u],v:u.v,sum:u.sum}));if(list.length<=150)for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++)result.push({parts:[list[i],list[j]],v:list[i].v.map((v,k)=>v+list[j].v[k]),sum:list[i].sum+list[j].sum});return result;};
  const addByKey=new Map();for(const u of bundles(incoming)){const key=u.v.join(',');if(!addByKey.has(key))addByKey.set(key,[]);addByKey.get(key).push(u);}for(const a of addByKey.values())a.sort((x,y)=>x.sum-y.sum);
  const current=sum(best,B);let exchange=null,error=bestError;
  for(const remove of bundles(out)){const options=addByKey.get(remove.v.join(','));if(!options?.length)continue;const want=target*n-current+remove.sum;let lo=0,hi=options.length;while(lo<hi){const m=(lo+hi)>>1;if(options[m].sum<want)lo=m+1;else hi=m;}
   for(const i of [lo-1,lo]){if(i<0||i>=options.length)continue;if(++work>limit)break;const add=options[i],e=Math.abs(current-remove.sum+add.sum-target*n);if(e<error-1e-9){error=e;exchange={remove,add};}}
   if(work>limit)break;
  }
  if(!exchange)break;const removed=new Set(exchange.remove.parts.flatMap(u=>u.rows.map(c=>c.question_id)));update(best.filter(c=>!removed.has(c.question_id)).concat(exchange.add.parts.flatMap(u=>u.rows)));
 }
 if(!valid(best)||!sets.complete(best))throw Error('목표 평균 구성의 범위·형식·학교·세트 검증에 실패했습니다.');
 const actual=Object.fromEntries(['low','middle','high'].map(k=>[k,best.filter(c=>B.compositionBand(c)===k).length]));
 return {...seed,items:sets.ordered(best),rules,diversity:B.diversitySummary(best,false),profileSummary:{requested:B.profileCounts(n,rules.profile),actual,actualAverage:sum(best,B)/n,numericCount:n,targetAverage:target,driver:'target',assignment:Object.fromEntries(best.map(c=>[c.question_id,B.compositionBand(c)])),optimization:{method:exact?'bounded-exhaustive':'constraint-preserving-exchanges',optimalWithinAllocation:exact||bestError<1e-9,searchLimitReached:limited||work>=limit,work}},searchLimitReached:limited||work>=limit};
}
function select(candidates,rules){
 const B=require('./bank-exam-model.cjs'),inspection=B.inspectCandidates(candidates,rules),pool=inspection.eligible.filter(c=>Number.isFinite(B.numericScore(c))),manual=!!rules.supplementRequiredIds?.length,relaxed={...rules,profile:null,bins:[],...(manual?{schoolMode:'flexible'}:{})};
 const seed=B.selectQuestions(pool,relaxed);if(!seed.complete)return {...seed,diagnostics:inspection.diagnostics};
 const result=optimize(pool,rules,seed);
 if(result.complete&&manual)result.schoolAllocation={mode:rules.schoolMode,counts:Object.fromEntries([...new Set(result.items.map(c=>c.metadata?.source?.school||''))].map(s=>[s,result.items.filter(c=>(c.metadata?.source?.school||'')===s).length])),manualSupplements:true,optimal:false};
 return {...result,diagnostics:inspection.diagnostics};
}
module.exports={enabled,optimize,select};
