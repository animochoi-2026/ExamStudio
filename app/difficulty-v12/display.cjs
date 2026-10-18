'use strict';
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const equal=(a,b)=>JSON.stringify(canonical(a??null))===JSON.stringify(canonical(b??null));
function active(c){const d=c.metadata?.difficulty||{},a=d.v12Active,r=a?.result?.computed;if(!a||r?.status!=='complete'||!Number.isFinite(r.score)||r.score<1||r.score>10||!a.inputBasis||a.inputBasis!==c.metadata?.analysis?.basis||c.metadata?.analysis?.status==='stale'||d.reassessmentRequired||c.revision_id&&a.revisionId!==c.revision_id)return null;
 // A later manual change takes precedence. Historical manual values remain in place.
 if(!equal(a.confirmedBefore,c.confirmed||{})||!equal(a.userScoreBefore,d.userScore))return null;
 return {...r,criteriaVersion:'insight-bottleneck-v1.2',inputVersion:a.inputVersion,record:a};}
function latest(c){const a=c.metadata?.difficulty?.v12Latest,r=a?.result?.computed;if(!a||r?.status!=='complete'||!Number.isFinite(r.score)||r.score<1||r.score>10||!a.inputBasis||a.inputBasis!==c.metadata?.analysis?.basis||c.metadata?.analysis?.status==='stale'||c.metadata?.difficulty?.reassessmentRequired)return null;return {...r,raw:a.result.raw};}
module.exports={active,latest};
