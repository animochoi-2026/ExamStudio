'use strict';
const C=require('./curriculum.js');
// Use the same supplied TOC and leaf IDs as the range picker. Whole chapters
// weigh one, regardless of how many leaves each chapter has.
function scopeWeights(ids=[]){
 const selected=new Set(ids),groups=[];
 for(const grade of C.tree)for(const term of grade.children)for(const chapter of term.children){
  const leaves=C.descendants(chapter.id),chosen=leaves.filter(id=>selected.has(id));
  if(chosen.length)groups.push({id:chapter.id,title:chapter.title,selected:chosen.length,total:leaves.length,weight:chosen.length/leaves.length,unitIds:chosen});
 }
 return groups;
}
function chapterFor(c,groups){
 const cl=c.metadata?.classification||{},s=cl.confirmed&&typeof cl.confirmed==='object'?cl.confirmed:cl;
 const primary=s.primaryUnit||cl.primaryUnit||cl.suggested?.primaryUnit;
 const id=typeof primary==='object'?primary.id:primary,name=typeof primary==='object'?primary.name:primary;
 const grade=C.gradeKey(c.metadata?.source?.grade),named=C.leaves.filter(n=>n.title===name&&(!grade||n.gradeId===grade));
 const leaf=C.leaves.find(n=>n.id===id)||(named.length===1?named[0]:null);
 if(leaf)return groups.find(g=>g.unitIds.includes(leaf.id))?.id||'unassigned';
 // Do not invent a primary chapter from an ambiguous multi-chapter solution.
 const evidence=c.confirmed?.scopeEvidence||cl.scopeEvidence||s;
 const units=(evidence.solutions||cl.suggested?.solutions||[]).flatMap(x=>x.unitIds||[]);
 const possible=groups.filter(g=>g.unitIds.some(id=>units.includes(id)));
 return possible.length===1?possible[0].id:'unassigned';
}
const EPS=1e-8,DEFAULT_BUDGET={milliseconds:250,plans:128,work:1500000,graphArcs:16384,queueItems:16384};
const now=()=>globalThis.performance?.now?.()??Date.now();
const error=(n,target)=>(n-target)**2;
function compare(a,b){for(let i=0;i<2;i++)if(Math.abs(a[i]-b[i])>EPS)return a[i]-b[i];return a[2]<b[2]?-1:a[2]>b[2]?1:0;}
function plus(a,b){return [a[0]+b[0],a[1]+b[1],a[2]+b[2]];}
const LIMIT=Symbol('scope allocation limit');
function budget(options={}){
 options||={};
 const limits=Object.fromEntries(Object.entries(DEFAULT_BUDGET).map(([key,max])=>[key,Number.isFinite(options[key])?Math.max(0,Math.min(max,options[key])):max])),start=now();let work=0;
 return {start,limits,check(amount=1){work+=amount;if(work>limits.work||now()-start>=limits.milliseconds)throw LIMIT;},get work(){return work;}};
}
function augment(graph,source,sink,count,guard){
 if(guard.limits.queueItems<1)throw LIMIT;
 const n=graph.length,zero=[0,0,0n];
 let flow=0;
 while(flow<count){
  const distance=Array(n).fill(null),previous=Array(n).fill(null),queue=[source],queued=Array(n).fill(false);distance[source]=zero;queued[source]=true;
  for(let h=0;h<queue.length;h++){
   const v=queue[h];queued[v]=false;guard.check(graph[v].length);
   for(let i=0;i<graph[v].length;i++){const e=graph[v][i];if(e.cap<=0)continue;const d=plus(distance[v],e.cost);if(distance[e.to]===null||compare(d,distance[e.to])<0){distance[e.to]=d;previous[e.to]={v,i};if(!queued[e.to]){queued[e.to]=true;if(queue.length>=guard.limits.queueItems)throw LIMIT;queue.push(e.to);}}}
  }
  if(distance[sink]===null)return flow;
  let amount=count-flow;for(let v=sink;v!==source;v=previous[v].v)amount=Math.min(amount,graph[previous[v].v][previous[v].i].cap);
  for(let v=sink;v!==source;v=previous[v].v){const p=previous[v],e=graph[p.v][p.i];e.cap-=amount;graph[v][e.rev].cap+=amount;}flow+=amount;
 }
 return flow;
}
// Project the relaxed scope solution onto the actual difficulty/format margins.
// Preserve its written distribution first, then its unspecified-format mix.
function nearestTable(rowNeeds,columnNeeds,caps,target,fs,guard){
 const nr=rowNeeds.length,nc=columnNeeds.length,source=nr+nc,sink=source+1,graph=Array.from({length:sink+1},()=>[]),edges=[];let arcs=0;
 const edge=(a,b,cap,cost=[0,0,0n])=>{arcs+=2;if(arcs>guard.limits.graphArcs)throw LIMIT;const e={to:b,cap,initial:cap,cost,rev:graph[b].length};graph[a].push(e);graph[b].push({to:a,cap:0,initial:0,cost:[-cost[0],-cost[1],-cost[2]],rev:graph[a].length-1});return e;};
 rowNeeds.forEach((n,i)=>edge(source,i,n));columnNeeds.forEach((n,i)=>edge(nr+i,sink,n));
 for(let i=0;i<caps.length;i++){const row=Math.floor(i/nc),format=i%nc,written=fs[format]==='서술형',list=[];
  for(let n=1;n<=Math.min(caps[i],rowNeeds[row],columnNeeds[format]);n++){const marginal=2*n-1-2*target[i];list.push(edge(row,nr+format,1,written?[marginal,0,0n]:[0,marginal,0n]));}edges.push(list);
 }
 if(augment(graph,source,sink,rowNeeds.reduce((a,b)=>a+b,0),guard)!==rowNeeds.reduce((a,b)=>a+b,0))return null;
 return edges.map(list=>list.reduce((n,e)=>n+e.initial-e.cap,0));
}
// Every table fixes only difficulty x format counts. With those counts fixed,
// convex chapter-total / chapter-written costs are an exact min-cost flow.
// This avoids enumerating millions of impossible chapter-total distributions.
function minimumFlow(cells,supplies,groups,targets,wtargets,written,count,guard){
 const source=0,offset=1+supplies.length,writtenOffset=offset+groups.length,sink=writtenOffset+groups.length,n=sink+1;
 const graph=Array.from({length:n},()=>[]),zero=[0,0,0n],edges=[];let arcs=0;
 const edge=(a,b,cap,cost=zero)=>{arcs+=2;if(arcs>guard.limits.graphArcs)throw LIMIT;const e={to:b,cap,initial:cap,cost,rev:graph[b].length};graph[a].push(e);graph[b].push({to:a,cap:0,initial:0,cost:[-cost[0],-cost[1],-cost[2]],rev:graph[a].length-1});return e;};
 const base=101n,totalTie=groups.map((_,i)=>-(base**BigInt(2*groups.length-i))),writtenTie=groups.map((_,i)=>-(base**BigInt(groups.length-i)));
 supplies.forEach((amount,i)=>edge(source,1+i,amount));
 for(const cell of cells){guard.check();edges.push(edge(1+cell.supply,cell.written?writtenOffset+cell.chapter:offset+cell.chapter,Math.min(count,cell.bucket.length)));}
 for(let i=0;i<groups.length;i++){
  const cap=Math.min(count,cells.filter(c=>c.chapter===i).reduce((n,c)=>n+c.bucket.length,0));
  const wcap=Math.min(count,cells.filter(c=>c.chapter===i&&c.written).reduce((n,c)=>n+c.bucket.length,0));
  for(let k=1;k<=cap;k++)edge(offset+i,sink,1,[2*k-1-2*targets[i],0,totalTie[i]]);
  if(written!==null)for(let k=1;k<=wcap;k++)edge(writtenOffset+i,offset+i,1,[0,2*k-1-2*wtargets[i],writtenTie[i]]);
  else edge(writtenOffset+i,offset+i,wcap);
 }
 const flow=augment(graph,source,sink,count,guard);if(flow!==count)return null;
 const amounts=edges.map(e=>e.initial-e.cap),totals=groups.map((_,i)=>cells.reduce((n,c,k)=>n+(c.chapter===i?amounts[k]:0),0)),ws=groups.map((_,i)=>cells.reduce((n,c,k)=>n+(c.chapter===i&&c.written?amounts[k]:0),0));
 return {amounts,totals,ws,cost:[totals.reduce((n,t,i)=>n+error(t,targets[i]),0),written===null?0:ws.reduce((n,w,i)=>n+error(w,wtargets[i]),0),totals.reduce((n,t,i)=>n+BigInt(t)*totalTie[i],0n)+(written===null?0n:ws.reduce((n,w,i)=>n+BigInt(w)*writtenTie[i],0n))]};
}
// Depth-first table enumeration has O(difficulty x format) live storage.
// Residual row/column supply bounds reject impossible cross-filter cells early.
function* tables(rowNeeds,columnNeeds,caps,seed,guard){
 const nr=rowNeeds.length,nc=columnNeeds.length,values=Array(nr*nc).fill(0),rows=[...rowNeeds],columns=[...columnNeeds];
 function* search(at){
  guard.check();if(at===values.length){if(rows.every(n=>n===0)&&columns.every(n=>n===0))yield [...values];return;}
  const r=Math.floor(at/nc),c=at%nc;
  const rowRoom=Array.from({length:nc-c-1},(_,i)=>Math.min(caps[r*nc+c+1+i],columns[c+1+i])).reduce((a,b)=>a+b,0);
  const colRoom=Array.from({length:nr-r-1},(_,i)=>Math.min(caps[(r+1+i)*nc+c],rows[r+1+i])).reduce((a,b)=>a+b,0);
  const lo=Math.max(0,rows[r]-rowRoom,columns[c]-colRoom),hi=Math.min(rows[r],columns[c],caps[at]);
  if(lo>hi)return;const preferred=Math.max(lo,Math.min(hi,seed[at]||0));
  for(let distance=0;distance<=Math.max(preferred-lo,hi-preferred);distance++)for(const v of distance?[preferred+distance,preferred-distance]:[preferred]){
   if(v<lo||v>hi)continue;values[at]=v;rows[r]-=v;columns[c]-=v;yield* search(at+1);rows[r]+=v;columns[c]+=v;
  }
 }
 yield* search(0);
}
function planScope(entries,quotas,typeLimits,rules,initial){
 const groups=scopeWeights(rules.units);if(groups.length<2)return {buckets:initial.buckets,summary:null};
 const guard=budget(rules.scopeSearchBudget),chapters=new Map(entries.map(e=>[e.index,chapterFor(e.c,groups)]));
 const unknown=entries.filter(e=>chapters.get(e.index)==='unassigned').length;
 if(unknown)groups.push({id:'unassigned',title:'대단원 분류 미확정',selected:0,total:0,weight:0,unitIds:[]});
 const weight=groups.reduce((n,g)=>n+g.weight,0),targets=groups.map(g=>rules.count*g.weight/weight),written=Object.hasOwn(rules.types||{},'서술형')?rules.types['서술형']:null;
 const wtargets=groups.map(g=>(written??0)*g.weight/weight),gs=Object.keys(quotas),fs=Object.keys(typeLimits).length?Object.keys(typeLimits):['*'];
 const cells=[],byEntry=new Map();
 for(const [chapter,g]of groups.entries())for(const [difficulty,band]of gs.entries())for(const [format,f]of fs.entries()){
  const bucket=entries.filter(e=>chapters.get(e.index)===g.id&&e.group===band&&(f==='*'?!Object.hasOwn(typeLimits,e.format):e.format===f));
  if(bucket.length){const cell={chapter,difficulty,format,supply:difficulty*fs.length+format,g:band,f,bucket,written:f==='서술형'};for(const e of bucket)byEntry.set(e.index,cells.length);cells.push(cell);}
 }
 const caps=groups.map((_,i)=>cells.filter(c=>c.chapter===i).reduce((n,c)=>n+c.bucket.length,0)),wcaps=groups.map((_,i)=>cells.filter(c=>c.chapter===i&&c.written).reduce((n,c)=>n+c.bucket.length,0));
 // Preserve a proven feasible complete selection before starting any optimizer.
 const seed=Array(gs.length*fs.length).fill(0),fallback=Array(cells.length).fill(0);
 for(const b of initial.buckets){seed[gs.indexOf(b.g)*fs.length+fs.indexOf(b.f)]=b.count;for(const e of b.bucket.slice(0,b.count))fallback[byEntry.get(e.index)]++;}
 function score(amounts){
  const totals=groups.map((_,i)=>cells.reduce((n,c,k)=>n+(c.chapter===i?amounts[k]:0),0)),ws=groups.map((_,i)=>cells.reduce((n,c,k)=>n+(c.chapter===i&&c.written?amounts[k]:0),0));
  const b=101n,tie=totals.reduce((n,t,i)=>n-BigInt(t)*b**BigInt(2*groups.length-i),0n)+(written===null?0n:ws.reduce((n,w,i)=>n-BigInt(w)*b**BigInt(groups.length-i),0n));
  return {amounts,totals,ws,cost:[totals.reduce((n,t,i)=>n+error(t,targets[i]),0),written===null?0:ws.reduce((n,w,i)=>n+error(w,wtargets[i]),0),tie]};
 }
 let best=score(fallback),lower=null,ideal=null,limited=false,plans=0,enumerated=false;
 const rowNeeds=gs.map(g=>quotas[g]),columnNeeds=fs.map(f=>typeLimits[f]??rules.count),tableCaps=seed.map((_,i)=>cells.filter(c=>c.supply===i).reduce((n,c)=>n+c.bucket.length,0));
 try{
  // Rounding is determined by the selected range, not the bank inventory.
  // Reuse the same total-then-written allocator with unconstrained supply.
  const idealCells=groups.flatMap((g,chapter)=>g.weight?fs.map((f,format)=>({chapter,supply:format,written:f==='서술형',bucket:{length:rules.count}})):[]);
  ideal=minimumFlow(idealCells,columnNeeds,groups,targets,wtargets,written,rules.count,guard);
  // Relax difficulty only: the lower bound still honors actual chapter x format
  // inventory, including the written/total coupling. It proves common cases.
  const relaxed=cells.map(c=>({...c,supply:c.format}));
  lower=minimumFlow(relaxed,columnNeeds,groups,targets,wtargets,written,rules.count,guard);
  const targetTable=seed.map((_,i)=>cells.reduce((n,c,k)=>n+(c.supply===i?(lower?.amounts[k]||0):0),0));
  const preferred=lower?nearestTable(rowNeeds,columnNeeds,tableCaps,targetTable,fs,guard):seed;
  const center=preferred||seed;
  if(plans>=guard.limits.plans)throw LIMIT;plans++;
  const first=minimumFlow(cells,center,groups,targets,wtargets,written,rules.count,guard);
  if(first&&compare(first.cost,best.cost)<0)best=first;
  if(!lower||compare(best.cost,lower.cost)!==0){
   for(const table of tables(rowNeeds,columnNeeds,tableCaps,center,guard)){
    if(table.every((n,i)=>n===center[i]))continue;
    if(plans>=guard.limits.plans)throw LIMIT;
    plans++;const result=minimumFlow(cells,table,groups,targets,wtargets,written,rules.count,guard);
    if(result&&compare(result.cost,best.cost)<0)best=result;
    if(lower&&compare(best.cost,lower.cost)===0)break;
   }
   enumerated=true;
  }
 }catch(e){if(e!==LIMIT)throw e;limited=true;}
 const proven=!!lower&&compare(best.cost,lower.cost)===0||enumerated&&!limited;
 return {buckets:cells.map((c,i)=>({...c,count:best.amounts[i]})),summary:{metric:'squared-distance-total-then-written',optimal:proven,roundingSatisfied:!!ideal&&Math.abs(best.cost[0]-ideal.cost[0])<EPS&&Math.abs(best.cost[1]-ideal.cost[1])<EPS,roundingError:ideal?{total:ideal.cost[0],written:written===null?null:ideal.cost[1]}:null,searchLimitReached:limited&&!proven,search:{plans,work:guard.work,milliseconds:Math.round((now()-guard.start)*100)/100,limits:guard.limits,frontier:'depth-first O(difficulty*format); no candidate heap'},lowerBound:lower?{totalError:lower.cost[0],writtenError:written===null?null:lower.cost[1]}:null,unknownCandidates:unknown,groups:groups.map((g,i)=>({...g,target:targets[i],roundedTarget:ideal?.totals[i]??null,count:best.totals[i],writtenTarget:written===null?null:wtargets[i],roundedWrittenTarget:written===null?null:ideal?.ws[i]??null,writtenCount:written===null?null:best.ws[i],available:caps[i],writtenAvailable:wcaps[i]})),totalError:best.cost[0],writtenError:written===null?null:best.cost[1]}};
}
module.exports={scopeWeights,chapterFor,planScope};
