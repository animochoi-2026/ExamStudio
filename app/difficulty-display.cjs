'use strict';
// Display classification only. Scorer constants and stored evaluations are untouched.
const policy=require('./difficulty-display-map.json'),V123=require('./difficulty-v123/display.cjs');
const recognized=v=>[policy.version,V123.mappingVersion].includes(v);
const keys=Object.freeze(['low','middle','high','killer']);
const fromTier=t=>policy.tiers[t]||'unknown';
function legacyScore(n){return n==null||!Number.isFinite(Number(n))?'unknown':Number(n)<=policy.legacyScore.lowMax?'low':Number(n)<policy.legacyScore.highMin?'middle':Number(n)<policy.legacyScore.killerMin?'high':'killer';}
function fromProjection(v){return v.score==null?'unknown':v.source==='교사 조정'?legacyScore(v.score):(v.record.spec_revision==='1.2.3'?V123.tiers[v.record.final_tier]||'unknown':fromTier(v.record.final_tier));}
function fromSummary(s){return recognized(s.displayMappingVersion)?s.compositionBand:legacyScore(s.score);}
// Saved numeric-only papers keep the historical fallback. Reuse a stored tier
// only when it belongs to the same score snapshot (never relabel an old score
// with a newer evaluation).
function snapshotTier(c){const s=c?.summaryDifficulty;if(recognized(s?.displayMappingVersion)&&s.score!=null&&s.numberSource!=='교사 조정')return s.finalTier||null;const v=require('./difficulty-v121/display.cjs').active(c);return v&&v.score!==null&&v.source!=='교사 조정'?v.record.final_tier:null;}
function paperRow(item,c){
 if(!Object.hasOwn(item,'scoreSnapshot'))return c;
 if(item.tierSnapshot)return {summaryDifficulty:{score:item.scoreSnapshot,finalTier:item.tierSnapshot,compositionBand:fromTier(item.tierSnapshot),displayMappingVersion:policy.version}};
 if(recognized(c?.summaryDifficulty?.displayMappingVersion)&&c.summaryDifficulty.score===item.scoreSnapshot)return c;
 const r=c?.metadata?.difficulty?.v123Active||c?.metadata?.difficulty?.v121Active||c?.metadata?.difficulty?.v121Latest?.record;
 if(r?.final_status==='complete'&&r.final_score===item.scoreSnapshot)return c;
 return {metadata:{},confirmed:{difficulty:item.scoreSnapshot}};
}
module.exports={...policy,keys,fromTier,legacyScore,fromProjection,fromSummary,paperRow,snapshotTier};
