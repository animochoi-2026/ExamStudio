'use strict';
// Real isolated PostgreSQL (PGlite), simulated HTTP only. No operating access.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {localServer}=require('./shared-bank-local-server.cjs');
const root=path.resolve(__dirname,'..'),proposal=fs.readFileSync(path.join(root,'supabase/proposals/202610040028_inherited_revision_audit_guard.sql'),'utf8');
const baseline=fs.readFileSync(path.join(__dirname,'fixtures/revision-audit-guard-before.sql'),'utf8');
const clone=structuredClone,uuid=()=>crypto.randomUUID(),md5=s=>crypto.createHash('md5').update(s).digest('hex');
const body=()=>`select md5(replace(prosrc,E'\\r\\n',E'\\n')) hash from pg_proc where oid='public.bank_revision_prune_freeze_guard()'::regprocedure`;
async function start(t){const s=await localServer();t.after(()=>s.close());await s.db.exec('reset role');await s.db.exec(baseline);await s.auth(s.A).membership();await s.db.exec('reset role');return s;}
async function entry(s,id,rev,q,verified=true,role='commit',space=s.S){await s.db.query("insert into bank_entries(id,space_id,name,kind,owner_id,verified,size,chunks,sha256,props) values($1,$2,'fixture','file',$3,$4,1,1,$5,$6)",[id,space,s.A,verified,'a'.repeat(64),{role,revisionId:rev,questionId:q}]);}
async function catalog(s,c,r,f,metadata,overrides={}){await s.db.query('insert into bank_catalog(revision_id,space_id,question_id,commit_id,metadata,content,files) values($1,$2,$3,$4,$5,$6,$7)',[r,overrides.space||c.space,overrides.q||c.q,f,metadata,{body:'Editable proof'},overrides.files||[]]);}
async function context(s,space=s.S){const c={space,q:uuid(),old:uuid(),old2:uuid(),head:uuid(),headFile:uuid(),frozenFile:uuid()};await s.db.query('insert into bank_questions(id,space_id,owner_id,owner_email) values($1,$2,$3,$4)',[c.q,space,s.A,'animochoi@gmail.com']);
 for(const[id,p]of[[c.old,null],[c.old2,c.old],[c.head,c.old2]])await s.db.query('insert into bank_revisions(id,question_id,parent_id,actor_id,committed) values($1,$2,$3,$4,true)',[id,c.q,p,s.A]);
 c.metadata={difficulty:{assessment:{revisionBinding:{revisionId:c.old2,fromRevisionId:c.old}},proofAdjustment:{baseRevisionId:c.old2}},content:{body:'Original audit unchanged'}};
 await entry(s,c.headFile,c.head,c.q,true,'commit',space);await entry(s,c.frozenFile,c.old,c.q,true,'asset',space);await catalog(s,c,c.head,c.headFile,c.metadata);return c;}
async function seal(s,c){const job=uuid();await s.db.query('insert into bank_revision_prunes(id,space_id,actor_id,token,manifest,plan,completed) values($1,$2,$3,$4,$5,$6,true)',[job,c.space,s.A,'local',{}, {files:[{id:c.frozenFile}]}]);for(const r of[c.old,c.old2])await s.db.query('insert into bank_revision_prune_marks values($1,$2,$3)',[r,job,{}]);}
async function child(s,c,parent=c.head){const r=uuid(),f=uuid();await s.db.query('insert into bank_revisions(id,question_id,parent_id,actor_id) values($1,$2,$3,$4)',[r,c.q,parent,s.A]);await entry(s,f,r,c.q,false,'commit',c.space);return{r,f};}
async function refused(s,label,operation){await assert.rejects(operation,e=>e.code==='PT409'&&/Revision payload frozen or retired/.test(e.message),label);}
async function schema(s){return(await s.db.query(`select jsonb_build_object('policies',(select jsonb_agg(to_jsonb(p) order by oid) from pg_policy p),'roles',(select jsonb_agg(to_jsonb(r) order by oid) from pg_roles r),'members',(select jsonb_agg(to_jsonb(m) order by space_id,email) from bank_members m),'triggers',(select jsonb_agg(to_jsonb(t) order by oid) from pg_trigger t where not tgisinternal),'acl',(select jsonb_agg(jsonb_build_object('oid',oid,'owner',proowner,'acl',proacl::text,'config',proconfig,'sec',prosecdef) order by oid) from pg_proc where proname like 'bank_%')) value`)).rows[0].value;}

test('inherited audit patch preserves parent records and all reference protections in PostgreSQL',async t=>{
 const s=await start(t),c=await context(s),other=await context(s),foreignAudit=await context(s),absentAudit=await context(s);
 foreignAudit.metadata=clone(c.metadata);await s.db.query('update bank_catalog set metadata=$1 where revision_id=$2',[foreignAudit.metadata,foreignAudit.head]);
 delete absentAudit.metadata.difficulty.assessment.revisionBinding.fromRevisionId;await s.db.query('update bank_catalog set metadata=$1 where revision_id=$2',[absentAudit.metadata,absentAudit.head]);
 for(const ctx of[c,other,foreignAudit,absentAudit])await seal(s,ctx);
 const beforeSchema=await schema(s),beforeParent=(await s.db.query('select to_jsonb(c) value from bank_catalog c where revision_id=$1',[c.head])).rows[0].value;
 const first=await child(s,c),record={questionId:c.q,revisionId:first.r,parentRevisionId:c.head,metadata:clone(c.metadata),content:{body:'Editable proof'},files:[]};
 await t.test('unpatched commit fails atomically; same payload passes patched guard without audit mutation',async()=>{
  await refused(s,'baseline commit',s.db.query('select bank_finish($1,$2,$3)',[first.f,s.A,record]));
  assert.equal((await s.db.query('select committed from bank_revisions where id=$1',[first.r])).rows[0].committed,false);
  assert.equal((await s.db.query('select count(*) n from bank_catalog where revision_id=$1',[first.r])).rows[0].n,0);
  await s.db.exec(proposal);assert.deepEqual(await schema(s),beforeSchema);
  await s.db.query('select bank_finish($1,$2,$3)',[first.f,s.A,record]);
  const stored=(await s.db.query('select metadata from bank_catalog where revision_id=$1',[first.r])).rows[0].metadata;assert.deepEqual(stored,record.metadata);
  assert.equal((await s.db.query('select committed from bank_revisions where id=$1',[first.r])).rows[0].committed,true);
  assert.equal((await s.db.query('select verified from bank_entries where id=$1',[first.f])).rows[0].verified,true);
  assert.deepEqual((await s.db.query('select to_jsonb(c) value from bank_catalog c where revision_id=$1',[c.head])).rows[0].value,beforeParent);
 });
 await t.test('new or moved retired references and composite values are refused',async()=>{
  const mutations=[m=>m.difficulty.assessment.revisionBinding.revisionId=c.old,m=>m.difficulty.proofAdjustment.baseRevisionId=other.old,m=>m.extra={reference:c.old2},m=>m.difficulty.assessment.extra=c.old,m=>m.difficulty.assessment.revisionBinding.revisionId={nested:c.old2},m=>{delete m.difficulty.assessment.revisionBinding.fromRevisionId;m.moved=c.old;},m=>m.difficulty.proofAdjustment.extra=c.old2];
  for(const[i,mutate]of mutations.entries()){const n=await child(s,c),m=clone(c.metadata);mutate(m);await refused(s,'mutation '+i,catalog(s,c,n.r,n.f,m));}
  const n=await child(s,c),m=clone(c.metadata);delete m.difficulty.assessment.revisionBinding.fromRevisionId;m.difficulty.proofAdjustment.newRevisionId=c.old;await refused(s,'new audit path',catalog(s,c,n.r,n.f,m));
  const missing=await child(s,absentAudit),added=clone(absentAudit.metadata);added.difficulty.assessment.revisionBinding.fromRevisionId=absentAudit.old;await refused(s,'designated path absent from parent',catalog(s,absentAudit,missing.r,missing.f,added));
 });
 await t.test('different question, space, parent, missing catalog and uncommitted parent cannot inherit',async()=>{
  const extraSpace=uuid();await s.db.query('insert into bank_spaces(id,name) values($1,$2)',[extraSpace,'Other space']);
  for(const[label,parent,overrides]of[['different question',c.head,{q:other.q}],['different space',c.head,{space:extraSpace}],['different parent',other.head,{}],['no parent',null,{}],['missing parent catalog',c.old2,{}]]){
   if(parent===c.old2){await refused(s,label,child(s,c,parent));continue;} // actual retired revision parent itself stays forbidden
   const n=await child(s,c,parent);await refused(s,label,catalog(s,c,n.r,n.f,clone(c.metadata),overrides));
  }
  const uncommitted=await child(s,c),n=await child(s,c,uncommitted.r);await refused(s,'uncommitted parent',catalog(s,c,n.r,n.f,clone(c.metadata)));
  const alternate=uuid();await s.db.query('insert into bank_revisions(id,question_id,parent_id,actor_id,committed) values($1,$2,$3,$4,true)',[alternate,c.q,c.head,s.A]);const af=uuid();await entry(s,af,alternate,c.q);await catalog(s,c,alternate,af,{difficulty:{assessment:{revisionBinding:{revisionId:other.old}}}}).then(()=>assert.fail('New foreign retired path allowed'),e=>assert.equal(e.code,'PT409'));
  // Same question but an actual parent with different stored paths cannot borrow c.head's provenance.
  await catalog(s,c,alternate,af,{});const a=await child(s,c,alternate);await refused(s,'other same-question parent',catalog(s,c,a.r,a.f,clone(c.metadata)));
  const noCatalog=uuid();await s.db.query('insert into bank_revisions(id,question_id,parent_id,actor_id,committed) values($1,$2,$3,$4,true)',[noCatalog,c.q,c.head,s.A]);const nc=await child(s,c,noCatalog);await refused(s,'missing active parent catalog',catalog(s,c,nc.r,nc.f,clone(c.metadata)));
  const foreign=await child(s,foreignAudit);await refused(s,'even unchanged inherited reference must belong to same question',catalog(s,foreignAudit,foreign.r,foreign.f,clone(foreignAudit.metadata)));
  const completed={r:uuid(),f:uuid()};await s.db.query('insert into bank_revisions(id,question_id,parent_id,actor_id,committed) values($1,$2,$3,$4,true)',[completed.r,c.q,c.head,s.A]);await entry(s,completed.f,completed.r,c.q);await refused(s,'completed child reindex gets no new INSERT exemption',catalog(s,c,completed.r,completed.f,clone(c.metadata)));
 });
 await t.test('actual file, storage, revision and other-table references stay blocked',async()=>{
  const n=await child(s,c);await refused(s,'catalog files',catalog(s,c,n.r,n.f,clone(c.metadata),{files:[{id:c.frozenFile}]}));
  await refused(s,'catalog commit file',catalog(s,c,n.r,c.frozenFile,clone(c.metadata)));
  await refused(s,'file link',s.db.query('insert into bank_revision_files values($1,$2)',[n.r,c.frozenFile]));
  await refused(s,'frozen file update',s.db.query('update bank_entries set name=$1 where id=$2',['Changed',c.frozenFile]));
  await refused(s,'retired revision update',s.db.query('update bank_revisions set review_version=review_version+1 where id=$1',[c.old]));
  await refused(s,'retired parent link',child(s,c,c.old));
  await refused(s,'retired catalog revision',catalog(s,c,c.old,n.f,clone(c.metadata)));
  await refused(s,'Storage insert',s.db.query("insert into storage.objects(bucket_id,name) values('question-bank',$1)",[c.space+'/'+c.frozenFile+'/000']));
  const exam=uuid();await refused(s,'exam pin',s.db.query('insert into bank_exam_drafts(id,space_id,owner_id,title,document) values($1,$2,$3,$4,$5)',[exam,c.space,s.A,'Local fixture',{items:[{questionId:c.q,revisionId:c.old}]}]));
  const freeFile=uuid();await entry(s,freeFile,n.r,c.q,true,'asset');await s.db.query("insert into storage.objects(bucket_id,name) values('question-bank',$1)",[c.space+'/'+freeFile+'/000']);
  await refused(s,'Storage rename to retired file',s.db.query("update storage.objects set name=$1 where name=$2",[c.space+'/'+c.frozenFile+'/001',c.space+'/'+freeFile+'/000']));
 });
 await t.test('ordinary metadata and existing UPDATE behavior remain usable',async()=>{
  const n=await child(s,c);await catalog(s,c,n.r,n.f,{content:{body:'Ordinary question'},difficulty:{assessment:{revisionBinding:{revisionId:c.head}}}});
  await s.db.query('update bank_catalog set confirmed=$1 where revision_id=$2',[{reviewed:true},c.head]);
  await refused(s,'new retired metadata UPDATE',s.db.query('update bank_catalog set metadata=$1 where revision_id=$2',[{extra:other.old},c.head]));
  assert.deepEqual((await s.db.query('select metadata from bank_catalog where revision_id=$1',[c.head])).rows[0].metadata,c.metadata);
 });
});

test('deployment preflight refuses drift and postflight rolls back mismatches',async t=>{
 const s=await start(t),originalHash=(await s.db.query(body())).rows[0].hash;assert.equal(originalHash,'5e0e4cd0e7b354accfe05770a840d62a');
 await t.test('missing function aborts',async()=>{await s.db.exec('alter function bank_revision_prune_freeze_guard() rename to fixture_missing_guard');await assert.rejects(s.db.exec(proposal),/Expected freeze guard missing/);await s.db.exec('rollback');await s.db.exec('alter function fixture_missing_guard() rename to bank_revision_prune_freeze_guard');});
 await t.test('unexpected body and inactive catalog trigger abort',async()=>{
  await s.db.exec(baseline.replace('return new;','return new; /* local drift */'));
  await assert.rejects(s.db.exec(proposal),/definition differs/);await s.db.exec('rollback');await s.db.exec(baseline);
  await s.db.exec('alter table bank_catalog disable trigger bank_prune_freeze');await assert.rejects(s.db.exec(proposal),/active catalog/);await s.db.exec('rollback');await s.db.exec('alter table bank_catalog enable trigger bank_prune_freeze');
 });
 await t.test('postflight failure rolls back CREATE OR REPLACE; successful patch preserves schema',async()=>{
  const sig=await schema(s);await assert.rejects(s.db.exec(proposal.replace("IS DISTINCT FROM '4ba28e8444d8fd0d84e654952447da1b'","IS DISTINCT FROM '00000000000000000000000000000000'")),/Patched guard definition mismatch/);await s.db.exec('rollback');
  assert.equal((await s.db.query(body())).rows[0].hash,originalHash);assert.deepEqual(await schema(s),sig);
  await s.db.exec(proposal);assert.equal((await s.db.query(body())).rows[0].hash,'4ba28e8444d8fd0d84e654952447da1b');assert.deepEqual(await schema(s),sig);
  await assert.rejects(s.db.exec(proposal),/definition differs/);await s.db.exec('rollback');assert.equal((await s.db.query(body())).rows[0].hash,'4ba28e8444d8fd0d84e654952447da1b');
 });
});

test('saved exact two commit payloads fail before patch and pass normal verifier after patch',async t=>{
 const directory=path.join(root,'tmp/arrow-pdf-followup-20261004/apply-two-native'),planPath=path.join(directory,'plan.json');
 if(!fs.existsSync(planPath)){t.skip('Explicit operating payload evidence is not present on this checkout');return;}
 const s=await start(t),plan=JSON.parse(fs.readFileSync(planPath)),live=JSON.parse(fs.readFileSync(path.join(directory,'commit-diagnosis-read.json'))),old=JSON.parse(fs.readFileSync(path.join(root,'tmp/all-past-files-20261004/inventory-after.json')));
 const commits=plan.items.map(i=>({...i,record:JSON.parse(fs.readFileSync(path.join(i.out,'complete.json'))),native:JSON.parse(fs.readFileSync(path.join(i.out,'question.json')))}));
 for(const item of commits){await s.db.query('insert into bank_questions(id,space_id,owner_id,owner_email) values($1,$2,$3,$4)',[item.questionId,s.S,s.A,'animochoi@gmail.com']);
  const chain=live.revisions.filter(r=>r.question_id===item.questionId);for(const r of chain)await s.db.query('insert into bank_revisions(id,question_id,parent_id,actor_id,committed) values($1,$2,null,$3,$4)',[r.id,r.question_id,s.A,r.committed]);
  for(const r of chain)if(chain.some(p=>p.id===r.parent_id))await s.db.query('update bank_revisions set parent_id=$1 where id=$2',[r.parent_id,r.id]);
  // The oldest preserved ancestor's earlier parent is intentionally outside this minimal local fixture.
  const parentCatalog=old.catalogReferences.find(c=>c.revisionId===item.parent),oldParentEntry=old.entries.find(e=>e.id===parentCatalog.commitId);assert.ok(parentCatalog&&oldParentEntry);
  await entry(s,oldParentEntry.id,item.parent,item.questionId,true);
  const parentNativeName=item.questionId==='705c8c02-e7bd-4b60-91a4-171b74d412cb'?'corrected-native.json':'gwang6-corrected-native.json';
  const parentNative=JSON.parse(fs.readFileSync(path.join(directory,'../',parentNativeName)));
  await catalog(s,{q:item.questionId,space:s.S},item.parent,oldParentEntry.id,parentNative.metadata);
  for(const descriptor of item.record.files){if((await s.db.query('select id from bank_entries where id=$1',[descriptor.id])).rows.length)continue;const original=live.files.find(f=>f.id===descriptor.id)||old.entries.find(f=>f.id===descriptor.id);assert.ok(original,'Existing source/file descriptor evidence');
   await s.db.query('insert into bank_entries(id,space_id,name,kind,owner_id,verified,size,chunks,sha256,md5,props) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[original.id,s.S,original.name||descriptor.name,'file',s.A,true,original.size,original.chunks,original.sha256,original.md5||null,original.props]);
   if(descriptor.role==='data'){const bytes=fs.readFileSync(path.join(item.out,'question.json'));assert.equal(bytes.length,descriptor.size);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),descriptor.sha256);await s.db.query('update bank_entries set md5=$1 where id=$2',[md5(bytes),descriptor.id]);await putObject(s,descriptor.id,bytes);}
  }
  const original=live.files.find(f=>f.id===item.record.files.find(f=>f.role==='data').id),commitEntry=live.files.find(f=>f.props.role==='commit'&&f.props.revisionId===item.revisionId),commitBytes=fs.readFileSync(path.join(item.out,'complete.json'));assert.ok(original&&commitEntry);
  assert.equal(commitBytes.length,commitEntry.size);assert.equal(crypto.createHash('sha256').update(commitBytes).digest('hex'),commitEntry.sha256);
  await s.db.query('insert into bank_entries(id,space_id,name,kind,owner_id,verified,size,chunks,sha256,md5,props) values($1,$2,$3,$4,$5,false,$6,$7,$8,$9,$10)',[commitEntry.id,s.S,'complete.json','file',s.A,commitEntry.size,commitEntry.chunks,commitEntry.sha256,commitEntry.md5,commitEntry.props]);await putObject(s,commitEntry.id,commitBytes);item.commitId=commitEntry.id;
 }
 const job=uuid();await s.db.query('insert into bank_revision_prunes(id,space_id,actor_id,token,manifest,plan,completed) values($1,$2,$3,$4,$5,$6,true)',[job,s.S,s.A,'local',{}, {files:[]}]);
 for(const r of live.readOnlyFreezeState.excluded.filter(r=>r.reason==='already_frozen_or_retired'))await s.db.query('insert into bank_revision_prune_marks values($1,$2,$3)',[r.revisionId,job,{}]);
 const initialFileIds=(await s.db.query('select id from bank_entries order by id')).rows,initialRevisions=(await s.db.query('select id from bank_revisions order by id')).rows;
 const results=[];
 for(const i of commits){const response=await verify(s,i.commitId);assert.equal(response.status,409);assert.equal(response.json.code,'PT409');assert.match(response.json.error,/Revision payload frozen or retired/);results.push({questionId:i.questionId,revisionId:i.revisionId,commitId:i.commitId,beforeStatus:409});}
 await s.db.exec('reset role');await s.db.exec(proposal);
 for(const[i,item]of commits.entries()){const response=await verify(s,item.commitId);assert.equal(response.status,200,JSON.stringify(response.json));await s.db.exec('reset role');const cat=(await s.db.query('select * from bank_catalog where revision_id=$1',[item.revisionId])).rows[0];assert.deepEqual(cat.metadata,item.record.metadata);assert.deepEqual(cat.files,item.record.files);
  assert.equal((await s.db.query('select committed from bank_revisions where id=$1',[item.revisionId])).rows[0].committed,true);assert.equal((await s.db.query('select verified from bank_entries where id=$1',[item.commitId])).rows[0].verified,true);
  assert.equal((await s.db.query('select count(*) n from bank_revision_files where revision_id=$1',[item.revisionId])).rows[0].n,item.record.files.length+1);results[i].afterStatus=200;results[i].metadataUnchanged=true;
 }
 assert.deepEqual((await s.db.query('select id from bank_entries order by id')).rows,initialFileIds);assert.deepEqual((await s.db.query('select id from bank_revisions order by id')).rows,initialRevisions);
 fs.writeFileSync(path.join(directory,'audit-guard-two-payload-local-verification.json'),JSON.stringify({localOnly:true,operatingCalls:0,newOperatingFiles:0,results,payloadIdsUnchanged:true},null,2));
});
async function putObject(s,id,bytes){const name=s.S+'/'+id+'/000';await s.db.query("insert into storage.objects(bucket_id,name,metadata) values('question-bank',$1,$2)",[name,{size:bytes.length}]);s.bytes.set(name,bytes);}
async function verify(s,id){const response=await s.fetch('https://test-project.supabase.co/functions/v1/bank-verify',{method:'POST',headers:{Authorization:'Bearer '+s.A,'Content-Type':'application/json'},body:JSON.stringify({id})});return{status:response.status,json:await response.json()};}
