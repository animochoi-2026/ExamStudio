'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const D=require('../app/difficulty-assessment.cjs'),P=require('../app/difficulty-policy.cjs'),Desktop=require('../app/desktop-difficulty.cjs'),R=require('../app/difficulty-reassessment.cjs'),C=require('../app/curriculum.js');
const webRoot=path.resolve(__dirname,'../../tmp/web-scope-allocation-20261005'),Web=require(path.join(webRoot,'app/difficulty-assessment.cjs'));
const row=score=>({question_id:require('crypto').randomUUID(),revision_id:'22222222-2222-4222-8222-222222222222',content:{body:'길이를 구하시오.'},confirmed:{},metadata:{analysis:{status:'complete',basis:'basis'},difficulty:{aiScore:String(score),criteriaVersion:D.version}}});
test('all agreed boundaries, filters, statistics and killer subset agree with current web source without mutation',()=>{
 const values=[2.9,3,3.1,7.9,8,8.9,9,10],expected=['low','low','middle','middle','high','high','high','high'],rows=values.map(row),before=JSON.stringify(rows);
 const filters=require('../app/bank-search-filters.cjs'),model=require('../app/bank-exam-model.cjs');
 assert.deepEqual(rows.map(D.compositionBand),expected);assert.deepEqual(rows.map(Web.compositionBand),expected);assert.deepEqual(values.map(Desktop.band),expected.map(b=>D.compositionLabels[b]));
 for(let i=0;i<rows.length;i++)for(const b of ['low','middle','high'])assert.equal(filters.matches(rows[i],{compositionBand:b}),b===expected[i]);
 assert.deepEqual(model.difficultySummary(rows).counts,{low:2,middle:2,high:4,deferred:0,unknown:0});assert.equal(D.statistics(rows)[0].all.highShare,.5);
 assert.equal(rows.filter(c=>D.effective(c).number>=P.boundaries.killerMin).length,2);assert.ok(rows.filter(c=>D.effective(c).number>=9).every(c=>D.compositionBand(c)==='high'));assert.equal(JSON.stringify(rows),before);
});
test('source scores reject extra decimals instead of silently rounding across a boundary',()=>{
 for(const n of ['3.01','7.99','8.99',3.01,7.99,8.99,' ',false,[],{},11,-1,NaN]){assert.throws(()=>D.score(n));assert.equal(Desktop.score(n),null);assert.throws(()=>P.score(n));}
 assert.equal(D.score('8.0'),'8.0');assert.equal(D.score(3),'3.0');
});
test('separate analysis rejects contradictory top-level and structured raw scores without inventing a correction',()=>{
 const value={originalNumber:null,primaryUnitId:null,relatedUnitIds:[],conditionUnitIds:[],solutions:[],types:[],typeReason:'유형 없음',score:'6.8',reason:'근거',assessment:{score:'3.0',band:null,status:'estimated',reason:'근거',features:Object.fromEntries(D.features.map(k=>[k,'근거']))}},B=require('../app/bank-analysis.cjs');
 assert.throws(()=>B.checked(value,true),/일치하지/);value.assessment.score='6.8';assert.equal(B.checked(value,true).score,'6.8');
});
test('reassessment rebases proof exactly once, keeps manual printed-layout evidence and preserves original result/history',()=>{
 for(const manual of [false,true]){
  const source={catalog:row(3.3),question:{body:manual?'빈칸을 완성하시오.':'합동임을 증명하시오.',answer:'답',solution:'저장된 풀이'},scope:C.build(['m2-6.1'])};source.catalog.content.body=source.question.body;source.catalog.metadata.difficulty.criteriaVersion='old';source.catalog.metadata.difficulty.proofAdjustment={version:P.version,rawScore:3.3,score:5.3,delta:2,evidence:{kind:manual?'complete':'construct',evidence:'확인한 인쇄 증명 요구',source:manual?'user_chat_and_printed_proof_steps':'printed_body'}};
  const original=JSON.stringify(source),plan=R.plan([source],{model:'gpt-6.1-sol',effort:'high'}).rows[0],a={status:'estimated',score:'6.8',band:null,reason:'새 평가',features:Object.fromEntries(D.features.map(k=>[k,'근거']))};
  const saved=R.recordResult(source,plan,a,{provider:'codex',model:'gpt-6.1-sol',effort:'high',at:'2026-10-06T00:00:00Z',activate:true});assert.equal(saved.activation,'active');assert.equal(D.effective(saved.catalog).number,8.8);assert.equal(saved.catalog.metadata.difficulty.aiScore,'3.3');assert.deepEqual(saved.catalog.metadata.difficulty.proofAdjustment.evidence,source.catalog.metadata.difficulty.proofAdjustment.evidence);
  const current=D.currentOnly(saved.catalog);for(let i=0;i<4;i++){assert.equal(D.effective(current).number,8.8);assert.equal(Web.effective(current).number,8.8);assert.equal(current.metadata.difficulty.aiScore,'6.8');}
  const reopened=JSON.parse(JSON.stringify(current));assert.equal(D.effective(reopened).number,8.8);assert.equal(JSON.stringify(source),original);assert.equal(saved.catalog.metadata.difficulty.rubricAssessments[plan.idempotencyKey].score,'6.8');
  reopened.confirmed.difficulty='3.0';assert.equal(D.effective(reopened).number,3);assert.equal(Web.effective(reopened).number,3);
 }
});
test('stored production catalog numbers and bands remain identical in desktop and current web code',()=>{
 const snapshot=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../docs/solution-guide/remaining-confirmation-20261006/shared-inventory.json'),'utf8'));assert.equal(snapshot.catalog.length,109);
 for(const c of snapshot.catalog){const before=JSON.stringify(c);assert.equal(D.effective(c).number,Web.effective(c).number,c.revision_id);assert.equal(D.compositionBand(c),Web.compositionBand(c));assert.equal(JSON.stringify(c),before);}
});
test('unchanged-input embedded assessment preserves verified manual proof evidence, changed input does not inherit it',()=>{
 const Cache=require('../app/assessment-cache.cjs'),q={body:'빈칸을 완성하시오.',solution:'확인한 인쇄 증명'},problem={},scope={};q.assessment=Cache.record({score:'6.8',band:null,status:'estimated',reason:'근거',features:Object.fromEntries(D.features.map(k=>[k,'근거']))},q,problem,scope);
 const m={analysis:{status:'failed',basis:q.assessment.inputHash},difficulty:{aiScore:'3.3',proofAdjustment:{version:P.version,rawScore:3.3,evidence:{kind:'complete',source:'user_verified_printed_layout'}}}};
 assert.equal(Cache.importEmbedded(m,q,problem,scope),true);assert.equal(D.effective({metadata:m}).number,8.8);assert.equal(m.difficulty.proofAdjustment.evidence.source,'user_verified_printed_layout');
 const changed={analysis:{status:'failed',basis:'different'},difficulty:{aiScore:'3.3',proofAdjustment:{version:P.version,rawScore:3.3,evidence:{kind:'complete'}}}};assert.equal(Cache.importEmbedded(changed,q,problem,scope),true);assert.equal(D.effective({metadata:changed}).number,6.8);
});
test('actual stored-summary SQL function matches JS at boundaries, teacher overrides, proof and invalid values',async()=>{
 const {PGlite}=require('@electric-sql/pglite'),db=new PGlite();try{
  const sql=fs.readFileSync(path.join(webRoot,'supabase/migrations/202610040029_stored_web_summaries.sql'),'utf8');await db.exec('create schema bank_summary;');
  for(const name of ['score','row_difficulty']){const start=sql.indexOf('create function bank_summary.'+name+'('),end=sql.indexOf('end $$;',start);assert.ok(start>=0&&end>start);await db.exec(sql.slice(start,end+7));}
  const rows=[2.9,3,3.1,7.9,8,8.9,9,10].map(row);const proof=row(6.8);proof.metadata.difficulty.proofAdjustment={version:P.version,rawScore:6.8,evidence:{kind:'construct'}};rows.push(proof);const teacher=row(9);teacher.confirmed.difficulty='3.0';rows.push(teacher);const localTeacher=row(9);localTeacher.metadata.difficulty.userScore='7.9';rows.push(localTeacher);rows.push(row('7.99'),row(' '));
  for(const c of rows){const {rows:[{v}]}=await db.query('select bank_summary.row_difficulty($1,$2,$3) v',[c.revision_id,c.metadata,c.confirmed]);assert.equal(v.score,D.effective(c).number);assert.equal(v.band,D.effective(c).band);}
 }finally{await db.close();}
});
