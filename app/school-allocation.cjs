'use strict';
// Compress interchangeable units before exact bounded search. Never split sets,
// relax a quota, or present an unproved school priority as a maximum.
function allocate({eligible,rules,seed,sets,band,format,chapter,quotas,limit=200000,schoolFirst=false}){
 const schools=[...new Set(rules.schools||[])],equal=rules.schoolMode==='equal',n=rules.count;
 if(!equal)for(const c of eligible)if(rules.supplementIds?.includes(c.question_id)&&!schools.includes(c.metadata?.source?.school))schools.push(c.metadata?.source?.school||'선택한 추가 후보');
 const failure=(reason,limited=false)=>({...seed,items:[],complete:false,failureKind:limited?'search_limit':'school_conflict',schoolError:reason,searchLimitReached:limited});
 if(!schools.length)return failure('출처 학교를 선택해 주세요.');
 if(equal&&n%schools.length)return failure(`${n}문항을 ${schools.length}개 학교에 정확히 나눌 수 없습니다. 문항 수를 조정하세요.`);
 if(schools.length===1&&seed.items.every(c=>c.metadata?.source?.school===schools[0]))return {...seed,schoolAllocation:{mode:rules.schoolMode,counts:{[schools[0]]:n},optimal:true,work:0}};
 const gs=seed.scopeAllocation?.groups||[],dims=['total',...Object.keys(quotas).map(k=>'b:'+k),...Object.keys(rules.types||{}).map(k=>'f:'+k),...gs.flatMap(g=>['c:'+g.id,'w:'+g.id]),...schools.map(s=>'s:'+s)],index=new Map(dims.map((d,i)=>[d,i]));
 const lower=dims.map(()=>0),upper=dims.map(()=>n);lower[0]=upper[0]=n;
 for(const [k,v]of Object.entries(quotas))lower[index.get('b:'+k)]=upper[index.get('b:'+k)]=v;
 for(const [k,v]of Object.entries(rules.types||{}))lower[index.get('f:'+k)]=upper[index.get('f:'+k)]=v;
 for(const g of gs)for(const [key,target]of [['c:',g.target],['w:',g.writtenTarget]])if(target!=null){lower[index.get(key+g.id)]=Math.floor(target+1e-8);upper[index.get(key+g.id)]=Math.ceil(target-1e-8);}
 if(equal)for(const s of schools)lower[index.get('s:'+s)]=upper[index.get('s:'+s)]=n/schools.length;
 const buckets=new Map();
 for(const unit of sets.units(eligible,{strict:false})){
  const vector=dims.map(()=>0);let accepted=true;
  for(const c of unit){const school=c.metadata?.source?.school;if(!schools.includes(school)){accepted=false;break;}vector[0]++;for(const key of ['b:'+band(c),'f:'+format(c.metadata),'c:'+chapter(c,gs),'s:'+school])if(index.has(key))vector[index.get(key)]++;if(format(c.metadata)==='서술형'&&index.has('w:'+chapter(c,gs)))vector[index.get('w:'+chapter(c,gs))]++;}
  if(!accepted)continue;const key=vector.join(',');if(!buckets.has(key))buckets.set(key,{vector,units:[]});buckets.get(key).units.push(unit);
 }
 const schoolAt=schools.map(s=>index.get('s:'+s)),groups=[...buckets.values()];
 const compare=(a,b)=>{for(const i of schoolAt)if(a[i]!==b[i])return a[i]-b[i];return 0;};
 const formatStock={};for(const c of eligible){const k=format(c.metadata);formatStock[k]=(formatStock[k]||0)+1;}
 const formatScarcity=g=>Math.min(...Object.keys(rules.types||{}).filter(k=>g.vector[index.get('f:'+k)]&&rules.types[k]>0).map(k=>(formatStock[k]||0)/rules.types[k]),Infinity);
 groups.sort((a,b)=>schoolFirst?compare(b.vector,a.vector)||formatScarcity(a)-formatScarcity(b):formatScarcity(a)-formatScarcity(b)||compare(b.vector,a.vector));
 const suffix=Array(groups.length+1);suffix[groups.length]=dims.map(()=>0);for(let i=groups.length-1;i>=0;i--)suffix[i]=suffix[i+1].map((v,d)=>v+groups[i].vector[d]*groups[i].units.length);
 // Bound each school's remaining contribution by the remaining quotas, not
 // just its raw inventory. A large choice pool cannot fill missing written
 // slots. These are optimistic bounds (including mixed-school sets), so they
 // prune only branches that cannot improve the proven incumbent.
 const partitions=[Object.keys(quotas).map(k=>index.get('b:'+k))];
 if(Object.values(rules.types||{}).reduce((a,b)=>a+b,0)===n)partitions.push(Object.keys(rules.types).map(k=>index.get('f:'+k)));
 const schoolSuffix=schools.map((_,s)=>{const out=Array(groups.length+1);out[groups.length]=dims.map(()=>0);for(let at=groups.length-1;at>=0;at--){const g=groups[at];out[at]=out[at+1].map((v,d)=>v+(g.vector[schoolAt[s]]?g.vector[d]*g.units.length:0));}return out;});
 let visits=0,limited=false,best=null,bestCounts=null;const counts=dims.map(()=>0),choices=[],seen=new Map();
 if(!equal&&seed.items.length===n&&seed.items.every(c=>schools.includes(c.metadata?.source?.school))){
  const initial=dims.map(()=>0);for(const c of seed.items){initial[0]++;for(const key of ['b:'+band(c),'f:'+format(c.metadata),'c:'+chapter(c,gs),'s:'+c.metadata?.source?.school])if(index.has(key))initial[index.get(key)]++;if(format(c.metadata)==='서술형'&&index.has('w:'+chapter(c,gs)))initial[index.get('w:'+chapter(c,gs))]++;}
  if(initial.every((v,d)=>v>=lower[d]&&v<=upper[d])){best=seed.items;bestCounts=initial;}
 }
 function search(at){
  if(limited||equal&&best)return;if(++visits>limit){limited=true;return;}
  if(counts.some((v,d)=>v>upper[d]||v+suffix[at][d]<lower[d]))return;
  if(bestCounts&&!equal){const bound=[...counts];let reserved=0,prefixTied=true;for(let s=0;s<schools.length;s++){const d=schoolAt[s],stock=schoolSuffix[s][at];let extra=Math.min(upper[d]-counts[d],suffix[at][d],n-counts[0]-(prefixTied?reserved:0));for(const p of partitions)extra=Math.min(extra,p.reduce((t,i)=>t+Math.min(upper[i]-counts[i],stock[i]),0));bound[d]+=extra;prefixTied=prefixTied&&bound[d]===bestCounts[d];reserved+=Math.max(0,bestCounts[d]-counts[d]);}if(compare(bound,bestCounts)<=0)return;}
  // At the same bucket and non-school quotas, remaining choices are identical.
  // A lexicographically better school prefix dominates a worse one. Equal
  // allocation still needs every school count because those are hard quotas.
  const memo=at+':'+(equal?counts:counts.slice(0,schoolAt[0])).join(',');
  const previous=seen.get(memo);if(previous&&(equal||compare(previous,counts)>=0))return;seen.set(memo,[...counts]);
  if(counts[0]===n){if(counts.some((v,d)=>v<lower[d]))return;
   const summary=seed.scopeAllocation;if(summary){const err=gs.reduce((t,g)=>t+(counts[index.get('c:'+g.id)]-g.target)**2,0),werr=gs.reduce((t,g)=>t+(counts[index.get('w:'+g.id)]-g.writtenTarget)**2,0);if(Math.abs(err-summary.roundingError.total)>1e-8||summary.roundingError.written!=null&&Math.abs(werr-summary.roundingError.written)>1e-8)return;}
   if(!bestCounts||compare(counts,bestCounts)>0){best=choices.flatMap(([g,k])=>g.units.slice(0,k).flat());bestCounts=[...counts];}return;
  }
  if(at===groups.length)return;const g=groups[at];let max=g.units.length;g.vector.forEach((v,d)=>{if(v)max=Math.min(max,Math.floor((upper[d]-counts[d])/v));});
  for(let k=max;k>=0;k--){g.vector.forEach((v,d)=>counts[d]+=k*v);choices.push([g,k]);search(at+1);choices.pop();g.vector.forEach((v,d)=>counts[d]-=k*v);if(limited||equal&&best)return;}
 }
 search(0);if(limited){
  // Scarce-format-first works well for small school pools. A wide pool can
  // instead prove the priority optimum faster by visiting schools first.
  // Try that order once with the same finite budget; never accept an unproved
  // incumbent or relax scope, format, difficulty, sets or school priorities.
  if(!equal&&!schoolFirst){const alternative=allocate({eligible,rules,seed,sets,band,format,chapter,quotas,limit,schoolFirst:true});if(alternative.schoolAllocation)alternative.schoolAllocation.work+=visits;return alternative;}
  return failure('학교 배분 탐색 한도에서 최대·균등 구성을 확정하지 못했습니다. 범위나 학교 수를 조정하세요.',true);
 }
 if(!best)return failure('선택 학교의 재고·세트·범위·난이도 조건으로 정확한 학교 배분이 불가능합니다. 학교 또는 문항 수를 조정하세요.');
 const result={...seed,items:sets.ordered(best),schoolAllocation:{mode:rules.schoolMode,counts:Object.fromEntries(schools.map(s=>[s,bestCounts[index.get('s:'+s)]])),optimal:true,work:visits}};
 if(seed.scopeAllocation){result.scopeAllocation=structuredClone(seed.scopeAllocation);for(const g of result.scopeAllocation.groups){g.count=bestCounts[index.get('c:'+g.id)];if(g.writtenTarget!=null)g.writtenCount=bestCounts[index.get('w:'+g.id)];}}
 if(result.profileSummary)result.profileSummary={...result.profileSummary,actualAverage:best.reduce((a,c)=>a+require('./bank-exam-model.cjs').numericScore(c),0)/n,assignment:Object.fromEntries(best.map(c=>[c.question_id,band(c)]))};
 result.diversity=require('./bank-exam-model.cjs').diversitySummary(result.items,false,false);return result;
}
module.exports={allocate};
