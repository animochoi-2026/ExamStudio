'use strict';
const B=require('../app/bank-exam-model.cjs'),sets=require('../app/question-sets.cjs'),W=require('./written-counts.cjs');
const clone=x=>structuredClone(x),bands=['low','middle','high'],formats=['선택형','서술형'];
const id=c=>c.question_id||c.questionId,school=c=>c.metadata?.source?.school||'학교 정보 확인 필요';
function identity(c){return c.originalId||c.catalogSnapshot?.originalId||c.metadata?.relations?.originalQuestionId||c.catalogSnapshot?.metadata?.relations?.originalQuestionId||id(c);}
// Successive shortest augmenting paths: maximum cardinality, then minimum
// relaxation cost for fixed type/band slots. Reverse edges reassign a flexible
// paper's candidates when a more restricted paper needs them.
function match(slots,candidates,allowed,cost){
 const n=2+slots.length+candidates.length,source=n-2,sink=n-1,g=Array.from({length:n},()=>[]),links=[];
 const edge=(a,b,cap,w)=>{const x={to:b,cap,cost:w,rev:g[b].length};g[a].push(x);g[b].push({to:a,cap:0,cost:-w,rev:g[a].length-1});return x;};
 candidates.forEach((c,j)=>edge(source,slots.length+j,1,0));slots.forEach((s,i)=>edge(i,sink,1,0));
 for(let i=0;i<slots.length;i++)for(let j=0;j<candidates.length;j++)if(allowed(slots[i],candidates[j]))links.push({i,j,e:edge(slots.length+j,i,1,cost(slots[i],candidates[j]))});
 let total=0,value=0;
 for(;;){const dist=Array(n).fill(Infinity),prev=Array(n),queue=[source],inQ=new Set(queue);dist[source]=0;
  for(let h=0;h<queue.length;h++){const a=queue[h];inQ.delete(a);for(let k=0;k<g[a].length;k++){const e=g[a][k];if(e.cap&&dist[e.to]>dist[a]+e.cost){dist[e.to]=dist[a]+e.cost;prev[e.to]=[a,k];if(!inQ.has(e.to)){queue.push(e.to);inQ.add(e.to);}}}}
  if(!Number.isFinite(dist[sink]))break;for(let b=sink;b!==source;){const [a,k]=prev[b],e=g[a][k];e.cap--;g[b][e.rev].cap++;b=a;}total++;value+=dist[sink];
 }
 return {rows:links.filter(x=>x.e.cap===0).map(x=>({slot:slots[x.i],candidate:candidates[x.j]})),total,cost:value};
}
function slotsFor(rules,pool){
 const quotas=B.profileCounts(rules.count,rules.profile),slots=[];
 // Let available formats determine the band/type cross-table; equal percentage
 // rounding separately per format would manufacture false difficulty shortages.
 const capacity=new Map();for(const c of pool){const key=B.responseType(c.metadata)+'|'+B.compositionBand(c);capacity.set(key,(capacity.get(key)||0)+1);}
 // Small transportation network implemented as token matching; available bucket
 // capacity is enforced by removing one token for each exact assignment below.
 const left={...rules.types},remaining={...quotas};
 const buckets=formats.flatMap(type=>bands.map(band=>({type,band,n:capacity.get(type+'|'+band)||0})));
 const source=0,t0=1,b0=3,sink=6,g=Array.from({length:7},()=>[]),edges=[];
 const edge=(a,b,n)=>{const e={to:b,n,initial:n,rev:g[b].length};g[a].push(e);g[b].push({to:a,n:0,rev:g[a].length-1});return e;};
 formats.forEach((t,i)=>edge(source,t0+i,rules.types[t]||0));bands.forEach((b,i)=>edge(b0+i,sink,quotas[b]));
 for(const b of buckets)edges.push({...b,e:edge(t0+formats.indexOf(b.type),b0+bands.indexOf(b.band),b.n)});
 for(;;){const prev=Array(7),q=[source];prev[source]=true;for(let h=0;h<q.length;h++)for(const [k,e]of g[q[h]].entries())if(e.n&&!prev[e.to]){prev[e.to]=[q[h],k];q.push(e.to);}if(!prev[sink])break;for(let b=sink;b!==source;){const [a,k]=prev[b],e=g[a][k];e.n--;g[b][e.rev].n++;b=a;}}
 for(const {type,band,e}of edges)for(let n=e.initial-e.n;n>0;n--){slots.push({type,band});left[type]--;remaining[band]--;}
 for(const type of formats)for(const band of bands)while(left[type]>0&&remaining[band]>0){slots.push({type,band});left[type]--;remaining[band]--;}
 return slots.map((s,i)=>({...s,key:String(i)}));
}
function report(paper){
 const meta=paper.autoComposition;if(!meta)return null;
 const planned=clone(meta.planned),actual={total:paper.items.length,types:{선택형:0,서술형:0},difficulty:{low:0,middle:0,high:0,unknown:0}},foreign={},supplements=[];
 for(const i of paper.items){const c=i.catalogSnapshot||{},type=B.responseType(c.metadata)||B.responseType({content:{responseType:i.responseType}}),band=B.compositionBand(c)||'unknown';actual.types[type]=(actual.types[type]||0)+1;actual.difficulty[band]=(actual.difficulty[band]||0)+1;if(type==='서술형'&&!meta.schools.includes(school(c)))foreign[school(c)]=(foreign[school(c)]||0)+1;}
 const deficits=bands.flatMap(b=>Array(Math.max(0,planned.difficulty[b]-actual.difficulty[b])).fill(b)),excess={};for(const b of bands)excess[b]=Math.max(0,actual.difficulty[b]-planned.difficulty[b]);
 const transfers=[];
 for(const i of paper.items){const c=i.catalogSnapshot||{},b=B.compositionBand(c),other=B.responseType(c.metadata)==='서술형'&&!meta.schools.includes(school(c));let from=null;if(excess[b]>0&&deficits.length){from=deficits.shift();excess[b]--;transfers.push({from,to:b,questionId:i.questionId});}if(other||from)supplements.push({questionId:i.questionId,originalId:identity(c),school:school(c),reason:other?(from?'school_and_difficulty':'other_school_written'):'difficulty_relaxed',plannedBand:from||b,actualBand:b});}
 const missing=Object.fromEntries(formats.map(t=>[t,Math.max(0,planned.types[t]-actual.types[t])])),changed=bands.some(b=>planned.difficulty[b]!==actual.difficulty[b])||Object.keys(foreign).length>0||Object.values(missing).some(Boolean);
 meta.actual=actual;meta.supplements=supplements;meta.missing=missing;meta.foreignSchools=foreign;meta.transfers=transfers;meta.changed=changed;meta.preferredWrittenShortage=Object.values(foreign).reduce((a,b)=>a+b,0)+missing.서술형;
 return meta;
}
function compose({document:doc,snapshot,targetIds,repair=false,onProgress=()=>{}}){
 const M=require('./mock-exam-model.cjs'),targets=new Set(targetIds),variants=doc.variants.filter(v=>targets.has(v.id)).sort((a,b)=>a.id.localeCompare(b.id));
 if(!variants.length||variants.length!==targets.size)throw Error('출제 대상 유형을 확인하세요.');
 if(!Array.isArray(snapshot.candidates))throw Error('후보 조회 결과를 확인할 수 없습니다.');
 const excluded=new Set([...(snapshot.excludeIds||[]),...(snapshot.exclusions||[]).flatMap(x=>[x.originalId,x.questionId]).filter(Boolean)]);
 const usable=new Set(variants.flatMap(v=>B.inspectCandidates(snapshot.candidates,{...(repair&&v.paper?.autoComposition?v.paper.rules:M.rulesFor(doc,v,[])),schools:[],supplementIds:[]}).eligible.map(id)));
 const rows=new Map();for(const c of snapshot.candidates.filter(c=>usable.has(id(c))).sort((a,b)=>Number(id(b)===identity(b))-Number(id(a)===identity(a))||String(id(a)).localeCompare(String(id(b))))){const root=identity(c);if(!excluded.has(id(c))&&!excluded.has(root)&&!rows.has(root)&&c.metadata?.source?.kind==='학교기출')rows.set(root,c);}
 const locked=new Set();for(const v of doc.variants.filter(v=>!targets.has(v.id)))for(const i of v.paper?.items||[])locked.add(identity(i));
 const plans=variants.map(v=>{const rules=repair&&v.paper?.autoComposition?clone(v.paper.rules):M.rulesFor(doc,v,[]),meta=repair&&v.paper?.autoComposition,schools=meta?meta.schools:doc.schools;
  const eligible=B.inspectCandidates([...rows.values()],{...rules,schools:[],supplementIds:[]}).eligible.filter(c=>schools.includes(school(c))||B.responseType(c.metadata)==='서술형');
  const scopeIds=new Set(eligible.map(identity)),preferred=eligible.filter(c=>schools.includes(school(c))),planned=meta?clone(meta.planned):{total:rules.count,types:clone(rules.types),difficulty:B.profileCounts(rules.count,rules.profile)};
  let writtenSlot=0;const configuredSlots=meta?clone(meta.slots):slotsFor(rules,preferred).map(s=>({...s,points:s.type==='서술형'?W.points(doc.counts[v.kind],writtenSlot++):(doc.counts[v.kind].choicePoints??4)}));const slots=configuredSlots.map((s,i)=>({...s,key:s.key??String(i),variant:v.id})),fixed=[];
  if(repair){const valid=(v.paper?.items||[]).filter(i=>!excluded.has(i.questionId)&&!excluded.has(identity(i)));const brokenSets=new Set((v.paper?.items||[]).filter(i=>!valid.includes(i)&&i.questionSet).map(i=>i.questionSet.id));for(const i of valid){if(i.questionSet&&brokenSets.has(i.questionSet.id))continue;const type=B.responseType(i.catalogSnapshot?.metadata)||B.responseType({content:{responseType:i.responseType}}),band=B.compositionBand(i.catalogSnapshot||{});const named=slots.findIndex(s=>s.key===i.autoSlot&&s.type===type),at=named>=0?named:slots.findIndex(s=>s.type===type&&s.band===band);const index=at>=0?at:slots.findIndex(s=>s.type===type);if(index<0)throw Error('저장된 계획과 문항 형식이 다릅니다.');fixed.push({slot:slots.splice(index,1)[0],item:clone(i)});locked.add(identity(i));}}
  return {v,rules,schools,eligible,scopeIds,slots,fixed,planned,allSlots:clone(configuredSlots)};
 });
 const slots=plans.flatMap(p=>p.slots),byVariant=new Map(plans.map(p=>[p.v.id,p])),pool=[...rows.values()].filter(c=>!locked.has(identity(c)));
 const allowed=(s,c)=>byVariant.get(s.variant).scopeIds.has(identity(c))&&s.type===B.responseType(c.metadata);
 const scale=Math.max(2,slots.length+1),cost=(s,c)=>{const p=byVariant.get(s.variant),foreign=!p.schools.includes(school(c)),different=s.band!==B.compositionBand(c);return (foreign?scale*scale:0)+(different?(foreign?scale:1):0);};
 onProgress({message:'시험지 전체의 부족 조건과 공통 후보를 함께 배정 중'});
 // A linked source set is indivisible. Preserve it as a bundle, never emit a
 // partial set. Constrained bundles are considered before flexible bundles.
 const groups=sets.units(pool,{strict:false}),singles=groups.filter(g=>g.length===1).flat(),bundles=groups.filter(g=>g.length>1);
 let rest=[...slots],fixed=[],best=match(rest,singles,allowed,cost),bundleWork=0,bundleLimited=false;
 // Explore bundle ownership jointly with the single-question matching. Keeping
 // the best feasible result makes the bounded set search explicit, not a claim
 // that a search budget means the question bank is empty.
 const orderedBundles=bundles.sort((a,b)=>plans.filter(p=>a.every(c=>p.scopeIds.has(identity(c)))).length-plans.filter(p=>b.every(c=>p.scopeIds.has(identity(c)))).length||String(id(a[0])).localeCompare(String(id(b[0]))));
 let bestTotal=best.total,bestCost=best.cost;
 function visit(at,free,chosen,chosenCost){if(++bundleWork>128){bundleLimited=true;return;}const single=match(free,singles,allowed,cost),total=chosen.length+single.total,value=chosenCost+single.cost;
  if(total>bestTotal||total===bestTotal&&value<bestCost){bestTotal=total;bestCost=value;rest=free;fixed=chosen;best=single;}
  if(at===orderedBundles.length)return;const group=orderedBundles[at],options=plans.map(p=>match(free.filter(s=>s.variant===p.v.id),group,allowed,cost)).filter(r=>r.total===group.length).sort((a,b)=>a.cost-b.cost||a.rows[0].slot.variant.localeCompare(b.rows[0].slot.variant));
  for(const option of options){const used=new Set(option.rows.map(r=>r.slot));visit(at+1,free.filter(s=>!used.has(s)),[...chosen,...option.rows],chosenCost+option.cost);if(bundleLimited)break;}if(!bundleLimited)visit(at+1,free,chosen,chosenCost);
 }
 if(bundles.length)visit(0,[...slots],[],0);
 // Different formats can share the same total difficulty plan. Improve their
 // cross-table jointly rather than freezing per-format percentage rounding.
 for(let pass=0;pass<2;pass++){let improved=false;for(const p of plans){const own=rest.filter(s=>s.variant===p.v.id);for(const a of bands)for(const b of bands){if(a===b)continue;const x=own.find(s=>s.type==='선택형'&&s.band===a),y=own.find(s=>s.type==='서술형'&&s.band===b);if(!x||!y)continue;[x.band,y.band]=[y.band,x.band];const trial=match(rest,singles,allowed,cost);if(trial.total>best.total||trial.total===best.total&&trial.cost<best.cost){best=trial;improved=true;}else [x.band,y.band]=[y.band,x.band];}}if(!improved)break;}
 const assigned=[...fixed,...best.rows];
 const updates=plans.map(p=>{const entries=assigned.filter(r=>r.slot.variant===p.v.id),items=[...p.fixed.map(r=>r.item),...entries.map(({candidate,slot})=>{const c=p.eligible.find(c=>id(c)===id(candidate));return ({questionId:c.question_id,revisionId:c.revision_id,responseType:B.responseType(c.metadata),scoreSnapshot:B.numericScore(c),selectedSolutionId:c.selectedSolutionId,solutionSnapshot:clone(c.selectedSolution||null),catalogSnapshot:clone(c),questionSet:clone(c.questionSet||null),workspaceMm:15,breakBefore:null,autoSlot:slot.key,points:slot.points});})];
  if(repair){const remaining=new Map(items.map(i=>[i.questionId,i])),bySlot=new Map(items.map(i=>[i.autoSlot,i])),ordered=[];for(const old of p.v.paper.items){const candidate=remaining.get(old.questionId)||bySlot.get(old.autoSlot);if(candidate&&remaining.has(candidate.questionId)){ordered.push(candidate);remaining.delete(candidate.questionId);}}items.splice(0,items.length,...ordered,...remaining.values());}const paper={...(repair?clone(p.v.paper):{}),id:p.v.id,version:0,title:M.paperTitle(doc,p.v),answerMode:p.v.paper?.answerMode||'quick',paperForm:clone(repair?p.v.paper.paperForm:doc.paperForm),scoring:clone(doc.counts[p.v.kind]),print:clone(p.v.paper?.print||{paper:'A4',columns:2,marginsMm:{top:20,right:15,bottom:18,left:15}}),rules:p.rules,items:sets.ordered(items),snapshotId:snapshot.id,snapshotAt:snapshot.at,exclusions:clone(snapshot.exclusions||[]),autoComposition:{schema:1,policy:'unique-auto-fill-v1',planned:p.planned,schools:clone(p.schools),slots:p.allSlots}};
  if(paper.paperForm){const choice=items.filter(i=>i.responseType==='선택형').length;paper.paperForm.scoreNote='객관식 '+choice+'문항 · 서술형 '+(items.length-choice)+'문항 · 총 '+items.reduce((n,i)=>n+Number(i.points||0),0)+'점';}delete paper.layout;delete paper.scopeAllocation;delete paper.supplementAdjustment;report(paper);return {id:p.v.id,paper};
 });
 const ids=updates.flatMap(u=>u.paper.items.map(identity));if(new Set(ids).size!==ids.length||ids.some(q=>locked.has(q)&&!plans.some(p=>p.fixed.some(r=>identity(r.item)===q))))throw Error('자동 구성 중복 검사 실패');
 const total=updates.reduce((n,u)=>n+u.paper.items.length,0)+doc.variants.filter(v=>!targets.has(v.id)).reduce((n,v)=>n+(v.paper?.items.length||0),0);
 return {complete:true,updates,sharing:{distinct:new Set([...locked,...ids]).size,total,optimal:false,method:'joint-min-cost-slot-matching-with-bundle-preservation',bundleSearchLimited:bundleLimited,bundleWork},automatic:true};
}
module.exports={compose,report,identity,match,slotsFor};
