'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const D=require('../app/difficulty-assessment.cjs');
function row(status='complete') {return {revision_id:'r',metadata:{analysis:{basis:'b',status:'complete'},difficulty:{aiScore:9,criteriaVersion:D.version,v121Active:{question_revision_id:'r',final_status:status,final_score:status==='complete'?8.6:null,final_tier:status==='complete'?'T4':null,final_stage:2,computed:{base_tier:'T3',promotions:['literacy']},stage2_raw_json:{short_reason:'proof format'}}}},confirmed:{}};}
test('v121 final score is shared across web/desktop without old proof adjustment',()=>{
 const c=row();assert.equal(D.effective(c).number,8.6);assert.equal(D.currentAI(c).score,'8.6');assert.match(D.effective(c).evaluationSummary,/문해력 \+1/);assert.equal(D.effective(c).adjustment,null);
});
test('v121 failed or stale records block all old automatic score fallbacks',()=>{
 for(const c of [row('failed'),{...row(),revision_id:'changed'}]){assert.equal(D.effective(c).number,null);assert.equal(D.currentAI(c),null);}
 const c=row();c.metadata.difficulty.reassessmentRequired=true;assert.equal(D.effective(c).number,null);
});
test('future teacher adjustments remain available without changing AI evidence',()=>{
 const c=row();c.confirmed.difficulty='7.2';assert.equal(D.effective(c).number,7.2);assert.equal(D.currentAI(c).score,'8.6');
 delete c.confirmed.difficulty;c.metadata.difficulty.userScore='6.3';assert.equal(D.effective(c).number,6.3);
});
