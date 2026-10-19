const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const D=require('../app/difficulty-assessment.cjs'),M=require('../app/difficulty-display.cjs'),B=require('../app/bank-exam-model.cjs'),F=require('../app/bank-search-filters.cjs');
const row=(tier,score=6.9)=>({question_id:randomUUID(),metadata:{difficulty:{v121Latest:{record:{final_status:'complete',final_score:score,final_tier:tier}}}},confirmed:{}});
test('tier mapping is exclusive even across old score boundaries; summary and desktop agree',()=>{
 const expected=['low','low','middle','high','high','killer'];
 expected.forEach((band,i)=>{const r=row('T'+i);assert.equal(D.compositionBand(r),band);assert.equal(require('../app/desktop-difficulty.cjs').effective(r).band,M.labels[band]);for(const k of M.keys)assert.equal(F.matches(r,{compositionBand:k}),k===band);});
 assert.equal(D.compositionBand(row(null)),'unknown');
 const r=row('T4',9.2);assert.equal(F.isKiller(r),false);assert.equal(D.compositionBand({...r,confirmed:{difficulty:9.2}}),'killer');
 assert.equal(D.compositionBand({summaryDifficulty:{score:6.9,compositionBand:'high',displayMappingVersion:M.version}}),'high');
 const compact={summaryDifficulty:{score:6.9,finalTier:'T3',compositionBand:'high',displayMappingVersion:M.version,numberSource:'AI v1.2.1'}};
 assert.equal(M.snapshotTier(compact),'T3');assert.equal(D.compositionBand(M.paperRow({scoreSnapshot:6.9},compact)),'high');assert.equal(M.snapshotTier({summaryDifficulty:{...compact.summaryDifficulty,numberSource:'교사 조정'}}),null);
 assert.deepEqual(B.profileCounts(10,{low:30,middle:40,high:20,killer:10}),{low:3,middle:4,high:2,killer:1});
 const p={items:[{scoreSnapshot:6.9,catalogSnapshot:row('T3',6.9)},{scoreSnapshot:9.2,tierSnapshot:'T4'},{scoreSnapshot:9.8,catalogSnapshot:row('T5',9.8)}]};
 assert.deepEqual(require('../app/paper-composition.cjs').summary(p.items).difficulty,{low:0,middle:0,high:2,killer:1,unknown:0});
});
test('approved 1266 results replay unchanged and display 715/464/86/1',()=>{
 const file='artifacts/difficulty-v121/production-20261019/prepared.json';if(!fs.existsSync(file))return;
 const p=JSON.parse(fs.readFileSync(file)),a=require('../scripts/audit-v121-tier-distribution.cjs').audit(p);
 for(const issues of Object.values(a.mismatches))assert.equal(issues.length,0);
 const rows=p.items.map(x=>({...x.snapshot,confirmed:{},metadata:{...x.snapshot.metadata,difficulty:{v121Active:x.result}}}));
 const s=B.difficultySummary(rows);assert.deepEqual(s.counts,{low:715,middle:464,high:86,killer:1,unknown:0,deferred:0});assert.equal(Object.values(s.counts).reduce((a,b)=>a+b),1266);
 assert.equal(F.isKiller(rows.find(c=>c.metadata.difficulty.v121Active.final_tier==='T3')),false);
});
test('SQL shares exact map, grade/home/statistics/page projections and 20-row paging',async t=>{
 const {groupFixture}=require('./group-operations-fixture.cjs'),x=await groupFixture();t.after(()=>x.close());const {db,rpc,A,S}=x;
 await db.exec('reset role');
 for(let i=0;i<6;i++)assert.equal((await db.query('select bank_v121.display_band($1,6.9,false) band',['T'+i])).rows[0].band,M.fromTier('T'+i));
 const versions=require('../app/difficulty-v121/desktop-policy.cjs').versions;
 await db.exec('begin');
 for(let n=0;n<28;n++){
  const q=randomUUID(),r=randomUUID(),f=randomUUID(),tier=n<23?'T3':n<25?'T4':n<27?'T5':'T2',score=tier==='T4'?9.2:tier==='T5'?9.8:tier==='T3'?6.9:4.6;
  const record={...versions,final_status:'complete',final_stage:3,final_model:'gpt-6.1-sol',final_reasoning_effort:'high',final_score:score,final_tier:tier,stage3_validation_result:{valid:true,solution_validated:true}};
  await db.query("insert into bank_questions(id,space_id,owner_id,owner_email) values($1,$2,$3,'animochoi@gmail.com')",[q,S,A]);await db.query("insert into bank_revisions(id,question_id,actor_id,committed,visibility) values($1,$2,$3,true,'approved')",[r,q,A]);await db.query("insert into bank_entries(id,space_id,name,kind,owner_id) values($1,$2,'mapping','file',$3)",[f,S,A]);
  await db.query("insert into bank_catalog(revision_id,space_id,question_id,commit_id,metadata,confirmed,content,files) values($1,$2,$3,$4,$5,'{}','{}','[]')",[r,S,q,f,{difficulty:{v121Latest:{record}},classification:{primaryUnit:{id:'m2-8.7'}},content:{responseType:'선택형'},source:{kind:'학교기출',school:'검증중',grade:'중2',documentId:'mapping',originalNumber:String(n+1)}}]);
 }
 await db.exec('commit');
 for(const name of ['bank_search_page','bank_question_page']){
  const high=await rpc(A,name,{s:S,filters:{compositionBand:'high'},start_at:0}),next=await rpc(A,name,{s:S,filters:{compositionBand:'high'},start_at:20}),killer=await rpc(A,name,{s:S,filters:{compositionBand:'killer'}});
  assert.equal(high.total,25);assert.equal(high.items.length,20);assert.equal(next.items.length,5);assert.equal(killer.total,2);assert(high.items.every(c=>D.compositionBand(c)==='high'));assert(killer.items.every(c=>D.compositionBand(c)==='killer'));
 }
 const home=await rpc(A,'bank_home_summary',{s:S});assert.deepEqual(home.dashboard.difficulty.counts,{low:0,middle:1,high:25,killer:2,unknown:0,deferred:0});
 for(const [band,total]of [['high',25],['killer',2]]){const candidates=await rpc(A,'bank_replacement_candidates',{s:S,current_revision:null,selected:[],rules:{purpose:'supplement',grade:'중2',units:['m2-8.7'],schools:['검증중'],supplementBands:[band]}});assert.equal(candidates.total,total);assert(candidates.items.every(c=>D.compositionBand(c)===band));}
 const stats=await rpc(A,'bank_difficulty_summary',{s:S});assert.equal(stats.groups.find(g=>g.school==='검증중').all.compositionDistribution.high,25);
 await db.exec('reset role');const pub=(await db.query('select bank_public_summary($1) v',[S])).rows[0].v;assert.equal(pub.dashboard.difficulty.counts.killer,2);
});
