'use strict';
const stages=Object.freeze(['luna-medium','sol-medium','sol-high']);
const policy=Object.freeze({version:'three-stage-1',lowConfidence:0.7,automaticRetries:0});
function valid(r){return r?.status==='complete'&&r.computed?.status==='complete'&&Number.isFinite(r.computed.score)&&/^T[0-5]$/.test(r.computed.problem_tier||'');}
function uncertainties(r){return [...(r?.raw?.assessment_uncertainty||[]),...(typeof r?.raw?.confidence==='number'&&r.raw.confidence<policy.lowConfidence?['confidence_below_0.7']:[])];}
function decision(stage,r){
 if(!Number.isInteger(stage)||stage<1||stage>3)throw Error('Invalid stage');
 if(!valid(r))return {next:stage<3?stage+1:null,finalStatus:stage<3?null:'failed',reasons:[r?.computed?.reason||'assessment_failed']};
 if(stage===1)return Number(r.computed.problem_tier.slice(1))>=3?{next:2,finalStatus:null,reasons:['luna_tier_at_least_T3']}:{next:null,finalStatus:'complete',reasons:[]};
 const reasons=uncertainties(r);return reasons.length?{next:stage<3?3:null,finalStatus:stage<3?null:'failed',reasons}:{next:null,finalStatus:'complete',reasons:[]};
}
function aggregate(records,baseline=[]){
 const final=records.filter(x=>x.finalStatus),good=final.filter(x=>x.finalStatus==='complete'),before=new Map(baseline.map(x=>[x.id,x]));
 const compare=pairs=>{const xs=pairs.filter(([a,b])=>Number.isFinite(a?.score)&&Number.isFinite(b?.score));return {paired:xs.length,tierMatches:xs.filter(([a,b])=>a.problem_tier===b.problem_tier).length,scoreMatches:xs.filter(([a,b])=>a.score===b.score).length,meanAbsoluteScoreDifference:xs.length?xs.reduce((s,[a,b])=>s+Math.abs(a.score-b.score),0)/xs.length:null};};
 const byStage=stages.map((model,i)=>{const results=records.map(x=>({x,r:x.runs[i]})).filter(v=>v.r);return {stage:i+1,model,count:results.length,seconds:results.reduce((s,{r})=>s+(Date.parse(r.finishedAt)-Date.parse(r.startedAt))/1000,0),...compare(results.map(({x,r})=>[r.computed,before.get(x.id)?.computed]))};});
 const lunaHigh=records.filter(x=>valid(x.runs[0])&&Number(x.runs[0].computed.problem_tier.slice(1))>=3).map(x=>x.id),oldHigh=baseline.filter(x=>/^T[3-5]$/.test(x.computed?.problem_tier||'')).map(x=>x.id);
 const intersection=lunaHigh.filter(id=>oldHigh.includes(id)),union=new Set([...lunaHigh,...oldHigh]);
 const seconds=byStage.reduce((s,x)=>s+x.seconds,0);
 return {completed:good.length,failed:final.length-good.length,pending:records.length-final.length,stages:byStage,seconds,estimated1300Hours:records.length?seconds/records.length*1300/3600:null,mean:good.length?good.reduce((s,x)=>s+x.final.score,0)/good.length:null,tiers:Object.fromEntries(Array.from({length:6},(_,i)=>['T'+i,good.filter(x=>x.final.problem_tier==='T'+i).length])),finalAgreement:compare(final.map(x=>[x.final,before.get(x.id)?.computed])),highTierOverlap:{luna:lunaHigh,baseline:oldHigh,intersection,jaccard:union.size?intersection.length/union.size:1},escalations:records.flatMap(x=>x.decisions.map((d,i)=>d.next?{id:x.id,number:x.number,from:i+1,to:d.next,reasons:d.reasons}:null).filter(Boolean))};
}
module.exports={stages,policy,valid,uncertainties,decision,aggregate};
