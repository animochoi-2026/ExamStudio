const test=require('node:test'),assert=require('node:assert/strict');
const filters=require('../app/bank-search-filters.cjs'),model=require('../app/bank-exam-model.cjs');
const source=(school,id,registered,updated='2099-01-01')=>({source_id:id,source:{school,academicYear:'1999'},last_registered_at:registered,updated_at:updated});
test('all schools sort before 10-school pagination and preserve exams together',async()=>{
 const {groupSchoolSources}=await import('../web-bank/school-sources.js');
 const names=['하','타','카','차','자','아','사','바','마','나','가'];const sources=names.map((n,i)=>source(n+'중','s'+i,'2026-01-01'));
 sources.push(source('가중','second','2026-01-02'));const groups=groupSchoolSources(sources,'name');
 assert.equal(groups.slice(0,10).length,10);assert.equal(groups.slice(10).length,1);assert.deepEqual(groups.map(g=>g.name),[...names].sort((a,b)=>a.localeCompare(b,'ko')).map(n=>n+'중'));
 assert.deepEqual(groups[0].exams.map(e=>e.source_id),['s10','second']);assert.equal(sources.length,12);
});
test('new registration moves existing school first; ties, missing dates and route order are stable',async()=>{
 const {groupSchoolSources}=await import('../web-bank/school-sources.js');
 const rows=[source('나중','b','2026-01-02'),source('가중','a','2026-01-01'),source('다중','d',null),source('라중','e',null)];
 assert.equal(groupSchoolSources(rows,'recent')[0].name,'나중');rows.push(source('가중','a2','2026-01-03','2000-01-01'));
 assert.deepEqual(groupSchoolSources(rows,'recent').map(g=>g.name),['가중','나중','다중','라중']);assert.deepEqual(groupSchoolSources(rows,'recent')[0].exams.map(e=>e.source_id),['a2','a']);
 assert.deepEqual(groupSchoolSources(rows,'name')[0].exams.map(e=>e.source_id),['a','a2']);
 rows.push(source('나중','b2','2026-01-03'));assert.equal(groupSchoolSources([...rows].reverse(),'recent')[0].name,'가중');
});
test('killer matches existing final-score summary, teacher overrides, other filters and empty results',()=>{
 const rows=[2,5,8,8.9,9,10,null].map((n,i)=>({question_id:String(i),metadata:{source:{school:i%2?'나중':'가중',grade:'중2'},difficulty:{userScore:n}},visibility:'approved'}));
 rows.push({question_id:'override',confirmed:{difficulty:5},metadata:{difficulty:{userScore:10}}});
 assert.equal(filters.clean({compositionBand:'killer'}).compositionBand,'killer');
 assert.equal(rows.filter(c=>filters.matches(c,{compositionBand:'killer'})).length,model.difficultySummary(rows).killerCount);
 for(const school of ['가중','나중','없는학교']){const selected=rows.filter(c=>filters.matches(c,{school}));assert.equal(rows.filter(c=>filters.matches(c,{school,compositionBand:'killer'})).length,model.difficultySummary(selected).killerCount);}
 for(const band of ['low','middle','high','unknown'])assert.equal(rows.filter(c=>filters.matches(c,{compositionBand:band})).length,model.difficultySummary(rows).counts[band]);
 assert.equal(rows.filter(c=>filters.matches(c,{})).length,rows.length);
});
test('registration RPC uses stored original registration facts with existing ACL, not revision updates',async t=>{
 const fs=require('fs'),path=require('path'),{localServer}=require('./shared-bank-local-server.cjs'),{seed}=require('./followup-five-fixture.cjs');const x=await localServer();t.after(()=>x.close());
 await x.db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261010063412_school_source_registration.sql'),'utf8'));
 const {call,records}=await seed(x);const before=await call(x.B,'bank_school_sources',{s:x.S});assert.equal(before.length,2);
 const revision=(await call(x.B,'bank_search_current',{s:x.S,filters:{},start_at:0})).find(r=>r.revision_id===records[0].r);
 await call(x.A,'bank_difficulty_save',{r:revision.revision_id,p:{difficulty:'9.0'},expected:revision.review_version});
 const home=await call(x.B,'bank_home_summary',{s:x.S}),current=await call(x.B,'bank_search_current',{s:x.S,filters:{},start_at:0});
 assert.equal(home.dashboard.difficulty.killerCount,1);assert.equal(current.filter(c=>filters.matches(c,{compositionBand:'killer'})).length,home.dashboard.difficulty.killerCount);
 await assert.rejects(call(x.X,'bank_school_sources',{s:x.S}));await assert.rejects(call(x.B,'bank_school_sources',{s:'00000000-0000-4000-8000-000000000099'}));
 await x.db.exec('reset role');
 const expected=(await x.db.query("select max(q.created_at) d from bank_questions q join bank_catalog c on c.question_id=q.id where c.metadata#>>'{source,school}'='학교A'")).rows[0].d;
 assert.equal(Date.parse(before.find(e=>e.source.school==='학교A').last_registered_at),expected instanceof Date?expected.getTime():Date.parse(expected));
 // Only fixture projection dates are altered: simulate a later revision display
 // and a legacy missing registration without touching real user data.
 await x.db.query("update bank_summary.sources set updated_at='2099-01-01',value=jsonb_set(value,'{updated_at}','\"2099-01-01\"') where space_id=$1",[x.S]);
 assert.deepEqual((await call(x.B,'bank_school_sources',{s:x.S})).map(e=>[e.source_id,e.last_registered_at]).sort(),before.map(e=>[e.source_id,e.last_registered_at]).sort());
 await x.db.exec('reset role');await x.db.query("update bank_summary.originals set fact=fact-'registered_at' where space_id=$1 and fact->>'source_id'='학교A-paper'",[x.S]);
 const legacy=await call(x.B,'bank_school_sources',{s:x.S});assert.equal(legacy.length,2);assert.equal(legacy.find(e=>e.source.school==='학교A').last_registered_at,null);
 assert.equal(records.length,10);
});
