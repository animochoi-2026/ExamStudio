'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {reconcile,diagnostic}=require('../app/queue-numbering.cjs');
const manifest={total:22,objectiveCount:18,writtenCount:4,confirmed:true};
const raw={section:'objective',total:null,objectiveCount:null,writtenCount:null,confirmed:false,uncertain:true,evidence:'문항 번호 1과 인쇄된 선택지가 보임. 전체 문항 수를 명시한 표제는 보이지 않음.'};
const recognition=()=>({originalNumber:'1',sourceNumbering:structuredClone(raw),uncertainties:[{text:diagnostic}],body:'preserved',version:1});
test('missing counts never resolve a cropped printed question number',()=>{
 for(const where of ['evidence','warning']){
  const r=recognition();r.status='needs_confirmation';
  if(where==='evidence')r.sourceNumbering.evidence+=' 문항 번호가 잘려 있음.';
  else r.uncertainties.push({kind:'reading',text:'문항 번호가 잘려 있음.'});
  const before=structuredClone(r);assert.equal(reconcile(r,manifest,'objective:1'),null);assert.deepEqual(r,before);assert.equal(r.sourceNumbering.uncertain,true);assert.equal(r.status,'needs_confirmation');assert.ok(r.uncertainties.some(u=>u.text===diagnostic));
 }
});
test('missing counts never resolve ambiguous objective versus written identity',()=>{
 for(const where of ['evidence','warning']){
  const r=recognition();r.status='needs_confirmation';
  if(where==='evidence')r.sourceNumbering.evidence+=' 객관식·서술형 구분이 어려움.';
  else r.uncertainties.push({kind:'reading',text:'객관식·서술형 구분이 어려움.'});
  const before=structuredClone(r);assert.equal(reconcile(r,manifest,'objective:1'),null);assert.deepEqual(r,before);assert.equal(r.sourceNumbering.uncertain,true);assert.equal(r.status,'needs_confirmation');assert.ok(r.uncertainties.some(u=>u.text===diagnostic));
 }
});

test('explicit absent overall and section counts wording reuses preflight totals, retaining real uncertainty',()=>{
 const r=recognition();r.originalNumber='5';r.sourceNumbering.evidence='문항 번호 5와 선택지 ①~⑤가 보입니다. 시험 전체 및 영역별 문항 수는 표시되어 있지 않습니다.';r.uncertainties.push({text:'diagram label unreadable'});
 const next=reconcile(r,manifest,'objective:5');assert.ok(next);assert.deepEqual(next.aiSourceNumbering,r.sourceNumbering);assert.equal(next.sourceNumbering.total,22);assert.equal(next.version,r.version);assert.deepEqual(next.uncertainties,[{text:'diagram label unreadable'}]);assert.equal(reconcile({...r,sourceNumbering:{...r.sourceNumbering,evidence:r.sourceNumbering.evidence+' 문항 번호가 불확실합니다.'}},manifest,'objective:5'),null);
});
test('preflight count confirmation resolves only missing header and preserves raw AI and content',()=>{const r=recognition(),next=reconcile(r,manifest,'objective:1');assert.equal(next.uncertainties.length,0);assert.equal(next.sourceNumbering.total,22);assert.equal(next.queueNumberingConfirmation.method,'preflight_user_confirmed_counts');assert.deepEqual(next.aiSourceNumbering,raw);assert.equal(next.body,r.body);assert.equal(next.version,r.version);assert.equal(r.sourceNumbering.total,null);assert.equal(reconcile(next,manifest,'objective:1'),null);});
test('unconfirmed counts, conflicting counts, section and region mismatch remain unresolved',()=>{for(const [r,m,g]of [[recognition(),{...manifest,confirmed:false},'objective:1'],[{...recognition(),sourceNumbering:{...raw,total:24}},manifest,'objective:1'],[{...recognition(),sourceNumbering:{...raw,section:'unknown'}},manifest,'objective:1'],[recognition(),manifest,'written:1']])assert.equal(reconcile(r,m,g),null);});
test('reading and diagram uncertainty is retained and manual recognition is never overwritten',()=>{const r=recognition();r.uncertainties.push({text:'diagram label unreadable'});assert.deepEqual(reconcile(r,manifest,'objective:1').uncertainties,[{text:'diagram label unreadable'}]);assert.equal(reconcile({...r,correctedByUser:true},manifest,'objective:1'),null);assert.equal(reconcile({...r,sourceNumbering:{...raw,evidence:'문항 번호가 잘려 불확실함'}},manifest,'objective:1'),null);});
test('alternative absent header wording works; a simultaneously uncertain number remains held',()=>{const r=recognition();r.originalNumber='2';r.sourceNumbering.evidence='문항 번호 2와 객관식 선택지가 보이며, 시험 전체 문항 수는 표시되지 않음.';assert.ok(reconcile(r,manifest,'objective:2'));r.sourceNumbering.evidence='전체 문항 수는 표시되지 않음. 문항 번호도 불확실함.';assert.equal(reconcile(r,manifest,'objective:2'),null);});
