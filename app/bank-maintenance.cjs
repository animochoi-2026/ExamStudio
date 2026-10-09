 'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {atomicWrite,ProjectStore}=require('./store.cjs'),{QuestionBank}=require('./question-bank.cjs'),{SharedBankStorage}=require('./shared-bank-storage.cjs');
const R=require('./bank-maintenance-rules.cjs'),T=require('./bank-transfer.cjs');
const uuid=()=>crypto.randomUUID(),now=()=>new Date().toISOString(),copy=structuredClone;
class BankMaintenance{
 constructor({bank,getBridge,getSettings,blocked=()=>false,onEvent=()=>{}}){Object.assign(this,{bank,getBridge,getSettings,blocked,onEvent});this.dir=path.join(bank.dir,'maintenance');this.file=path.join(this.dir,'jobs.json');fs.mkdirSync(this.dir,{recursive:true});try{this.jobs=fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,'utf8')):[];if(!Array.isArray(this.jobs))throw Error();}catch{this.jobs=[];this.blockedError='일괄 작업 기록을 읽지 못했습니다. 원래 jobs.json은 보존했습니다. 백업을 확인하세요.';return;}for(const j of this.jobs)if(['running','sampling'].includes(j.status)){j.status='paused';j.message='앱 종료 후 정지됨. 재개 전 현재 버전을 확인합니다.';}this.save();}
 save(){if(this.blockedError)return;atomicWrite(this.file,this.jobs);this.onEvent({type:'bank-updated'});}
 async owner(){if(this.blockedError)throw Error(this.blockedError);const m=await this.bank.auth.membership();if(m.role!=='owner')throw Error('관리자만 일괄 업데이트를 실행할 수 있습니다.');return m;}
 async status(){await this.owner();return{rules:R.registry,jobs:this.jobs,execution:'관리자 PC의 문제공방 앱',running:this.active||null};}
 job(id){const j=this.jobs.find(j=>j.id===id);if(!j)throw Error('이 PC의 작업 기록이 없습니다.');return j;}
 async sync(j){this.save();try{await this.bank.storage.rpc('bank_maintenance_progress',{j:j.id,state:j.status,details:{counts:this.counts(j),message:j.message||null,items:j.items.map(i=>({questionId:i.questionId,status:i.status,error:i.error||null,resultId:i.resultId||null}))}});delete j.syncError;}catch(e){j.syncError=e.message;}this.save();}
 counts(j){return j.items.reduce((a,i)=>(a[i.status]=(a[i.status]||0)+1,a),{total:j.items.length});}
 async candidates(){await this.owner();const out=[];for(let start=0;;start+=50){const page=await this.bank.storage.rpc('bank_search_current',{s:this.bank.auth.config().spaceId,filters:{},start_at:start});out.push(...page.map(c=>({id:c.question_id,source:c.metadata?.source||{},unit:c.metadata?.classification?.primaryUnit?.name||null})));if(page.length<50)break;}return out;}
 async plan({rules=['source','render','integrity'],filters={},provider='codex'}={}){
  await this.owner();if(this.active)throw Error('진행 중인 작업을 중단한 뒤 계획하세요.');if(!rules.length||rules.some(id=>!R.registry.some(r=>r.id===id)))throw Error('처리 규칙을 선택하세요.');
  if(rules.includes('types')&&(rules.length!==1))throw Error('출제유형 보완은 다른 분석·재생성 규칙과 분리해 계획하세요.');
  const ratings=rules.includes('calibration')?await this.bank.storage.rpc('bank_rating_samples',{s:this.bank.auth.config().spaceId}):[],rows=[];
  for(let start=0;;start+=50){const page=await this.bank.storage.rpc('bank_search_current',{s:this.bank.auth.config().spaceId,filters:{},start_at:start});for(const c of page){const s=c.metadata?.source||{};if(filters.ids?.length&&!filters.ids.includes(c.question_id)||filters.school&&s.school!==filters.school||filters.sourceId&&s.documentId!==filters.sourceId)continue;if(filters.missing==='preview'&&(c.files||[]).some(f=>f.role==='preview'))continue;if(filters.missing&&filters.missing!=='preview'){const v=filters.missing.split('.').reduce((a,k)=>a?.[k],c.metadata);if(v!=null&&v!==''&&(!Array.isArray(v)||v.length))continue;}const full=(await this.bank.storage.rows('bank_catalog','revision_id=eq.'+c.revision_id))[0];if(full)rows.push({...c,...full});}if(page.length<50)break;}
  const typeCatalog=rules.includes('types')?await this.bank.storage.rows('bank_taxonomy','space_id=eq.'+this.bank.auth.config().spaceId+'&kind=eq.type&retired=eq.false'):[];
  const items=[];for(const row of rows){const selected=R.registry.filter(r=>rules.includes(r.id)&&R.needed(r,row,ratings));if(!selected.length)continue;const typePlan=rules.includes('types')?require('./bank-question-types.cjs').infer(row,typeCatalog):null;items.push({questionId:row.question_id,baseId:row.revision_id,reviewVersion:row.review_version,commitId:row.commit_id,before:row,rules:selected.map(r=>r.id),status:'pending',unresolved:[],...(typePlan?{typePlan,typeExpected:require('./bank-type-backfill.cjs').snapshot(row)}:{})});}
  const j={id:uuid(),createdAt:now(),status:'planned',provider,rules,filters,ratings,items,execution:'desktop',spec:{rules:R.registry.filter(r=>rules.includes(r.id)),filters,provider,execution:'desktop',version:1},estimate:{questions:items.length,aiRequestsMax:items.filter(i=>i.rules.includes('analysis')).length*2,knownDownloadBytes:items.reduce((n,i)=>n+(i.before.files||[]).reduce((a,f)=>a+Number(f.size||0),0),0),tokenCost:null,uploadBytes:null},message:'샘플 처리 후 변경 전후를 확인하세요.'};
  await this.bank.storage.rpc('bank_maintenance_job',{s:this.bank.auth.config().spaceId,j:j.id,specification:j.spec});this.jobs.push(j);await this.sync(j);return j;
 }
 workDir(j,i){return path.join(this.bank.dir,'m_'+R.hash([j.id,i.questionId]).slice(0,20));}
 worker(j,i){const directory=this.workDir(j,i),store=new ProjectStore(path.join(directory,'workspace'));
  const storage=new SharedBankStorage({auth:this.bank.auth,fetchImpl:this.bank.storage.fetch});storage.prepareItem=async()=>({actorId:(await this.owner()).userId,foreign:false});
  const bank=new QuestionBank({directory,store,storage,auth:this.bank.auth,appVersion:this.bank.appVersion,buildDocx:this.bank.buildDocx,preview:this.bank.preview,losslessUploads:this.bank.losslessUploads});bank.wake=()=>{};bank.autonomous=false;bank.state.auto=false;bank.state.root=this.bank.state.root;return{bank,store,directory};
 }
 async current(i){const rows=await this.bank.storage.rows('bank_revisions','question_id=eq.'+i.questionId),committed=rows.filter(r=>r.committed),parents=new Set(committed.map(r=>r.parent_id)),heads=committed.filter(r=>!parents.has(r.id));if(heads.length!==1||heads[0].id!==i.baseId||heads[0].review_version!==i.reviewVersion)throw Error('수정 충돌: 계획 이후 새 문항 버전 또는 검수값이 있습니다. 새 계획에서 비교하세요.');if(i.typeExpected){const [row]=await this.bank.storage.rows('bank_catalog','revision_id=eq.'+i.baseId);require('./bank-type-backfill.cjs').checkCurrent({...i,expected:i.typeExpected},row,heads[0]);}}
 async stage(j,i){await this.owner();if(this.blocked())throw Error('현재 편집·출력 작업이 끝난 뒤 재개하세요.');await this.current(i);
  const w=this.worker(j,i);try{
   // Backup DB record + every native/derived file with SHA before any rewrite.
   const archive=path.join(w.directory,'backup');if(!fs.existsSync(path.join(archive,'backup.json')))await T.backup(this.bank,archive,{revisionIds:[i.baseId]});
   const saved=new T.ArchiveStorage(archive);for(const f of saved.archive.files)await saved.download(f.id,f);i.backupComplete=true;this.save();
   let project;if(i.projectId)project=w.store.get(i.projectId);else{w.bank.state.cache[i.baseId]={commitId:i.commitId};project=(await w.bank.restore(i.baseId)).project;i.projectId=project.id;this.save();}
   const problem=project.problems[0],item=w.bank.state.items[i.questionId],question=[problem.original,...problem.variants].find(q=>q?.id===item.questionId);
   if(!question)throw Error('보존된 네이티브 문항을 찾을 수 없습니다.');
   if(!i.processed){item.metadata=copy(i.before.metadata);i.evidence=[];i.unresolved=[];
    if(i.rules.includes('types')){if(i.typePlan?.status!=='suggested')throw Error('출제유형 근거 부족: '+(i.typePlan?.reason||'보존 본문 확인 필요'));const T=require('./bank-question-types.cjs');if(T.fingerprint(i.before)!==i.typePlan.fingerprint)throw Error('출제유형 입력이 변경되었습니다.');for(const k of ['body','choices','answer','solution'])if(R.hash(question[k]??(k==='choices'?[]:''))!==R.hash(i.before.content[k]??(k==='choices'?[]:'')))throw Error('보존된 네이티브 본문·풀이가 현재 목록과 다릅니다. 먼저 자료를 확인하세요.');item.metadata=T.apply(item.metadata,i.typePlan);i.evidence=i.typePlan.types.map(t=>({field:'classification.types',id:t.id,basis:t.evidence,ruleVersion:T.version}));}
    if(i.rules.includes('source')){const result=R.recoverSource(item.metadata,project,problem,question);item.metadata=result.metadata;i.evidence=result.evidence;i.unresolved.push(...result.unresolved);item.overrides={...item.overrides,...item.metadata.source};}
    if(i.rules.includes('analysis')){const analysis=new(require('./bank-analysis.cjs').BankAnalysis)({store:w.store,getBridge:this.getBridge,getSettings:this.getSettings});const result=await analysis.run(w.bank,{projectId:project.id,questionIds:[question.id],provider:j.provider});i.analysis=result;if(result.errors.length)throw Error(result.errors.map(e=>e.message).join('; '));}
    if(i.rules.includes('calibration')){const m=item.metadata,d=m.difficulty;const result=require('./bank-calibration.cjs').calibrate({rawScore:d.aiScore,confirmedScore:i.before.confirmed?.difficulty??d.userScore,model:m.analysis?.model,criteriaVersion:d.criteriaVersion,grade:m.source?.grade,scopeKey:d.scope,type:m.content?.responseType},j.ratings);if(d.userScore==null&&i.before.confirmed?.difficulty==null){d.calibratedScore=result.score;d.calibration=result;}if(!result.families)i.unresolved.push({field:'difficulty.calibration',reason:result.reason});}
    if(!i.rules.includes('types')&&!question.diagram&&!question.parts?.some(p=>p.type==='diagram'||p.type==='image'))i.unresolved.push({field:'diagram',reason:'보존 데이터에 도형이 없으면 새 그림을 추측해 만들지 않습니다.'});
    // A processing stamp is evidence of the operation, not mathematical approval.
    item.metadata.processing||={protocol:1,rules:{}};item.metadata.processing.rules||={};item.metadata.processing.nativeInput=R.nativeInput(require('./bank-model.cjs').portableSnapshot(project,problem,question,w.store.projectDir(project.id))); 
    for(const id of i.rules){const rule=R.registry.find(r=>r.id===id);item.metadata.processing.rules[id]={version:rule.version,nativeInput:item.metadata.processing.nativeInput,input:R.input(id,{...i.before,metadata:item.metadata},j.ratings),jobId:j.id,at:now(),unresolved:i.unresolved.filter(x=>id==='source'?x.field.startsWith('source'):id==='calibration'?x.field.startsWith('difficulty'):x.field==='diagram')};}
    // Original source ordering and human overrides must survive ensure/enqueue.
    item.overrides={...item.overrides,...item.metadata.source};item.hasLocalChanges=true;w.bank.save();
    const typeMetadata=i.rules.includes('types')?copy(item.metadata):null;
    await w.bank.enqueue(project.id,[question.id]);const upload=w.bank.state.jobs.at(-1);if(!upload||upload.questionId!==i.questionId)throw Error('문항 ID 보존 확인 실패');
    if(typeMetadata){require('./bank-type-backfill.cjs').assertPreserved(i.before.metadata,typeMetadata);item.metadata=typeMetadata;const file=path.join(w.bank.dir,'outbox',upload.id,'question.json'),bundle=JSON.parse(fs.readFileSync(file,'utf8'));bundle.metadata=copy(typeMetadata);atomicWrite(file,bundle);w.bank.save();}
    if(!i.rules.includes('source')||Object.hasOwn(i,'sourceOverride')){
     // ensure() may infer a position or order from a restored one-question
     // project. Analysis/render maintenance must keep the actual source values.
     const original=Object.hasOwn(i,'sourceOverride')?i.sourceOverride:i.before.metadata.source;
     item.metadata.source=copy(original);
     const bundlePath=path.join(w.bank.dir,'outbox',upload.id,'question.json'),bundle=JSON.parse(fs.readFileSync(bundlePath,'utf8'));
     bundle.metadata.source=copy(original);atomicWrite(bundlePath,bundle);w.bank.save();
    }
    i.uploadId=upload.id;i.resultId=upload.revisionId;i.processed=true;i.diff=R.diff(i.before.metadata,item.metadata);this.save();
   }
   const upload=w.bank.state.jobs.find(x=>x.id===i.uploadId),out=path.join(w.bank.dir,'outbox',upload.id);
   if(!upload.prepared){if(i.rules.includes('render')){const input=JSON.parse(fs.readFileSync(path.join(out,'local-input.json'),'utf8'));await w.bank.buildDocx(input,path.join(out,'question.docx'));if(!w.bank.preview)throw Error('미리보기 생성기가 없습니다.');await w.bank.preview(path.join(out,'question.docx'),path.join(out,'preview.png'));upload.previewStatus='complete';}
    else{const commit=JSON.parse(await saved.download(i.commitId));const doc=commit.files.find(f=>f.role==='docx'),preview=commit.files.find(f=>f.role==='preview');fs.writeFileSync(path.join(out,'question.docx'),await saved.download(doc.id,doc));if(preview){fs.writeFileSync(path.join(out,'preview.png'),await saved.download(preview.id,preview));upload.previewStatus='complete';}else{upload.previewStatus='unavailable';i.unresolved.push({field:'preview',reason:'이전 미리보기 없음. 파일 재생성 작업을 선택하세요.'});}}
    if(!fs.statSync(path.join(out,'question.docx')).size)throw Error('DOCX가 비어 있습니다.');if(upload.previewStatus==='complete'){const image=await require('sharp')(fs.readFileSync(path.join(out,'preview.png'))).metadata();if(!['png','webp'].includes(image.format)||!image.width||!image.height)throw Error('미리보기 이미지 검증 실패');}upload.prepared=true;w.bank.save();}
   i.status='staged';i.error=null;this.save();return i;
  }finally{w.bank.close();}
 }
 async sample(id){await this.owner();if(this.active)throw Error('이미 작업 중입니다.');const j=this.job(id);this.active=id;j.pauseRequested=false;j.status='sampling';await this.sync(j);let candidates=j.items.filter(i=>!['complete','staged'].includes(i.status));if(j.rules.includes('types')){const seen=new Set();candidates=candidates.filter(i=>{const id=i.typePlan?.types?.[0]?.id;if(!id||seen.has(id))return false;seen.add(id);return true;});}try{for(const i of candidates.slice(0,3)){if(this.closed||j.pauseRequested)break;try{await this.stage(j,i);}catch(e){i.status='failed';i.error=e.message;}await this.sync(j);}j.status='staged';j.message='샘플 변경·미해결 항목을 확인한 뒤 적용하세요.';}finally{this.active=null;await this.sync(j);}return j;}
 async start(id){await this.owner();if(this.active)throw Error('이미 작업 중입니다.');const j=this.job(id);if(!j.items.some(i=>i.status==='staged'||i.status==='complete'||i.processed))throw Error('먼저 샘플 처리를 완료하고 확인하세요.');j.pauseRequested=false;j.approvedAt=now();this.active=id;j.status='running';await this.sync(j);this.promise=this.run(j).finally(()=>{this.active=null;});return j;}
 async seedSourceFiles(i,w,upload){
  // A maintenance revision reuses the verified source file referenced by its
  // completed parent. Looking it up by JSON sourceKey scans every bank entry
  // under RLS and can hit the hosted statement timeout.
  const refs=JSON.parse(fs.readFileSync(path.join(w.bank.dir,'outbox',upload.id,'local-input.json'),'utf8')).refs;
  const rootId=this.bank.state.root?.id;
  if(!rootId)throw Error('공동 문제은행 연결이 필요합니다.');
  for(const ref of refs.filter(r=>r.role==='source')){
   const registryKey=require('./bank-drive.cjs').digest(Buffer.from(rootId+'source-file:'+ref.sourceId+':'+ref.sha256));
   if(w.bank.state.folders[registryKey])continue;
   const prior=(i.before.files||[]).find(f=>f.role==='source'&&f.key===ref.key&&f.sha256===ref.sha256);
   if(!prior)throw Error('기준 버전의 원본 파일 관계를 확인할 수 없습니다. 원본을 추측해 다시 올리지 않습니다.');
   const remote=await this.bank.storage.get(prior.id);
   if(!remote.raw?.verified||remote.sha256!==ref.sha256||remote.appProperties?.sourceKey!==registryKey||!remote.parents?.[0])throw Error('기존 원본 파일의 ID·해시·출처 연결이 일치하지 않습니다.');
   w.bank.state.folders[registryKey]={id:remote.id,parentId:remote.parents[0]};
  }
  w.bank.save();
 }
 async planSourceRestore(originId){
  await this.owner();if(this.active)throw Error('진행 중인 작업을 중단한 뒤 계획하세요.');
  const origin=this.job(originId);if(origin.status!=='complete')throw Error('완료된 기준 작업만 출처 정정에 사용할 수 있습니다.');
  const same=require('node:util').isDeepStrictEqual,items=[];
  for(const old of origin.items.filter(x=>x.status==='complete')){
   const [revision]=await this.bank.storage.rows('bank_revisions','id=eq.'+old.resultId);
   const [catalog]=await this.bank.storage.rows('bank_catalog','revision_id=eq.'+old.resultId);
   if(!revision?.committed||!catalog)throw Error('완료 기록을 확인할 수 없습니다: '+old.questionId);
   const source=old.before.metadata.source;
   if(same(catalog.metadata.source,source))continue;
   const all=await this.bank.storage.rows('bank_revisions','question_id=eq.'+old.questionId),heads=all.filter(x=>x.committed&&!all.some(y=>y.committed&&y.parent_id===x.id));
   if(heads.length!==1||heads[0].id!==old.resultId)throw Error('후속 수정이 있어 출처 정정을 보류합니다: '+old.questionId);
   items.push({questionId:old.questionId,baseId:old.resultId,reviewVersion:revision.review_version,commitId:catalog.commit_id,before:catalog,rules:[],sourceOverride:copy(source),status:'pending',unresolved:[],origin:{jobId:originId,baseId:old.baseId}});
  }
  const j={id:uuid(),createdAt:now(),status:'planned',provider:null,rules:[],filters:{},ratings:[],items,execution:'desktop',spec:{version:1,kind:'restore-source-from-pre-analysis',originJobId:originId,execution:'desktop'},estimate:{questions:items.length,aiRequestsMax:0,knownDownloadBytes:items.reduce((n,i)=>n+(i.before.files||[]).reduce((a,f)=>a+Number(f.size||0),0),0),tokenCost:0,uploadBytes:null},message:'원래 출처값과 현재 값을 비교한 뒤 정정합니다.'};
  await this.bank.storage.rpc('bank_maintenance_job',{s:this.bank.auth.config().spaceId,j:j.id,specification:j.spec});this.jobs.push(j);await this.sync(j);return j;
 }
 async run(j){try{for(const i of j.items){if(this.closed||j.pauseRequested)break;if(i.status==='complete'||i.status==='conflict')continue;try{
   await this.owner();const already=i.resultId&&(await this.bank.storage.rows('bank_revisions','id=eq.'+i.resultId))[0];if(already?.committed){i.status='complete';i.error=null;await this.sync(j);continue;}
   if(i.status!=='staged')await this.stage(j,i);if(this.closed||j.pauseRequested)break;await this.current(i);
   await this.bank.storage.rpc('bank_maintenance_stage',{j:j.id,b:i.baseId,r:i.resultId,expected:i.reviewVersion,report_value:{rules:i.rules,diff:i.diff,evidence:i.evidence,unresolved:i.unresolved,...(i.typeExpected?{typeExpected:i.typeExpected}:{})}});
   const w=this.worker(j,i);try{const upload=w.bank.state.jobs.find(x=>x.id===i.uploadId);upload.pauseRequested=false;await this.seedSourceFiles(i,w,upload);await w.bank.process(upload);if(!upload.committed)throw Error('필수 파일 검증·등록이 끝나지 않았습니다.');i.status='complete';i.error=null;i.completedAt=now();}finally{w.bank.close();}
  }catch(e){i.status=/충돌|수정|버전/.test(e.message)?'conflict':'failed';i.error=e.message;}await this.sync(j);}
  j.status=this.closed||j.pauseRequested?'paused':j.items.some(i=>i.status==='failed'||i.status==='conflict')?'failed':'complete';
  if(j.status==='complete')j.message='선택한 문항의 처리와 서버 등록을 완료했습니다.';
 }catch(e){j.status='failed';j.message=e.message;}finally{await this.sync(j);}}
 async pause(id){await this.owner();const j=this.job(id);j.pauseRequested=true;if(!this.active)j.status='paused';j.message='현재 문항의 안전한 처리 지점에서 멈춥니다. 업로드 중에는 현재 문항 완료 후 정지합니다.';await this.sync(j);return j;}
 async undo(id){await this.owner();if(this.active)throw Error('현재 작업을 중단한 뒤 되돌리세요.');const old=this.job(id),items=[];
  for(const prior of old.items.filter(i=>i.status==='complete')){const revisions=await this.bank.storage.rows('bank_revisions','id=eq.'+prior.resultId);const v=revisions[0];if(!v)continue;const i={...copy(prior),baseId:prior.resultId,reviewVersion:prior.reviewVersion,status:'pending'};await this.current(i);const catalog=(await this.bank.storage.rows('bank_catalog','revision_id=eq.'+prior.resultId))[0];items.push({questionId:prior.questionId,baseId:prior.resultId,commitId:catalog.commit_id,reviewVersion:v.review_version,before:catalog,rules:[],status:'pending',undoFrom:{jobId:id,questionId:prior.questionId,baseId:prior.baseId}});}
  if(!items.length)throw Error('되돌릴 완료 항목이 없습니다.');const j={id:uuid(),createdAt:now(),status:'planned',items,rules:[],ratings:[],spec:{version:1,undoOf:id,execution:'desktop'},estimate:{questions:items.length,aiRequestsMax:0},message:'후속 변경이 없는 문항만 이전 백업으로 복구하는 새 버전을 준비합니다.'};
  await this.bank.storage.rpc('bank_maintenance_job',{s:this.bank.auth.config().spaceId,j:j.id,specification:j.spec});this.jobs.push(j);this.save();
  for(const i of j.items){const w=this.worker(j,i);try{await T.backup(this.bank,path.join(w.directory,'backup'),{revisionIds:[i.baseId]});const archive=new T.ArchiveStorage(path.join(this.workDir(old,i),'backup'));for(const f of archive.archive.files)await archive.download(f.id,f);const temp=w.bank.storage;w.bank.storage=archive;w.bank.state.cache[i.undoFrom.baseId]={commitId:archive.archive.records[0].commitId};const project=(await w.bank.restore(i.undoFrom.baseId)).project;w.bank.storage=temp;const item=w.bank.state.items[i.questionId];item.baseRevisionId=i.baseId;item.latestRevisionId=i.baseId;item.metadata.processing||={protocol:1,rules:{}};item.metadata.processing.undo={jobId:j.id,undoOf:id,at:now()};item.overrides={...item.overrides,...item.metadata.source};w.bank.save();await w.bank.enqueue(project.id,[item.questionId]);const upload=w.bank.state.jobs.at(-1),out=path.join(w.bank.dir,'outbox',upload.id),commit=JSON.parse(await archive.download(archive.archive.records[0].commitId));for(const role of ['docx','preview']){const file=commit.files.find(f=>f.role===role);if(file)fs.writeFileSync(path.join(out,role==='docx'?'question.docx':'preview.png'),await archive.download(file.id,file));}upload.prepared=true;upload.previewStatus=commit.files.some(f=>f.role==='preview')?'complete':'unavailable';w.bank.save();Object.assign(i,{projectId:project.id,uploadId:upload.id,resultId:upload.revisionId,processed:true,status:'staged',diff:R.diff(i.before.metadata,item.metadata),evidence:[{basis:'SHA256 검증된 작업 전 백업'}],unresolved:[]});}catch(e){i.status='failed';i.error=e.message;}finally{w.bank.close();this.save();}}
  j.status='staged';await this.sync(j);return j;
 }
 async preview(id,questionId,before=false){await this.owner();const j=this.job(id),i=j.items.find(i=>i.questionId===questionId);if(!i?.uploadId)throw Error('먼저 샘플을 처리하세요.');if(before){const archive=new T.ArchiveStorage(path.join(this.workDir(j,i),'backup'));const record=archive.archive.records[0];const commit=JSON.parse(await archive.download(record.commitId));const f=commit.files.find(f=>f.role==='preview');return f?'data:image/png;base64,'+(await archive.download(f.id,f)).toString('base64'):null;}const file=path.join(this.workDir(j,i),'question-bank','outbox',i.uploadId,'preview.png');if(!fs.existsSync(file))return null;return'data:image/png;base64,'+fs.readFileSync(file).toString('base64');}
 close(){this.closed=true;for(const j of this.jobs)if(['running','sampling'].includes(j.status)){j.pauseRequested=true;j.status='paused';}this.save();}
}
module.exports={BankMaintenance};
