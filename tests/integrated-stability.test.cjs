'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),vm=require('node:vm');
const M=require('../app/bank-exam-model.cjs'),C=require('../app/curriculum.js'),D=require('../app/difficulty-assessment.cjs'),L=require('../app/exam-layout.js'),F=require('../app/paper-form-model.cjs');
// This worker/score contract fixture supplies only m2-6.3 candidates. Selecting
// all of middle grade 2 would now correctly fail the preserved scope quotas.
const rules={count:10,units:['m2-6.3'],profile:{low:10,middle:60,high:30,targetAverage:5.7},scopeDistribution:true};
const candidates=Array.from({length:120},(_,i)=>({question_id:'synthetic-'+i,revision_id:'revision-'+i,metadata:{source:{grade:'중2'},content:{responseType:'single_choice'},classification:{primaryUnit:{id:'m2-6.3'},types:[{id:'type-'+i}]},difficulty:{criteriaVersion:i<108?D.version:'expected-10-v5-insight-references-scope-low1',aiScore:i<14?2:i<72?5.5:8.3}}}));
test('built generation worker and preview accept all supported scores, preserve exact quotas and report real shortage',async()=>{
 const build=await require('esbuild').build({entryPoints:[path.join(__dirname,'../web-bank/exam-composition-worker.js')],bundle:true,write:false,format:'iife',platform:'browser',define:{__COMPOSITION_VERSION__:'"regression"'}});
 let message;const sandbox={structuredClone,performance,self:{postMessage:data=>{message=data;}}};vm.createContext(sandbox);vm.runInContext(build.outputFiles[0].text,sandbox);
 const run=(rows,input,version='regression')=>{sandbox.self.onmessage({data:{candidates:rows,rules:input,version}});return JSON.parse(JSON.stringify(message));};
 const before=JSON.stringify(candidates),preview=M.selectQuestions(candidates,rules),worker=run(candidates,rules).result;
 assert.equal(preview.eligible,120);assert.equal(worker.eligible,preview.eligible);assert.equal(worker.complete,true);assert.equal(worker.items.length,10);
 assert.deepEqual(worker.items.reduce((a,i)=>(a[worker.profileSummary.assignment[i.question_id]]++,a),{low:0,middle:0,high:0}),{low:1,middle:6,high:3});assert.equal(JSON.stringify(candidates),before);
 const shortage=run(candidates.slice(14),rules).result;assert.equal(shortage.complete,false);assert.deepEqual(shortage.shortages.find(s=>s.label==='하'),{label:'하',requested:1,available:0,missing:1});
 assert.match(run(candidates,rules,'stale').error.message,/버전/);assert.ok(!run(candidates,{...rules,count:-1}).result,'internal validation errors never masquerade as stock shortages');
 assert.deepEqual(require('../phase2-desktop/app/difficulty-assessment.cjs').statistics(candidates),D.statistics(candidates));
});
test('every form shares midpoint slots; a tall question affects only its own column',()=>{
 const items=Array.from({length:8},(_,i)=>({questionId:String(i),height:50}));
 const geometry={firstHeight:800,height:900,introHeight:100},r=L.paginateQuestionAreas(items,geometry);
 assert.deepEqual(r.pages.map(p=>p.columns.map(c=>c.map(q=>q.top))),[[[100,450],[0,400]],[[0,450],[0,450]]]);
 assert.deepEqual(require('../web-bank/exam-form-model.cjs').paginateForm(items,geometry),r);
 const tall=L.paginateQuestionAreas([{questionId:'big',height:500},...items.slice(0,2)],800);assert.deepEqual(tall.pages[0].columns.map(c=>c.map(q=>q.questionId)),[['big'],['0','1']]);assert.deepEqual(tall.overflows,[]);
 assert.deepEqual(L.paginateQuestionAreas([{questionId:'too-big',height:1000}],800).overflows,['too-big']);
});
test('legacy and added forms stay selectable without overwriting a form embedded in a paper',()=>{
 const legacy={template:'mock',logo:'data:legacy',minutes:50};let forms=F.catalog([],legacy);assert.equal(forms.length,3);assert.equal(forms[2].logo,legacy.logo);
 const {saved,forms:next}=F.saveForm(forms,{...forms[2],minutes:40},'unused');assert.equal(saved.id,'saved:legacy');assert.equal(F.catalog(next,saved).length,3);
 const custom=F.saveForm(F.catalog(next,saved),{...F.builtin('mock'),minutes:20},'saved:new');assert.equal(F.catalog(custom.forms,custom.saved).length,4);assert.equal(F.selectedId({id:'server-only',template:'mock'},forms),null);
 assert.deepEqual(legacy,{template:'mock',logo:'data:legacy',minutes:50});
});
test('shared contracts are staged verbatim into release apps and no backup folder is packaged',()=>{
 const contracts=require('../scripts/shared-contracts.cjs'),temp=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'exam-contracts-'));
 contracts.stage(temp);fs.appendFileSync(path.join(temp,'difficulty-assessment.cjs'),'\n// stale');assert.throws(()=>contracts.verify(temp),/서로 다릅니다/);
 for(const packager of ['../scripts/package.cjs','../phase2-desktop/scripts/package.cjs']){const ignores=require(packager).packageOptions().ignore;for(const name of ['/tmp/old/app/main.cjs','/artifacts/baseline.zip','/restore-points/backup/app/main.cjs','/phase2-desktop/builds/old/resources/app/app/main.cjs'])assert.ok(ignores.some(r=>r.test(name)),name);}
});
