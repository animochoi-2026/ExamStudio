'use strict';
const legacy=require('./difficulty-policy-legacy.cjs');
const version='fixed-learner-no-proof-bonus-v2',boundaries=Object.freeze({lowMax:3,highMin:8,killerMin:9});
function adjustment(c,raw){const n=legacy.score(raw);return {version,rawScore:n,score:n,delta:0,evidence:null};}
function applied(c,raw,criteriaVersion){const v=criteriaVersion||c.metadata?.difficulty?.criteriaVersion;return v==='expected-10-v5-insight-references-scope-low1'?legacy.applied(c,raw):adjustment(c,raw);}
module.exports={version,boundaries,score:legacy.score,composition:legacy.composition,proofEvidence:legacy.proofEvidence,adjustment,rebase:adjustment,applied,instructions:'증명은 잔여 추론 R에 포함하며 별도 가산은 없습니다.'};
