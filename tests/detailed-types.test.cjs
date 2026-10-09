'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const appDir=process.env.EXAM_TYPE_APP_DIR||path.resolve(__dirname,'../app'),load=name=>require(path.join(appDir,name));
const T=load('question-types.cjs'),M=load('bank-model.cjs');
const fine=T.fromDefinition(T.detailedCatalog[0]),other=T.fromDefinition(T.detailedCatalog[1]);
test('detailed overlay, manual input and duplicate keys use the same contract',()=>{
 const row={metadata:{classification:{types:[other],confirmed:{types:[other]}}},confirmed:{type:'구형 넓은 유형',types:[fine]}};
 assert.equal(T.primaryKey(row),fine.repeatKey);assert.deepEqual(T.resolve(fine.coreTask.name,row),[fine]);
 assert.deepEqual(T.resolve(other.repeatKey),[other]);assert.throws(()=>T.resolve('각도 계산'),/세부 유형/);
 for(const types of [[],[{id:'task.angle',name:'각도 계산'}],[{...fine,repeatKey:''}],[{...fine,coreTask:{...fine.coreTask,id:'unknown',name:'기타'}}]])assert.throws(()=>T.requireDetailed({confirmed:{types}}),/세부 유형/);
 const meta={classification:{types:[other]},source:{},difficulty:{aiScore:'4.2'},management:{}};
 const changed=M.patchMetadata(meta,{type:fine.coreTask.name});assert.equal(T.primaryKey({metadata:changed}),fine.repeatKey);assert.deepEqual(changed.difficulty,meta.difficulty);
 const reviewed=load('bank-detailed-types.cjs').applyConfirmed(meta,row);assert.deepEqual(meta.classification.types,[other]);assert.equal(T.primaryKey({metadata:reviewed}),fine.repeatKey);
});
test('registration, review CAS, checksummed restore and replay preserve type overlay without rewriting original metadata',async t=>{
 const x=await require('./shared-bank-local-server.cjs').localServer(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'detailed-types-'));
 const auth=x.auth(x.A),store=new(load('store.cjs').ProjectStore)(dir),storage=new(load('shared-bank-storage.cjs').SharedBankStorage)({auth,fetchImpl:x.fetch});
 const bank=new(load('question-bank.cjs').QuestionBank)({directory:dir,store,storage,auth,appVersion:'type-test',buildDocx:async(_,f)=>fs.writeFileSync(f,'existing test fixture DOCX'),preview:async()=>{throw Error('optional preview unavailable');}});bank.wake=()=>{};
 t.after(async()=>{bank.close();await x.close();fs.rmSync(dir,{recursive:true,force:true});});
 await x.db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/202610090030_detailed_type_contract.sql'),'utf8'));await bank.root();
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/bX8AAAAASUVORK5CYII=','base64'),source=path.join(dir,'source.png');fs.writeFileSync(source,png);
 let p=store.create(source);p=store.addRegion({projectId:p.id,region:{page:1,x:0,y:0,width:1,height:1},imageDataUrl:'data:image/png;base64,'+png.toString('base64')});p=store.updateProblem(p.id,p.problems[0].id,problem=>{problem.original={id:M.uuid(),kind:'original',body:'내심의 성질로 옳은 것은?',choices:['① 내심에서 세 변까지 거리는 같다','② 꼭짓점까지 거리는 같다'],answer:'①',solution:'각 이등분선 위의 점은 두 변에서 같은 거리에 있다.',include:true,approval:{status:'approved'}};});
 const q=p.problems[0].original,item=bank.ensure(p,p.problems[0],q);await assert.rejects(bank.enqueue(p.id,[q.id]),/세부 유형/);assert.equal(bank.state.jobs.length,0);
 item.metadata.classification.types=[fine];await bank.enqueue(p.id,[q.id]);await bank.pump();const job=bank.state.jobs[0];assert.equal(job.status,'complete',job.error);await storage.visibility(job.id,'shared_pending','fixture');
 const before=(await storage.rows('bank_catalog','revision_id=eq.'+job.id))[0];const result=await storage.rpc('bank_review_save',{r:job.id,p:{types:[other]},expected:0});assert.equal(result.version,1);
 await assert.rejects(storage.rpc('bank_review_save',{r:job.id,p:{types:[fine]},expected:0}),/최신/);
 await assert.rejects(storage.rpc('bank_review_save',{r:job.id,p:{types:[]},expected:1}),/세부 유형/);
 await assert.rejects(x.auth(x.X).request('/rest/v1/rpc/bank_review_save',{method:'POST',body:{r:job.id,p:{types:[fine]},expected:1}}),/permission|privilege|권한/i);
 const after=(await storage.rows('bank_catalog','revision_id=eq.'+job.id))[0];for(const k of ['metadata','content','files','question_id','revision_id'])assert.deepEqual(after[k],before[k],k);
 assert.equal(T.primaryKey(after),other.repeatKey);
 const searched=await storage.rpc('bank_search_current',{s:x.S,filters:{type:other.repeatKey}});assert.equal(searched.length,1);
 await bank.restore(job.id);const restored=bank.state.items[item.id];assert.equal(T.primaryKey(restored),other.repeatKey);
 await x.db.exec('reset role');const frozen=JSON.parse(fs.readFileSync(path.join(bank.dir,'outbox',job.id,'complete.json'),'utf8'));frozen.content=before.content;
 await x.db.query('select public.bank_finish($1,$2,$3)',[job.remote.commit.id,x.A,frozen]); // already-committed retry with unchanged checksums
 const tampered={...frozen,metadata:{...frozen.metadata,source:{...frozen.metadata.source,school:'tampered'}}};await assert.rejects(x.db.query('select public.bank_finish($1,$2,$3)',[job.remote.commit.id,x.A,tampered]),/충돌|conflict|다릅|불일치|불변|metadata|immutable/i);
 // Server independently rejects an old client's broad-only native metadata.
 const next=M.uuid(),f=M.uuid();await x.db.query('insert into bank_revisions(id,question_id,parent_id,actor_id) values($1,$2,$3,$4)',[next,item.id,job.id,x.A]);await x.db.query("insert into bank_entries(id,space_id,name,kind,owner_id) values($1,$2,'server-gate','file',$3)",[f,x.S,x.A]);await x.db.query('insert into bank_catalog(revision_id,space_id,question_id,commit_id,metadata,content,files) values($1,$2,$3,$4,$5,$6,$7)',[next,x.S,item.id,f,{...before.metadata,classification:{types:[{id:'task.property',name:'성질 판별'}]}},before.content,before.files]);await assert.rejects(x.db.query('update bank_revisions set committed=true where id=$1',[next]),/세부 유형/);
 assert.equal((await x.db.query('select committed from bank_revisions where id=$1',[next])).rows[0].committed,false);
});


