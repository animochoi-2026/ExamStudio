const supplementPlan=require('./supplement-plan.cjs');
const insights=require('./result-insights.cjs');
const questionSets=require('../app/question-sets.cjs');
'use strict';
const model=require('../app/bank-exam-model.cjs');
const writtenCounts=require('./written-counts.cjs');
const scope=require('../app/exam-scope-allocation.cjs');
const clone=x=>structuredClone(x);
const kindName=k=>typeof k==='string'&&/^[A-Z]+$/.test(k);
const defaultCounts={A:{short:0,choice:19,written:4,choicePoints:4,writtenPoints:6},B:{short:0,choice:25,written:0,choicePoints:4,writtenPoints:6},C:{short:0,choice:0,written:10,choicePoints:4,writtenPoints:10}};
const formats=[['choice','객관식','선택형'],['written','서술형','서술형']];
function countSummary(input){const counts=writtenCounts.normalize(input);return [...(counts.choice>0?[`객관식 ${counts.choice}개 × ${counts.choicePoints??4}점`]:[]),...writtenCounts.groups(counts).filter(g=>g.count>0).map(g=>`서술형 ${g.count}개 × ${g.points}점`)].join(' · ');}
function totalPoints(input){const c=writtenCounts.normalize(input);return Number(c.choice||0)*Number(c.choicePoints??4)+writtenCounts.groups(c).reduce((n,g)=>n+g.count*g.points,0);}
function create(id){return {schema:1,id,version:0,title:'실전모의고사 A1',autoTitle:true,schoolMode:'priority',paperForm:null,counts:clone(defaultCounts),profile:{low:30,middle:50,high:20,targetAverage:null},schools:[],excludeExamIds:[],variants:[]};}
function autoName(doc){if(doc.autoTitle)rename(doc,'실전모의고사 '+doc.variants.map(v=>v.label).join('·'));}
function paperTitle(doc,v){return [doc.title.trim(),v.label].filter(Boolean).join(' ');}
function rename(doc,title){doc.title=title;for(const v of doc.variants)if(v.paper){v.paper.title=paperTitle(doc,v);v.paper.examTitle=doc.title;v.paper.variantLabel=v.label;v.paper.roundLabel=doc.title.match(/\d+\s*회/)?.[0]||'';}}
function normalize(document){const doc=clone(document);doc.counts||={};for(const k of ['A','B','C']){if(!doc.counts[k]||(doc.counts[k].choice==null&&!doc.counts[k].written&&!doc.counts[k].short&&!doc.variants.some(v=>v.kind===k&&v.paper)))doc.counts[k]=clone(defaultCounts[k]);}for(const [kind,count]of Object.entries(doc.counts)){doc.counts[kind]=writtenCounts.normalize(count);delete count.short;delete count.shortPoints;Object.assign(count,doc.counts[kind]);doc.counts[kind]=count;for(const [k]of formats)count[k+'Points']??=defaultCounts[kind]?.[k+'Points']??4;}rename(doc,doc.title);return doc;}
function addKind(doc){let n=0,k;do{let v=++n;k='';while(v){v--;k=String.fromCharCode(65+v%26)+k;v=Math.floor(v/26);}}while(doc.counts[k]);doc.counts[k]={choice:0,written:0,choicePoints:4,writtenPoints:6};return k;}
function addVariant(doc,kind,id){if(!kindName(kind)||!doc.counts[kind]||doc.variants.some(v=>v.id===id))throw Error('유형 식별자를 확인하세요.');const serial=Math.max(0,...doc.variants.filter(v=>v.kind===kind).map(v=>v.serial))+1;doc.variants.push({id,kind,serial,label:kind+serial,units:[],paper:null});}
function effectiveProfile(profile){return {...clone(profile),targetAverage:profile.targetAverage==null||profile.targetAverage===''?model.profileAverage(profile):Number(profile.targetAverage)};}
function rulesFor(doc,variant,excluded=[]){
 const counts=writtenCounts.normalize(doc.counts[variant.kind]||{}),choice=counts.choice,written=counts.written??0;
 if(!Number.isInteger(choice)||choice<0||!Number.isInteger(written)||written<0||choice+written<1)throw Error(variant.label+'의 '+variant.kind+'형 객관식·서술형 수를 0 이상, 합계 1 이상으로 지정하세요.');
 if(!variant.units?.length)throw Error(variant.label+' 시험범위를 선택하세요.');
 if(!doc.schools?.length)throw Error('출처 학교를 선택하세요.');
 const rules={count:choice+written,types:{선택형:choice,서술형:written},profile:effectiveProfile(doc.profile),units:clone(variant.units),schools:clone(doc.schools),schoolMode:doc.schoolMode,excludeIds:excluded,...(variant.supplementIds?.length?{supplementIds:clone(variant.supplementIds)}:{}),supplementRequiredIds:clone(variant.supplementRequiredIds||[]),scopeDistribution:true};model.validateRules(rules);return rules;
}
function excludedIds(documents){return [...new Set(documents.flatMap(d=>d.variants.flatMap(v=>(v.paper?.items||[]).map(i=>i.questionId))))];}
function item(c){return {questionId:c.question_id,revisionId:c.revision_id,responseType:model.responseType(c.metadata),scoreSnapshot:model.numericScore(c),selectedSolutionId:c.selectedSolutionId,solutionSnapshot:clone(c.selectedSolution||null),catalogSnapshot:clone(c),questionSet:clone(c.questionSet||null),workspaceMm:15,breakBefore:null};}
const factsCache=new WeakMap();
function facts(c,rules,seed){let cache=factsCache.get(rules);if(!cache){cache=new WeakMap();factsCache.set(rules,cache);}if(!cache.has(c))cache.set(c,{band:model.compositionBand(c),format:model.responseType(c.metadata),chapter:seed.scopeAllocation?scope.chapterFor(c,seed.scopeAllocation.groups):null});return cache.get(c);}
function valid(items,rules,seed){
 if(seed.schoolAllocation&&Object.entries(seed.schoolAllocation.counts).some(([school,n])=>items.filter(c=>c.metadata?.source?.school===school).length!==n))return false;
 if(!questionSets.complete(items))return false;
 if((rules.supplementRequiredIds||[]).some(id=>!items.some(c=>c.question_id===id)))return false;
 if(items.length!==rules.count||new Set(items.map(c=>c.question_id)).size!==items.length)return false;
 const quotas=model.profileCounts(rules.count,rules.profile);
 if(Object.entries(quotas).some(([k,n])=>items.filter(c=>facts(c,rules,seed).band===k).length!==n))return false;
 if(Object.entries(rules.types).some(([k,n])=>items.filter(c=>facts(c,rules,seed).format===k).length!==n))return false;
 const summary=seed.scopeAllocation;if(!summary)return true;
 const totals=summary.groups.map(g=>items.filter(c=>facts(c,rules,seed).chapter===g.id));
 const err=totals.reduce((s,a,i)=>s+(a.length-summary.groups[i].target)**2,0);
 const werr=totals.reduce((s,a,i)=>s+(a.filter(c=>model.responseType(c.metadata)==='서술형').length-summary.groups[i].writtenTarget)**2,0);
 return Math.abs(err-summary.roundingError.total)<1e-8&&(summary.roundingError.written===null||Math.abs(werr-summary.roundingError.written)<1e-8);
}
// Independent feasibility is exact up to the existing allocator's explicit
// search-limit result. Sharing never changes the constraints or a failed plan.
function compose({document,snapshot,targetIds,exactWork=150000,onProgress=()=>{}}){
 const doc=clone(document),targets=new Set(targetIds),variants=doc.variants.filter(v=>targets.has(v.id));
 if(variants.length!==targets.size||!variants.length)throw Error('출제 대상 유형을 확인하세요.');
 const excluded=snapshot.excludeIds||[],locked=doc.variants.filter(v=>!targets.has(v.id)&&v.paper),frozen=new Map();
 for(const v of locked)for(const i of v.paper.items){const old=frozen.get(i.questionId);if(old&&old.revision_id!==i.revisionId)throw Error('유지할 유형 사이에 동일 문항의 버전이 다릅니다. 전체 재출제로 버전을 맞추세요.');frozen.set(i.questionId,i.catalogSnapshot);}
 // Do not silently substitute a new revision for a shared locked question.
 const byId=new Map((snapshot.candidates||[]).map(c=>[c.question_id,c]));for(const [id,c]of frozen)if(c)byId.set(id,c);
 const candidates=[...byId.values()],plans=[],failures=[];
 for(const v of variants){onProgress({message:v.label+' 범위·난이도·학교 구성 계산 중'});const rules=rulesFor(doc,v,excluded),pool=candidates.filter(c=>baseCandidate(doc,c)||v.supplementIds?.includes(c.question_id)),seed=rules.supplementRequiredIds?.length?supplementPlan.select(pool,rules):model.selectQuestions(pool,rules);if(!seed.complete){failures.push({id:v.id,label:v.label,...seed});continue;}const eligible=model.inspectCandidates(pool,rules).eligible;plans.push({v,rules:seed.rules||rules,seed,eligible,items:seed.items});}
 if(failures.length)return {complete:false,failures};
 const support=new Map(),uses=new Map();for(const p of plans)for(const c of p.eligible)support.set(c.question_id,(support.get(c.question_id)||0)+1);
 const lockedIds=new Set(frozen.keys());for(const id of lockedIds)uses.set(id,1);
 const rank=(a,b)=>(Number(lockedIds.has(b.question_id))-Number(lockedIds.has(a.question_id)))||((support.get(b.question_id)||0)-(support.get(a.question_id)||0))||a.question_id.localeCompare(b.question_id);
 // Joint eligibility ranking and nested prefixes align overlapping bucket
 // selections across A/B and subset-only overlaps, including unequal quotas.
 for(const p of plans){if(p.rules.supplementRequiredIds?.length||p.eligible.some(questionSets.descriptor))continue;const groups=scope.scopeWeights(p.rules.units),key=c=>[model.compositionBand(c),model.responseType(c.metadata),scope.chapterFor(c,groups),p.seed.schoolAllocation?c.metadata?.source?.school:''].join('|');const buckets=new Map();for(const c of p.eligible){const k=key(c);if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(c);}for(const b of buckets.values())b.sort(rank);const counts=new Map();for(const c of p.items)counts.set(key(c),(counts.get(key(c))||0)+1);p.items=[...counts].flatMap(([k,n])=>buckets.get(k).slice(0,n));for(const c of p.items)uses.set(c.question_id,(uses.get(c.question_id)||0)+1);}
 // Coordinate swaps can cross bucket cells whenever the full constraints hold.
 onProgress({message:'조건을 유지하며 유형 간 공통문항을 조정 중'});for(let pass=0;pass<3;pass++){let changed=false;for(const p of plans){const chosen=new Set(p.items.map(c=>c.question_id));const shared=p.eligible.filter(c=>!chosen.has(c.question_id)&&uses.has(c.question_id)).sort(rank);for(let i=0;i<p.items.length;i++){const old=p.items[i];if(uses.get(old.question_id)!==1||lockedIds.has(old.question_id))continue;for(const c of shared){if(chosen.has(c.question_id))continue;const next=[...p.items];next[i]=c;if(!valid(next,p.rules,p.seed))continue;p.items=next;chosen.delete(old.question_id);chosen.add(c.question_id);uses.delete(old.question_id);uses.set(c.question_id,uses.get(c.question_id)+1);changed=true;break;}}}if(!changed)break;}
 let optimal=false,work=0,limited=false;const objective=ps=>new Set([...lockedIds,...ps.flatMap(p=>p.items.map(c=>c.question_id))]).size;let best=plans.map(p=>[...p.items]),bestSize=objective(plans);
 // Exhaustive bounded comparison for small banks, with a valid large-bank
 // fallback already in hand. A budget exhaustion is never a shortage.
 if(plans.every(p=>p.eligible.length<=18)&&plans.length<=6){
  const options=[];function enumerate(p,at,list,out){if(++work>exactWork){limited=true;return;}if(list.length===p.rules.count){if(valid(list,p.rules,p.seed))out.push([...list]);return;}if(p.eligible.length-at<p.rules.count-list.length)return;for(let i=at;i<p.eligible.length&&!limited;i++){list.push(p.eligible[i]);enumerate(p,i+1,list,out);list.pop();}}
  for(const p of plans){const out=[];enumerate(p,0,[],out);options.push(out);if(limited)break;}
  function search(at,set,chosen){if(++work>exactWork){limited=true;return;}if(set.size>=bestSize)return;if(at===plans.length){bestSize=set.size;best=chosen.map(x=>[...x]);return;}for(const option of options[at]){search(at+1,new Set([...set,...option.map(c=>c.question_id)]),[...chosen,option]);if(limited)return;}}
  if(!limited)search(0,lockedIds,[]);optimal=!limited;
 }
 plans.forEach((p,i)=>p.items=best[i]);
 const updates=plans.map(p=>{let writtenIndex=0;if(!valid(p.items,p.rules,p.seed))throw Error('공동 배분 검증 실패. 기존 결과를 유지합니다.');const summary=clone(p.seed.scopeAllocation);if(summary)for(const g of summary.groups){const rows=p.items.filter(c=>facts(c,p.rules,p.seed).chapter===g.id);g.count=rows.length;g.writtenCount=rows.filter(c=>model.responseType(c.metadata)==='서술형').length;}return {id:p.v.id,paper:{id:p.v.id,version:0,title:paperTitle(doc,p.v),examTitle:doc.title,variantLabel:p.v.label,roundLabel:doc.title.match(/\d+\s*회/)?.[0]||'',answerMode:p.v.paper?.answerMode||'quick',paperForm:doc.paperForm?{...clone(doc.paperForm),scoreNote:countSummary(doc.counts[p.v.kind])+' · 총 '+totalPoints(doc.counts[p.v.kind])+'점'}:null,scoring:clone(doc.counts[p.v.kind]),print:clone(p.v.paper?.print||{paper:'A4',columns:2,marginsMm:{top:20,right:15,bottom:18,left:15}}),rules:p.rules,supplementAdjustment:p.seed.supplementAdjustment||null,generationTarget:insights.target(p.rules),items:questionSets.ordered(p.items).map(c=>({...item(c),points:model.responseType(c.metadata)==='서술형'?writtenCounts.points(doc.counts[p.v.kind],writtenIndex++):(doc.counts[p.v.kind].choicePoints??4)})),snapshotId:snapshot.id,snapshotAt:snapshot.at,exclusions:clone(snapshot.exclusions||[]),scopeAllocation:summary}};});
 return {complete:true,updates,sharing:{distinct:bestSize,total:[...locked.map(v=>v.paper.items.length),...plans.map(p=>p.items.length)].reduce((a,b)=>a+b,0),optimal,method:optimal?'exhaustive':'joint-eligibility-and-constraint-preserving-swaps',work,searchLimitReached:limited}};
}
function apply(doc,result){if(!result.complete)throw Error('미완성 출제 결과는 반영할 수 없습니다.');const next=clone(doc),ids=new Set();for(const u of result.updates){const v=next.variants.find(v=>v.id===u.id);if(!v||ids.has(u.id))throw Error('출제 결과 유형이 다릅니다.');ids.add(u.id);v.paper=clone(u.paper);}next.sharing=clone(result.sharing);return next;}
function baseCandidate(doc,c){return c.metadata?.source?.kind==='학교기출'&&doc.schools.includes(c.metadata?.source?.school)&&!c.metadata?.relations?.originalQuestionId;}
function recommend({document:doc,snapshot,targetIds}){
 return doc.variants.filter(v=>targetIds.includes(v.id)).map(v=>{
  const rules=rulesFor(doc,v,snapshot.excludeIds||[]),allRules={...rules,schools:[],schoolMode:undefined},all=model.inspectCandidates(snapshot.candidates,allRules).eligible;
  const base=all.filter(c=>baseCandidate(doc,c)||v.supplementIds?.includes(c.question_id)),baseIds=new Set(base.map(c=>c.question_id));
  const basePlan=model.selectQuestions(base,rules);if(basePlan.complete)return {id:v.id,label:v.label,complete:true,candidates:[],suggestedIds:[]};
  const full=model.selectQuestions(all,allRules),suggested=new Set((full.items||[]).filter(c=>!baseIds.has(c.question_id)).map(c=>c.question_id));
  for(const id of [...suggested]){const trial=[...suggested].filter(x=>x!==id),plan=model.selectQuestions([...base,...all.filter(c=>trial.includes(c.question_id))],allRules);if(plan.complete)suggested.delete(id);}
  const groups=basePlan.scopeAllocation?.groups||[],deficits=new Set(groups.filter(g=>g.available<g.roundedTarget||g.writtenAvailable<(g.roundedWrittenTarget||0)).map(g=>g.id));
  const formatNeed=new Set(Object.entries(rules.types).filter(([type,n])=>base.filter(c=>model.responseType(c.metadata)===type).length<n).map(([type])=>type));
  const candidates=all.filter(c=>!baseIds.has(c.question_id)).sort((a,b)=>Number(suggested.has(b.question_id))-Number(suggested.has(a.question_id))||Number(formatNeed.has(model.responseType(b.metadata)))-Number(formatNeed.has(model.responseType(a.metadata)))||Number(deficits.has(scope.chapterFor(b,groups)))-Number(deficits.has(scope.chapterFor(a,groups)))||Math.abs(model.numericScore(a)-rules.profile.targetAverage)-Math.abs(model.numericScore(b)-rules.profile.targetAverage)||a.question_id.localeCompare(b.question_id));
  return {id:v.id,label:v.label,complete:full.complete,candidates,suggestedIds:[...suggested],failure:basePlan};
 });
}
module.exports={defaultCounts,formats,countSummary,totalPoints,autoName,baseCandidate,recommend,create,normalize,addKind,addVariant,paperTitle,rename,effectiveProfile,rulesFor,excludedIds,compose,apply,valid};
