'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const A=require('../app/difficulty-v121/answer.cjs'),V=require('../app/difficulty-v121/schema.cjs'),F=require('./fixtures/difficulty-v12-values.cjs');
test('equivalent notation, single answer labels, exact units and labelled parts',()=>{
 for(const [a,b] of [
  ['4','$\\overline{PD}=4$'],['BF=15','$\\overline{BF}=15$'],['52°','$\\angle ADE=52^\\circ$'],
  ['14 cm²','$14\\,\\mathrm{cm}^2$'],['5 cm³','5\\mathrm{cm}^{3}'],
  ['(1) 20cm², (2) 40cm², (3) 120cm²','(1) $20\\mathrm{cm}^{2}$\n(2) $40\\mathrm{cm}^{2}$\n(3) $120\\mathrm{cm}^{2}$'],
  ['(가) 0, (나) 1, (다) 9, (라) 3, (마) 2/3','(가) $0$, (나) $1$, (다) $9$, (라) $3$, (마) $\\frac{2}{3}$'],
  ['BD=10 cm, AE=4.8 cm','$\\overline{BD}=10\\text{ cm}$, $\\overline{AE}=\\frac{24}{5}\\text{ cm}$'],
  ['x² = 112 또는 400','$x^2=112$ 또는 $x^2=400$'],['8π−384/25','$8\\pi-\\frac{384}{25}$'],
  ['(1) 4/9 (2) 0, 5/9, B','(1) $\\frac49$ (2) 순서대로 $0$, $\\frac59$, B'],
  ['네 변의 길이가 모두 같은지 여부.','네 변의 길이가 모두 같은 성질이 항상 성립하는가.']
 ])assert.equal(A.equivalent(a,b),true,JSON.stringify([a,b]));
});
test('wrong values, names, units, missing/extra cases, negation and order still reject',()=>{
 for(const [a,b] of [['PD=5','PD=4'],['AB=4','PD=4'],['14 cm³','14 cm²'],['14','14 cm²'],['52','52°'],['x²=112','x²=112 또는 400'],['x²=112 또는 401','x²=112 또는 400'],['x=2','x²=2'],['(1) 20 (2) 40','(1) 40 (2) 20'],['(가) 0 (나) 1','(가) 1 (나) 0'],['(1) 20 (3) 40','(1) 20 (2) 40'],['a<1 또는 a>14','a<0 또는 0<a<1 또는 a>14'],['네 변의 길이가 모두 같지 않은지 여부','네 변의 길이가 모두 같은 성질이 항상 성립하는가']])assert.equal(A.equivalent(a,b),false,JSON.stringify([a,b]));
});
test('option sets with descriptions compare every option, never only first',()=>{
 const opts={answerType:'multiple_choice',choices:['① 마름모','② 정사각형','③ 직사각형','④ 사다리꼴','⑤ 평행사변형']};
 assert.equal(A.verify('①, ②','① 마름모, ② 정사각형',opts).valid,true);
 for(const answer of ['①','①, ③','①, ②, ③','①, ①','① 직사각형, ② 정사각형'])assert.equal(A.verify(answer,'① 마름모, ② 정사각형',opts).valid,false,answer);
 assert.equal(A.verify('④ 9','$x=9$ (④)',{answerType:'multiple_choice',choices:['① 6','② 7','③ 8','④ 9','⑤ 10']}).valid,true);
 assert.equal(A.verify('④ 9','$x=8$ (④)',{answerType:'multiple_choice',choices:['① 6','② 7','③ 8','④ 9','⑤ 10']}).valid,false);
});
test('unparsed prose is unverified rather than falsely labelled a different numeric answer',()=>{
 assert.equal(A.verify('정답 설명','저장 설명',{answerType:'numeric'}).reason,'answer_equivalence_unverified');
 assert.equal(A.verify('25','24',{answerType:'numeric'}).reason,'answer_mismatch');
});
test('text-solvable with attached image passes, actual absent/unclear image and ambiguity fail',()=>{
 const raw={...F.raw(F.route([F.d('a')])),spec_revision:'1.2.1',derived_answer:'54',answer_type:'numeric',solution_summary:'높이 6, 밑변 18, 넓이 54',solution_validated:false,answer_confidence:.9,literacy_evidence_type:'',image_evidence_status:'not_required',assessment_uncertainty:[]};
 const ctx={scope:'중2',storedAnswer:'54',choices:[],requiresImage:true,imageCount:1};
 assert.equal(V.evaluate(raw,ctx).validation.valid,true);
 assert.equal(V.evaluate(raw,{...ctx,imageCount:0}).validation.reason,'image_evidence_missing');
 assert.equal(V.evaluate({...raw,image_evidence_status:'unclear'},ctx).validation.reason,'image_evidence_missing');
 assert.equal(V.evaluate({...raw,assessment_uncertainty:['source_ambiguity']},ctx).validation.reason,'assessment_uncertain');
 assert.equal(V.evaluate({...raw,derived_answer:'55'},ctx).validation.reason,'answer_mismatch');
});
const I=require('../app/difficulty-v12/input.cjs'),Saved=require('../app/difficulty-v121/saved-revalidation.cjs');
const rawValue=(answer='54',ds=[F.d('a')])=>({...F.raw(F.route(ds)),spec_revision:'1.2.1',derived_answer:answer,answer_type:'proof',solution_summary:'독립 풀이의 근거',solution_validated:false,answer_confidence:.9,literacy_evidence_type:'',image_evidence_status:'not_required',assessment_uncertainty:[]});
const reviewFor=(raw,ctx)=>({method:'local_mathematical_equivalence_review',decision:'equivalent',rawHash:I.hash(raw),contextHash:I.hash(ctx),rationale:'같은 결론과 합동 조건을 별도 대조함'});
test('review binds exact raw and context; cannot override numeric mismatch or other validation gates',()=>{
 const raw=rawValue('PC=PD임을 RHA로 증명'),ctx={scope:'중2',storedAnswer:'PC=PD',choices:[]},review=reviewFor(raw,ctx);
 assert.equal(V.evaluate(raw,ctx).validation.valid,false);
 assert.equal(V.evaluate(raw,ctx,{answerReview:review}).validation.reason,'reviewed_answer_equivalence');
 assert.equal(V.evaluate({...raw,answerReview:review},ctx).validation.valid,false);
 assert.equal(V.evaluate({...raw,solution_summary:'changed'},ctx,{answerReview:review}).validation.valid,false);
 assert.equal(V.evaluate(raw,{...ctx,storedAnswer:'PC=2PD'},{answerReview:review}).validation.valid,false);
 for(const change of [{assessment_uncertainty:['source_ambiguity']},{answer_confidence:.5},{image_evidence_status:'unclear'},{reference_student_match:false},{viable_routes:[F.route([F.d('dup'),F.d('dup')])]}]){
  const bad={...raw,...change};assert.equal(V.evaluate(bad,ctx,{answerReview:reviewFor(bad,ctx)}).validation.valid,false);
 }
 const wrong=rawValue('55'),numeric={...ctx,storedAnswer:'54'};
 assert.equal(V.evaluate(wrong,numeric,{answerReview:reviewFor(wrong,numeric)}).validation.reason,'answer_mismatch');
});
const savedEntry=()=>({questionId:'q',revisionId:'r',input:I.input({question:{body:'문제'},scope:'중2'}),validationContext:{scope:'중2',storedAnswer:'54',choices:[]}});
const candidate=(raw,file='original')=>({file,hash:'filehash',result:{raw,evidence:{completed:true,failed:false,exitCode:0}}});
test('saved replay reuses earliest valid response and keeps escalation and missing-response guards',()=>{
 const e=savedEntry(),first=candidate(rawValue('54')),later=candidate(rawValue('55'),'retry');
 const low=Saved.review(e,[[first,later],[],[]]);assert.equal(low.status,'complete');assert.equal(low.provenance[0].file,'original');
 const high=candidate(rawValue('54',[F.d('hard',3,3,3,3)]));
 const missing=Saved.review(e,[[high],[],[]]);assert.equal(missing.status,'unresolved');assert.equal(missing.missingStage,2);
 assert.equal(Saved.review(e,[[high],[first],[]]).record.final_stage,2);
 const unknown={...first,result:{...first.result,evidence:{completed:false}}};assert.equal(Saved.review(e,[[unknown],[],[]]).missingStage,1);
});
test('saved review cannot transfer approvals across item, revision, input or response file',()=>{
 const e=savedEntry();e.validationContext.storedAnswer='PC=PD';const raw=rawValue('PC=PD임을 RHA로 증명'),c=candidate(raw);
 const review={...reviewFor(raw,e.validationContext),questionId:e.questionId,revisionId:e.revisionId,inputVersion:e.input.inputVersion,file:c.file};
 const out=Saved.review(e,[[c],[],[]],[review]);assert.equal(out.status,'complete');assert.deepEqual(out.provenance[0].answerReview,review);
 for(const field of ['questionId','revisionId','inputVersion','file'])assert.notEqual(Saved.review(e,[[c],[],[]],[{...review,[field]:'other'}]).status,'complete');
});
test('fraction cleanup never removes function-call or multiplicative parentheses',()=>{
 assert.equal(A.equivalent('f(x)','fx'),false);assert.equal(A.equivalent('2(3)','23'),false);
 assert.equal(A.equivalent('a/b','\\frac{a}{b}'),true);
});
