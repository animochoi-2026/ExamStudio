const test=require('node:test'),assert=require('node:assert/strict');
const F=require('../app/response-format.cjs'),B=require('../app/bank-exam-model.cjs'),M=require('../web-bank/mock-exam-model.cjs'),W=require('../web-bank/written-counts.cjs'),E=require('../web-bank/mock-round-edit.cjs');
const aliases=['단답형','서답형','주관식','주관식(단답형)','서술형','서논술형','논술형','single_value','all_solutions','proof','written_response','other','새 비객관식 유형'];
const row=(id,type)=>({question_id:id,revision_id:'r-'+id,metadata:{source:{school:'검증중',kind:'학교기출',grade:'중2'},content:{responseType:type},classification:{primaryUnit:{id:'m2-6.1'}}},confirmed:{difficulty:5}});
test('every named non-choice format is written, missing stays unknown, choice stays choice',()=>{
 for(const type of aliases)assert.equal(F.normalize(type),'서술형',type);
 for(const type of ['객관식','객관형','선택형','선택식','single_choice','multiple_choice'])assert.equal(F.normalize(type),'선택형',type);
 for(const type of [undefined,null,''])assert.equal(F.normalize(type),type);
 assert.equal(F.label('single_choice'),'객관식');
});
test('legacy format counts add once and ordinary composition uses the combined pool without mutation',()=>{
 const types={선택형:2,단답형:2,서술형:1,논술형:2},rules={count:7,types,schools:['검증중'],units:['m2-6.1']};
 const rows=[row('a','single_choice'),row('b','multiple_choice'),...aliases.slice(0,5).map((t,i)=>row('w'+i,t))],before=JSON.stringify({rules,rows});
 assert.deepEqual(F.counts(types),{선택형:2,서술형:5});assert.deepEqual(F.counts(F.counts(types)),F.counts(types));
 const result=B.selectQuestions(rows,rules);assert(result.complete);assert.equal(result.items.filter(c=>B.responseType(c.metadata)==='서술형').length,5);assert.equal(JSON.stringify({rules,rows}),before);
 assert.throws(()=>F.counts({단답형:-1,서술형:3}),/정수/);
 assert.equal(B.selectQuestions(rows,{...rules,count:2,types:{선택형:2,서술형:0}}).items.length,2);
});
test('mock legacy counts and unequal point allocations survive; existing papers are untouched',()=>{
 const d=M.create('round');d.autoTitle=false;d.schools=['검증중'];d.profile={low:0,middle:100,high:0,targetAverage:5};
 d.counts={A:{choice:1,short:2,written:1,choicePoints:4,shortPoints:3,writtenPoints:7}};M.addVariant(d,'A','a');d.variants[0].units=['m2-6.1'];
 const old={items:[{questionId:'old',responseType:'단답형',points:9,workspaceMm:13}],title:M.paperTitle(d,d.variants[0])};d.variants[0].paper=old;
 const before=JSON.stringify(d),n=M.normalize(d);assert.equal(n.counts.A.written,3);assert.equal(M.totalPoints(n.counts.A),17);assert.deepEqual(n.variants[0].paper,old);assert.equal(JSON.stringify(d),before);assert.deepEqual(M.normalize(n).counts,n.counts);
 const result=M.compose({document:n,snapshot:{candidates:[row('c','single_choice'),row('s1','단답형'),row('s2','논술형'),row('w','서술형')]},targetIds:['a']});assert(result.complete);
 const p=result.updates[0].paper;assert.equal(p.items.reduce((a,x)=>a+x.points,0),17);assert.equal(p.items.filter(x=>x.responseType==='서술형').length,3);assert(!M.countSummary(n.counts.A).includes('단답형'));
 const changed=W.normalize(n.counts.A);changed.written=4;delete changed.writtenPointGroups;assert.deepEqual(W.groups(changed),[{count:4,points:7}]);
});
test('legacy written aliases can replace each other while choice and layout remain protected',()=>{
 const d={variants:[{id:'a',label:'A1',paper:{rules:{units:['m2-6.1']},items:[{questionId:'s',revisionId:'r-s',responseType:'단답형',points:8,workspaceMm:19}]}}]};
 const r=E.replace(d,'s',row('new','논술형'));assert.equal(r.document.variants[0].paper.items[0].points,8);assert.equal(r.document.variants[0].paper.items[0].workspaceMm,19);assert.equal(d.variants[0].paper.items[0].questionId,'s');assert.throws(()=>E.replace(d,'s',row('choice','선택형')),/형식/);
});
test('server helper agrees with client, preserves permission boundary and stored metadata',async()=>{
 const x=await require('./replacement-stages-fixture.cjs').replacementFixture();
 try{await x.db.exec('reset role');for(const value of [...aliases,'single_choice','multiple_choice',null,'']){const r=await x.db.query('select bank_query.response_format($1) f',[{content:{responseType:value}}]);assert.equal(r.rows[0].f,F.normalize(value));}
 const r=await x.db.query("select has_function_privilege('anon','bank_query.response_format(jsonb)','execute') a,has_function_privilege('authenticated','bank_query.response_format(jsonb)','execute') b");assert.deepEqual(r.rows[0],{a:false,b:false});
 const before=await x.db.query('select metadata from bank_catalog where revision_id=$1',[x.questions[0].r]);await x.get();const after=await x.db.query('select metadata from bank_catalog where revision_id=$1',[x.questions[0].r]);assert.deepEqual(after.rows,before.rows);
 const rules={...x.rules,grade:'중2',purpose:'supplement'},base=await x.get({current_revision:null,rules});assert.equal(base.items.length,47);
 await assert.rejects(()=>x.get({current_revision:null,rules,stage:'other_schools'}),/세부 단원/);
 const ids=[];for(let page=0;page<3;page++){const r=await x.get({current_revision:null,rules:{...rules,unitId:'m2-8.7'},stage:'other_schools',page});assert.equal(r.items.length,page===2?5:20);ids.push(...r.items.map(c=>c.question_id));}assert.equal(new Set(ids).size,45);
 const existing=x.makeDoc([3,50]);await x.rpc(x.B,'bank_mock_save',{s:x.S,e:existing.id,expected:0,doc:existing});
 const mockRules={...rules,mockExamId:require('crypto').randomUUID()};
 assert(!(await x.get({current_revision:null,rules:mockRules})).items.some(c=>c.question_id===x.questions[2].q));
 await assert.rejects(()=>x.get({current_revision:null,rules:mockRules,candidate:x.questions[2].q}),/이미 사용/);
 assert.equal((await x.get({current_revision:null,rules},x.C)).total,47);
 }finally{await x.close();}
});
