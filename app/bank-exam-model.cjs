'use strict';
const C=require('./curriculum.js'),D=require('./difficulty-assessment.cjs'),T=require('./question-types.cjs');
const searchFilters=require('./bank-search-filters.cjs');
const scopeAllocation=require('./exam-scope-allocation.cjs');
const responseType=m=>({single_choice:'선택형',multiple_choice:'선택형',single_value:'단답형',all_solutions:'단답형',proof:'서술형',written_response:'서술형'})[m.content?.responseType]||m.content?.responseType;
const questionType=T.primaryKey;
const responseFormats=['선택형','단답형','서술형'];
function formatLimits(types={},count){
 const keys=Object.keys(types),sum=Object.values(types).reduce((a,b)=>a+b,0);
 if(keys.some(k=>!responseFormats.includes(k))||Object.values(types).some(n=>!Number.isInteger(n)||n<0))throw Error('응답 유형 개수는 0 이상의 정수로 입력하세요. 빈칸은 자동 충원입니다.');
 if(sum>count)throw Error(`지정한 유형 개수 합계 ${sum}개가 총 문항 수 ${count}개보다 많습니다.`);
 if(keys.length===responseFormats.length&&sum!==count)throw Error(`모든 유형을 지정한 경우 합계가 총 문항 수와 같아야 합니다. 지정 ${sum}개 / 총 ${count}개. 자동 충원할 유형은 빈칸으로 두세요.`);
 return keys.length?{...types,...(keys.length<responseFormats.length?{'*':count-sum}:{})}:{};
}
function validateRules(rules){
 if(!Number.isInteger(rules.count)||rules.count<1||rules.count>100)throw Error('총 문항 수는 1~100개입니다.');
 formatLimits(rules.types||{},rules.count);
 const bins=rules.bins||[];
 if(bins.length&&(bins.some(b=>!Number.isInteger(b.count)||b.count<0)||bins.reduce((n,b)=>n+b.count,0)!==rules.count))throw Error('난이도별 개수 합계가 총 문항 수와 달라요.');
 if(bins.some((b,i)=>!Number.isFinite(b.min)||!Number.isFinite(b.max)||b.min>b.max||bins.slice(i+1).some(x=>b.min<=x.max&&x.min<=b.max)))throw Error('난이도 구간이 잘못되었거나 겹칩니다.');
 if(rules.profile){profileCounts(rules.count,rules.profile);if(!Number.isFinite(Number(rules.profile.targetAverage))||Number(rules.profile.targetAverage)<0||Number(rules.profile.targetAverage)>10)throw Error('목표 문항 난이도 평균은 0~10점으로 입력하세요.');}
}
function scopeFit(metadata,selected,forbidden=[]){
 const c=metadata?.classification||{},manual=c.confirmed&&typeof c.confirmed==='object'?c.confirmed:null,s=manual||c;
 const chosen=new Set((selected||[]).filter(id=>C.leaves.some(n=>n.id===id)));
 if(!chosen.size)return {ok:false,reason:'시험범위를 선택하세요.',unknown:true};
 if(metadata?.analysis?.status==='stale'&&!manual&&!c.scopeEvidence)return {ok:false,reason:'내용 변경 후 범위 정보가 오래됨',unknown:true};
 const allowed=new Set(C.allowedUnitIds([...chosen]));
 const forbiddenConcepts=new Set(C.leaves.filter(n=>forbidden.includes(n.id)&&n.conceptKey).map(n=>n.conceptKey));
 const safe=ids=>ids.every(id=>allowed.has(id)&&!forbidden.includes(id)&&!forbiddenConcepts.has(C.leaves.find(n=>n.id===id)?.conceptKey));
 const primary=s.primaryUnit||c.primaryUnit||c.suggested?.primaryUnit;
 const primaryId=typeof primary==='object'?primary?.id:primary;
 const primaryName=typeof primary==='object'?primary?.name:primary;
 const grade=C.gradeKey(metadata?.source?.grade);
 const namedUnits=C.leaves.filter(n=>n.title===primaryName&&(!grade||n.gradeId===grade));
 const unit=C.leaves.find(n=>n.id===primaryId)||(namedUnits.length===1?namedUnits[0]:null);
 const evidence=c.scopeEvidence||s,solutions=evidence.solutions||c.suggested?.solutions||[],conditions=evidence.conditionUnitIds||c.suggested?.conditionUnitIds||[];
 const knownSolutions=solutions.filter(x=>Array.isArray(x.unitIds)&&x.unitIds.length);
 if(unit&&!chosen.has(unit.id))return {ok:false,reason:'추천 단원이 선택 범위 밖'};
 if(!unit&&!knownSolutions.some(x=>x.unitIds.some(id=>chosen.has(id))))return {ok:false,reason:'단원·범위 분류 없음 또는 식별 불가',unknown:true};
 if(unit&&!safe([unit.id])||!safe(conditions))return {ok:false,reason:'저장된 조건 개념이 범위 밖 또는 금지 개념'};
 const usable=knownSolutions.filter(x=>safe(x.unitIds)&&safe(x.dependencyUnitIds||[]));
 if(knownSolutions.length&&!usable.length)return {ok:false,reason:'저장된 풀이 개념이 범위 밖 또는 금지 개념'};
 const solution=usable.find(x=>typeof x.text==='string'&&x.text.trim());
 // AI unit recommendations are sufficient for composition. Missing evidence is
 // reported, not converted into a requirement for teacher confirmation.
 return {ok:true,solutionId:solution?.id||solution?.label||null,solution:solution||null,evidence:manual||c.scopeEvidence?'saved_review':'saved_recommendation',limited:!Array.isArray(evidence.conditionUnitIds)||!knownSolutions.length};
}
function numericScore(c){return D.effective(c).number;}
const compositionBand=D.compositionBand;
function difficultySummary(rows){
 const counts={low:0,middle:0,high:0,deferred:0,unknown:0},four=Object.fromEntries(D.bands.map(b=>[b,0])),sources={},histogram={},seen=new Set();let labelDisagreements=0,total=0,killerCount=0;
 for(const c of rows){if(c.question_id&&seen.has(c.question_id))continue;if(c.question_id)seen.add(c.question_id);total++;const e=D.effective(c),b=compositionBand(c);counts[b]++;if(e.number!==null&&e.number>=9)killerCount++;if(e.band)four[e.band]++;if(e.legacyBandConflict)labelDisagreements++;if(e.number!==null)histogram[e.number]=(histogram[e.number]||0)+1;const source=e.numberSource||'점수 없음';sources[source]=(sources[source]||0)+1;}
 return {total,counts,four,sources,histogram,labelDisagreements,killerCount};
}
function profileAverage(profile){return ['low','middle','high'].reduce((n,k)=>n+Number(profile[k]||0)*D.compositionAnchors[k]/100,0);}
function profileForTarget(target){const n=Number(target);if(!Number.isFinite(n)||n<0||n>10)throw Error('목표 난이도는 0~10점입니다.');const {low,middle,high}=D.compositionAnchors;if(n<=low)return {low:100,middle:0,high:0};if(n>=high)return {low:0,middle:0,high:100};if(n<=middle){const p=Math.round((n-low)/(middle-low)*100);return {low:100-p,middle:p,high:0};}const p=Math.round((n-middle)/(high-middle)*100);return {low:0,middle:100-p,high:p};}
function profileCounts(count,profile){
 const keys=['low','middle','high'],ratios=keys.map(k=>Number(profile[k]||0));
 if(ratios.some(n=>!Number.isFinite(n)||n<0)||Math.abs(ratios.reduce((a,b)=>a+b,0)-100)>0.001)throw Error('하·중·상 비율의 합은 100%여야 합니다.');
 const raw=ratios.map(n=>n*count/100),out=raw.map(Math.floor);for(const i of keys.map((_,i)=>i).sort((a,b)=>(raw[b]-out[b])-(raw[a]-out[a])))if(out.reduce((a,b)=>a+b,0)<count)out[i]++;
 return Object.fromEntries(keys.map((k,i)=>[k,out[i]]));
}
function inspectCandidates(candidates,rules={}){
  const reasons={},eligible=[],seen=new Set(),excluded=new Set(rules.excludeIds||[]),checks=Object.fromEntries(['버전·삭제 상태','중복 제외','학교','범위','단원','출제유형','난이도','응답 형식'].map(label=>[label,{label,passed:0,failed:0}]));
 const scopeRows=[];let scopeUnknown=0,limitedEvidence=0;
 for(const c of candidates){if(seen.has(c.question_id))continue;seen.add(c.question_id);const m=c.metadata||{},score=numericScore(c),type=responseType(m),types=rules.types||{},bins=rules.bins||[];
  const fit=scopeFit({...m,classification:{...m.classification,scopeEvidence:c.confirmed?.scopeEvidence??m.classification?.scopeEvidence}},rules.units,rules.forbidden);
  const base={
   '버전·삭제 상태':c.revision_conflict?'수정 버전 충돌':c.archived||c.deleted?'삭제·보관 문항':null,
   '중복 제외':excluded.has(c.question_id)?'기존 시험지와 중복':null,
   '학교':rules.schools?.length&&!rules.schools.includes(m.source?.school)?'학교':null,
    '범위':fit.ok?null:fit.reason,
    '단원':searchFilters.matches(c,{unit:rules.unit})?null:'선택 단원 밖',
    '출제유형':searchFilters.matches(c,{type:rules.type})?null:'선택 출제유형 밖'
  };
  if(!base['버전·삭제 상태']&&!base['학교']){if(fit.unknown)scopeUnknown++;if(!base['범위'])scopeRows.push(c);}
  const failures={...base,'난이도':bins.length&&(score===null||!bins.some(b=>score>=b.min&&score<=b.max))||rules.profile&&!['low','middle','high'].includes(compositionBand(c))?'난이도 점수·구간 없음 또는 조건 밖':null,'응답 형식':Object.keys(types).length&&(!responseFormats.includes(type)||Object.hasOwn(types,type)&&types[type]===0)?'응답 형식':null};
  for(const [label,reason]of Object.entries(failures)){checks[label][reason?'failed':'passed']++;if(reason)reasons[reason]=(reasons[reason]||0)+1;}
  if(Object.values(failures).some(Boolean))continue;
  if(fit.limited)limitedEvidence++;eligible.push({...c,selectedSolutionId:fit.solutionId,selectedSolution:fit.solution});
 }
 return {eligible,reasons,diagnostics:{total:seen.size,eligible:eligible.length,checks:Object.values(checks),scopeUnknown,limitedEvidence,schoolScopeDifficulty:difficultySummary(scopeRows),eligibleDifficulty:difficultySummary(eligible)}};
}
function diversitySummary(items,optimal=true,limited=false){
 const groups=new Map();let unknown=0;for(const c of items){const type=questionType(c);if(!type){unknown++;continue;}const entry=groups.get(type)||{name:T.effective(c)[0]?.name||type,count:0};entry.count++;groups.set(type,entry);}
 return {knownTypes:groups.size,unknownTypes:unknown,coarseTypeCount:items.filter(c=>{const t=T.effective(c)[0];return t&&!t.repeatKey;}).length,repeated:items.length-unknown-groups.size,repeats:[...groups.values()].filter(g=>g.count>1),optimal,searchLimitReached:limited,reason:'명시한 학교·범위·난이도·형식과 문항 수를 먼저 지키고, 저장된 출제유형 중복을 최소화합니다. 유형 미상과 세부 식별키가 없는 넓은 유형은 핵심 풀이 방식의 중복 여부를 확정할 수 없습니다.'};
}
// A small maximum-flow problem proves count/difficulty/format feasibility first.
// Diversity optimization must never turn a feasible complete paper into zero.
function allocate(entries,quotas,typeLimits){
 const gs=Object.keys(quotas),formats=Object.keys(typeLimits).length?Object.keys(typeLimits):['*'],n=gs.length+formats.length+2,s=n-2,t=n-1,graph=Array.from({length:n},()=>[]),edges=[];
 const edge=(a,b,cap)=>{const e={to:b,cap,initial:cap,rev:graph[b].length};graph[a].push(e);graph[b].push({to:a,cap:0,initial:0,rev:graph[a].length-1});return e;};
 gs.forEach((g,i)=>edge(s,i,quotas[g]));formats.forEach((f,i)=>edge(gs.length+i,t,Object.hasOwn(typeLimits,f)?typeLimits[f]:Object.values(quotas).reduce((a,b)=>a+b,0)));
 for(const [i,g]of gs.entries())for(const [j,f]of formats.entries()){const bucket=entries.filter(e=>e.group===g&&(f==='*'?!Object.hasOwn(typeLimits,e.format):e.format===f));edges.push({g,f,bucket,edge:edge(i,gs.length+j,bucket.length)});}
 let flow=0;for(;;){const prev=Array(n).fill(null),queue=[s];prev[s]={};for(let h=0;h<queue.length&&!prev[t];h++)for(const [i,e]of graph[queue[h]].entries())if(e.cap>0&&!prev[e.to]){prev[e.to]={from:queue[h],index:i};queue.push(e.to);}if(!prev[t])break;let amount=Infinity;for(let v=t;v!==s;v=prev[v].from)amount=Math.min(amount,graph[prev[v].from][prev[v].index].cap);for(let v=t;v!==s;v=prev[v].from){const e=graph[prev[v].from][prev[v].index];e.cap-=amount;graph[v][e.rev].cap+=amount;}flow+=amount;}
 return {flow,buckets:edges.map(x=>({...x,count:x.edge.initial-x.edge.cap}))};
}
// Reassign earlier choices along alternating paths before accepting a repeat.
// Buckets already encode the chosen difficulty, format and chapter counts.
function matchDiverseBuckets(buckets,cost){
 const slots=buckets.filter(b=>b.count).sort((a,b)=>a.bucket.length/a.count-b.bucket.length/b.count).flatMap(b=>Array.from({length:b.count},()=>b));
 const assigned=Array(slots.length).fill(null),owners=new Map();
 // Unknowns supply a question, not evidence of a distinct type; the result
 // separately reports them and never certifies their semantic uniqueness.
 const key=e=>e.type?`known:${e.type}`:`unknown:${e.index}`;
 const choices=slots.map(b=>[...b.bucket].sort((a,b)=>Number(!a.type)-Number(!b.type)||cost(a)-cost(b)||a.index-b.index));
 function augment(slot,seen){for(const e of choices[slot]){const k=key(e);if(seen.has(k))continue;seen.add(k);const previous=owners.get(k);if(previous===undefined||augment(previous,seen)){owners.set(k,slot);assigned[slot]=e;return true;}}return false;}
 for(let i=0;i<slots.length;i++)augment(i,new Set());
 const selected=new Set(assigned.filter(Boolean).map(e=>e.index)),uses=new Map();for(const e of assigned.filter(Boolean))if(e.type)uses.set(e.type,(uses.get(e.type)||0)+1);
 for(let i=0;i<slots.length;i++)if(!assigned[i]){const rest=choices[i].filter(e=>!selected.has(e.index));rest.sort((a,b)=>(uses.get(a.type)||0)-(uses.get(b.type)||0)||Number(!a.type)-Number(!b.type)||cost(a)-cost(b)||a.index-b.index);const e=rest[0];if(!e)throw Error('문항 선택 내부 오류: 배분한 후보를 연결하지 못했습니다.');assigned[i]=e;selected.add(e.index);if(e.type)uses.set(e.type,(uses.get(e.type)||0)+1);}
 return assigned;
}
function compose(eligible,rules,reasons){
 const profile=rules.profile,quotas=profile?profileCounts(rules.count,profile):(rules.bins?.length?Object.fromEntries(rules.bins.map((b,i)=>[String(i),b.count])):{all:rules.count}),anchors=D.compositionAnchors,typeLimits=formatLimits(rules.types||{},rules.count);
 if(profile&&(!Number.isFinite(Number(profile.targetAverage))||Number(profile.targetAverage)<0||Number(profile.targetAverage)>10))throw Error('목표 문항 난이도 평균은 0~10점으로 입력하세요.');
 const entries=eligible.map((c,index)=>({c,index,type:questionType(c),format:responseType(c.metadata),score:numericScore(c),group:profile?compositionBand(c):rules.bins?.length?String(rules.bins.findIndex(b=>numericScore(c)>=b.min&&numericScore(c)<=b.max)):'all'}));
  let plan=allocate(entries,quotas,typeLimits);if(plan.flow!==rules.count){
   const shortages=[];
   const check=(label,requested,available)=>{if(available<requested)shortages.push({label,requested,available,missing:requested-available});};
   for(const [format,n]of Object.entries(rules.types||{}))check(format,n,entries.filter(e=>e.format===format).length);
   for(const [g,n]of Object.entries(quotas))check(({low:'하',middle:'중',high:'상'})[g]||(g==='all'?'총 문항':'난이도 구간 '+(Number(g)+1)),n,entries.filter(e=>e.group===g).length);
   const crossCounts=Object.fromEntries(Object.keys(quotas).map(g=>[g,Object.fromEntries(responseFormats.map(f=>[f,entries.filter(e=>e.group===g&&e.format===f).length]))]));
   return {items:[],eligible:eligible.length,reasons,complete:false,shortages,crossCounts,constraintConflict:!shortages.length,profileSummary:profile?{requested:quotas}:null};
  }
 if(rules.scopeDistribution===true)plan={...plan,...scopeAllocation.planScope(entries,quotas,typeLimits,rules,plan)};
 if(plan.summary&&plan.summary.roundingSatisfied!==true){
  const s=plan.summary,shortages=[];for(const g of s.groups){if(g.roundedTarget>g.available)shortages.push({label:g.title+' 범위 비중',requested:g.roundedTarget,available:g.available,missing:g.roundedTarget-g.available});if(g.roundedWrittenTarget>g.writtenAvailable)shortages.push({label:g.title+' 서술형 비중',requested:g.roundedWrittenTarget,available:g.writtenAvailable,missing:g.roundedWrittenTarget-g.writtenAvailable});}
  return {items:[],eligible:eligible.length,reasons,complete:false,shortages,scopeAllocation:s,constraintConflict:!shortages.length,failureKind:s.searchLimitReached?'search_limit':'scope_conflict',profileSummary:profile?{requested:quotas}:null};
 }
 const uses=new Map();const cost=e=>Math.abs((e.score??5)-(anchors[e.group]??5))+(profile?.targetAverage!=null?.35*Math.abs((e.score??5)-Number(profile.targetAverage)):0);const rank=(a,b)=>((uses.get(a.type)||0)-(uses.get(b.type)||0))||Number(!a.type)-Number(!b.type)||cost(a)-cost(b)||a.index-b.index;
 const picked=matchDiverseBuckets(plan.buckets,cost);
 const repeat=list=>list.length-list.filter(e=>!e.type).length-new Set(list.map(e=>e.type).filter(Boolean)).size;
 let best=[...picked],bestRepeat=repeat(best),visits=0,limited=false;
 let lower=Math.max(0,rules.count-new Set(entries.map(e=>e.type).filter(Boolean)).size-entries.filter(e=>!e.type).length);
 // Prove unavoidable repeats using relaxed partitions before enumerating
 // individual candidates. A chapter with 3 requested and only 2 type keys
 // already proves one repeat, regardless of candidates in other chapters.
 const relaxations=[Object.entries(quotas).map(([g,count])=>({count,bucket:entries.filter(e=>e.group===g)}))];
 if(plan.summary&&plan.summary.groups.every(g=>Math.abs(g.target-Math.round(g.target))<1e-8))relaxations.push(plan.summary.groups.map(g=>({count:g.count,bucket:entries.filter(e=>scopeAllocation.chapterFor(e.c,plan.summary.groups)===g.id)})));
 for(const buckets of relaxations)lower=Math.max(lower,repeat(matchDiverseBuckets(buckets,cost)));
 // Bounded branch-and-bound improves task diversity. Unknown tasks are never
 // treated as a shared type. A proven feasible fallback is already available.
 if(bestRepeat>lower){
  // Preserve the existing global diversity search, with the chosen optimal
  // chapter totals/written counts as additional bounds (not fixed cell choices).
  const slots=Object.entries(quotas).filter(([,n])=>n).sort((a,b)=>entries.filter(e=>e.group===a[0]).length/a[1]-entries.filter(e=>e.group===b[0]).length/b[1]).flatMap(([g,n])=>Array(n).fill(g));
  const pool=Object.fromEntries(Object.keys(quotas).map(g=>[g,entries.filter(e=>e.group===g)])),stack=[],last={},counts={};uses.clear();
  const chapterByEntry=new Map(plan.summary?plan.buckets.flatMap(b=>b.bucket.map(e=>[e.index,b.chapter])):[]),scopeCounts={},scopeWritten={};
  const withinScope=e=>{if(!plan.summary)return true;const k=chapterByEntry.get(e.index),limit=plan.summary.groups[k];return (scopeCounts[k]||0)<Math.ceil(limit.target-1e-8)&&(e.format!=='서술형'||limit.writtenTarget===null||(scopeWritten[k]||0)<Math.ceil(limit.writtenTarget-1e-8));};
  const countScope=(e,delta)=>{if(!plan.summary)return;const k=chapterByEntry.get(e.index);scopeCounts[k]=(scopeCounts[k]||0)+delta;if(e.format==='서술형')scopeWritten[k]=(scopeWritten[k]||0)+delta;};
  const sameRounding=()=>!plan.summary||Math.abs(plan.summary.groups.reduce((n,g,i)=>n+((scopeCounts[i]||0)-g.target)**2,0)-plan.summary.roundingError.total)<1e-8&&(plan.summary.roundingError.written===null||Math.abs(plan.summary.groups.reduce((n,g,i)=>n+((scopeWritten[i]||0)-g.writtenTarget)**2,0)-plan.summary.roundingError.written)<1e-8);
  function search(at,duplicates){
   if(bestRepeat===lower||limited||duplicates>=bestRepeat)return;
   if(++visits>20000){limited=true;return;}
   if(at===slots.length){if(sameRounding()){best=[...stack];bestRepeat=duplicates;}return;}
   const g=slots[at],previous=last[g]??-1;
   const formatKey=e=>Object.hasOwn(typeLimits,e.format)?e.format:'*';
   const choices=pool[g].filter(e=>e.index>previous&&withinScope(e)&&(!Object.keys(typeLimits).length||(counts[formatKey(e)]||0)<typeLimits[formatKey(e)])).sort(rank);
   const required=slots.slice(at).filter(x=>x===g).length;if(choices.length<required)return;
   for(const e of choices){const n=e.type?(uses.get(e.type)||0):0,key=formatKey(e);stack.push(e);countScope(e,1);last[g]=e.index;counts[key]=(counts[key]||0)+1;if(e.type)uses.set(e.type,n+1);search(at+1,duplicates+(n?1:0));stack.pop();countScope(e,-1);last[g]=previous;counts[key]--;if(e.type)n?uses.set(e.type,n):uses.delete(e.type);if(limited||bestRepeat===lower)break;}
  }search(0,0);
 }
 const items=best.map(e=>e.c),numeric=best.filter(e=>e.score!==null),average=numeric.length?numeric.reduce((n,e)=>n+e.score,0)/numeric.length:null;
 if(plan.summary)for(const g of plan.summary.groups){const members=items.filter(c=>scopeAllocation.chapterFor(c,plan.summary.groups)===g.id);g.count=members.length;g.writtenCount=g.writtenTarget===null?null:members.filter(c=>responseType(c.metadata)==='서술형').length;}
 return {items,eligible:eligible.length,reasons,complete:true,searchLimitReached:limited,diversity:diversitySummary(items,!limited,limited),...(plan.summary?{scopeAllocation:plan.summary}:{}),profileSummary:profile?{requested:quotas,actualAverage:numeric.length===best.length?Math.round(average*100)/100:null,numericCount:numeric.length,targetAverage:Number(profile.targetAverage),anchors,assignment:Object.fromEntries(best.map(e=>[e.c.question_id,e.group]))}:null};
}
function selectQuestions(candidates,rules){
 validateRules(rules);
 const {eligible,reasons,diagnostics}=inspectCandidates(candidates,rules);
 if(rules.scopeDistribution===true){const groups=scopeAllocation.scopeWeights(rules.units),sum=groups.reduce((n,g)=>n+g.weight,0);diagnostics.scopeInventory=groups.map(g=>{const rows=eligible.filter(c=>scopeAllocation.chapterFor(c,groups)===g.id);return {...g,target:rules.count*g.weight/sum,available:rows.length,writtenAvailable:rows.filter(c=>responseType(c.metadata)==='서술형').length};});diagnostics.scopeAmbiguous=eligible.filter(c=>scopeAllocation.chapterFor(c,groups)==='unassigned').length;}
 return {...compose(eligible,rules,reasons),diagnostics};
}

function paginate(items,height,gap=18){
 const pages=[{columns:[[],[]]}],overflows=[];let col=0,used=0;
 const advance=page=>{if(page||col===1){pages.push({columns:[[],[]]});col=0;}else col=1;used=0;};
 for(const item of items){const h=item.height+(item.workspaceMm||0)*96/25.4;if(!Number.isFinite(h)||h<0)throw Error('문항 크기를 측정하지 못했습니다.');
  if(item.breakBefore==='page'&&(used||col))advance(true);else if(item.breakBefore==='column'&&used)advance(false);
  if(used&&used+h>height)advance(false);if(h>height)overflows.push(item.questionId);
  pages.at(-1).columns[col].push({...item,top:used,height:h});used+=h+gap;
 }return {pages,overflows};
}
// Reserve two fixed vertical slots per column. A question taller than one
// slot gets a whole column; it is never clipped or silently compressed.
function paginateQuadrants(items,height,gap=18){
 return require('./exam-layout.js').paginateQuestionAreas(items,height,gap);
}
function sortMeasured(items){
 // Adjacent half-point intervals define similar difficulty, within low/middle/high.
 return items.map((item,index)=>({item,index})).sort((a,b)=>{
  const score=x=>x.item.scoreSnapshot==null?Infinity:Number(x.item.scoreSnapshot),bucket=x=>Math.floor(score(x)*2);
  const written=x=>Number(['서술형','proof','written_response'].includes(x.item.responseType));
  return written(a)-written(b)||bucket(a)-bucket(b)||a.item.height-b.item.height||score(a)-score(b)||a.index-b.index;
 }).map(x=>x.item);
}
module.exports={validateRules,sortMeasured,scopeFit,numericScore,compositionBand,difficultySummary,inspectCandidates,diversitySummary,questionType,responseType,profileCounts,profileAverage,profileForTarget,selectQuestions,paginate,paginateQuadrants};
