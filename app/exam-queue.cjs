'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {atomicWrite}=require('./store.cjs');
const {inferSourceInfo}=require('./bank-source-info.cjs');
const Inventory=require('./source-inventory.cjs');
const {AsyncLocalStorage}=require('node:async_hooks');
const {Gate,validLimit,DEFAULT_AI_CONCURRENCY}=require('./ai-concurrency.cjs');
const clone=x=>structuredClone(x),now=()=>new Date().toISOString();
const hash=x=>crypto.createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x??null)).digest('hex');
const fileHash=f=>hash(fs.readFileSync(f));
function examKey(m){const values=Inventory.fields.map(k=>String(m[k]||'').normalize('NFKC').replace(/\s/g,''));return values.every(Boolean)?JSON.stringify(values):null;}
function failure(error){
 const message=String(error.message||error),code=error.code||'',status=error.status;
 if(/\uC6D0\uBB38\s*\uD310\uB3C5.*\uD655\uC778/.test(message))return 'held';
 if(/ENOSPC|EACCES|EPERM|quota|auth/.test(code+' '+message)||[401,403].includes(status)||/로그인|인증|quota|한도|상한|공간 부족|unauthorized/i.test(message))return 'pause';
 if(status===429||/rate.?limit|속도 제한/i.test(message))return 'rate';
 if([500,502,503,504].includes(status)||/공통장애|service.unavailable/i.test(message))return 'pause';
 if(/ECONN|ETIMEDOUT|response_unknown|network|offline|fetch failed|응답.*유실|연결.*끊/i.test(code+' '+message))return 'unknown';
 if(/보류|확인 필요|미확정|보호|미완료|산출물|누락|불명확|애매/.test(message))return 'held';
 return 'failed';
}
function validCount(value,zero=false){return Number.isInteger(value)&&value>=(zero?0:1)&&value<=2000;}
function completionBasis(item,project){return hash({sourceHash:item.hash,pages:item.pages,source:Inventory.fields.map(k=>item.metadata[k]),numbering:item.metadata.numbering,problems:(project?.problems||[]).map(p=>({id:p.id,number:p.recognition?.originalNumber||p.recognition?.sourceQuestionNumber,section:p.recognition?.sourceNumbering?.section||'unknown',regions:p.regions,crops:p.cropPaths,detectionKeys:p.queueDetectionKeys}))});}
function completionNumbering(item,project){const confirmation=item.completionConfirmation;return confirmation?.basis===completionBasis(item,project)?confirmation.numbering:item.metadata.numbering||{};}
function discoveryIssueView(item,project,inventory){
 const active=[...(item.discoveryIssues||[])],resolved=[];
 if(!active.includes('result is not defined'))return {active,resolved};
 const problems=project?.problems||[],numbering=item.metadata?.numbering;
 if(!Number.isInteger(item.pages)||item.pages<1||item.pages>500||!numbering?.confirmed||!validCount(numbering.total)||problems.length!==numbering.total)return {active,resolved};
 inventory=inventory||Inventory.inventory(problems.map(p=>({questionId:p.original?.id||p.id,source:{originalNumber:p.recognition?.originalNumber||p.recognition?.sourceQuestionNumber,numbering:p.recognition?.sourceNumbering||{section:'unknown'}}})),numbering);
 if(!inventory.complete||problems.some(p=>p.queueRegionIssue))return {active,resolved};
 for(let page=1;page<=item.pages;page++){
  const step=item.steps['page:'+page];
  if(step?.kind!=='regions'||step.status!=='complete'||!Array.isArray(step.result?.regions))return {active,resolved};
  for(let index=0;index<step.result.regions.length;index++)if(!problems.some(p=>p.queueDetectionKeys?.includes(item.id+':'+page+':'+index)&&p.regions?.some(r=>r.page===page)))return {active,resolved};
 }
 for(const p of problems){if(!p.cropPaths?.length)return {active,resolved};for(const file of p.cropPaths){try{const stat=fs.statSync(file);if(!stat.isFile()||!stat.size)return {active,resolved};}catch{return {active,resolved};}}}
 resolved.push({issue:'result is not defined',reason:'전체 페이지의 영역 결과·문항 연결·캡처 파일 및 확인 총수 검증 완료. 과거 오류 기록으로 분리했습니다.',pages:item.pages,questions:problems.length});
 return {active:active.filter(x=>x!=='result is not defined'),resolved};
}
function summary(item,project){
 const problems=project?.problems||[],records=Object.values(item.steps),numbering=completionNumbering(item,project),total=numbering.confirmed?numbering.total:null;
 const inventory=Inventory.inventory(problems.map(p=>({questionId:p.original?.id||p.id,source:{originalNumber:p.recognition?.originalNumber||p.recognition?.sourceQuestionNumber,numbering:p.recognition?.sourceNumbering||{section:'unknown'}}})),numbering);
 inventory.expectedTotal=total;
 const discovery=discoveryIssueView(item,project,inventory);
 const at=(p,s)=>item.steps[p.id+':'+s];
 const complete=problems.filter(p=>['recognition','solve','analysis'].every(s=>at(p,s)?.status==='complete')).length;
 const uploaded=problems.filter(p=>at(p,'upload')?.status==='complete').length;
 const failed=records.filter(s=>s.status==='failed').length,unknown=records.filter(s=>s.status==='unknown').length,held=records.filter(s=>s.status==='held').length;
 const confirmedTotal=total!==null&&total===problems.length;
 const countStatus=status=>problems.filter(p=>['recognition','solve','analysis','upload'].some(kind=>at(p,kind)?.status===status)).length;
 const activeEntry=Object.entries(item.steps).find(([,s])=>s.status==='running'),activeProblem=activeEntry&&problems.find(p=>activeEntry[0].startsWith(p.id+':'));
 return {failedQuestions:countStatus('failed'),heldQuestions:countStatus('held'),unknownQuestions:countStatus('unknown'),activeProblem:activeProblem?.recognition?.originalNumber||activeProblem?.label||null,discovered:problems.length,confirmedTotal:total,complete,uploaded,reviewed:problems.filter(p=>p.original?.approval?.status==='approved'&&p.original.approval.method!=='batch_user_authorized').length,failed,unknown,held,inventory,discovery,whole:confirmedTotal&&complete===total&&uploaded===total&&!failed&&!held&&!unknown&&!inventory.duplicates.length&&!inventory.unknown.length&&!inventory.missing.length&&!inventory.unexpected.length&&!discovery.active.length,
  countLabel:total===null?'총수 미확정 · 발견 '+problems.length:'확인 총수 '+total+' · 발견 '+problems.length};
}
class ExamQueue{
 constructor({directory,store,onEvent=()=>{},io=fs,moveFile=require('./windows-move.cjs').moveNoReplace}){
  Object.assign(this,{directory,store,onEvent,io,moveFile});this.file=path.join(directory,'exam-queue.json');this.context=new AsyncLocalStorage();this.activeStages=new Map();this.reservations=new Map();this.stageCalls=new Map();this.aiGate=new Gate();this.admission=new Gate();
  try{this.state=JSON.parse(fs.readFileSync(this.file,'utf8'));if(this.state.version!==1||!Array.isArray(this.state.items))throw Error('대기열 형식 오류');}catch(e){if(e.code!=='ENOENT')throw Error('대기열을 읽지 못했습니다. 기존 파일을 보존했습니다: '+e.message);this.state={version:1,mode:'idle',items:[],limits:{maxCalls:250,maxQuestions:300,maxTokens:2000000,maxRetries:2},usage:{calls:0,tokens:0,tokenReports:0},generation:0};}
  // Retired usage gates never hold new requests. Preserve usage counters and
  // unknown responses; only pre-dispatch usage confirmations become retryable.
  for(const key of ['remainingPercent','accountUsedPercent','usageEnabled','maxCalls','maxTokens'])delete this.state.limits[key];
  for(const item of this.state.items)for(const step of Object.values(item.steps||{}))if(step.usageConfirmationScope){
   if(step.status==='held'&&!step.responses?.some(r=>['running','unknown'].includes(r.status))){step.status='pending';step.retryAuthorized=true;}
   delete step.usageConfirmationScope;
  }
  delete this.state.usageConfirmation;delete this.state.usageApprovals;delete this.state.usageObservation;
  this.state.limits.aiConcurrency=validLimit(this.state.limits.aiConcurrency)?this.state.limits.aiConcurrency:DEFAULT_AI_CONCURRENCY;this.aiGate.setLimit(this.state.limits.aiConcurrency);
  if(this.state.mode==='running')this.state.mode='paused';
  for(const item of this.state.items){if(item.status==='running')item.status='pending';for(const step of Object.values(item.steps))if(step.status==='running'){step.status='unknown';step.unknownKind=step.kind==='upload'?'upload':'ai';step.reason='강제 종료: 결과 조회 또는 응답 기록 확인 필요';}}
  this.store.externalSource=(queueId,projectId)=>this.state.items.find(i=>i.id===queueId&&i.projectId===projectId)?.currentPath;
  this.store.ownsExternal=file=>this.state.items.some(i=>i.projectId&&path.resolve(i.currentPath)===path.resolve(file));
  // Reconcile a previously authorized move before the renderer reopens its source.
  for(const item of this.state.items)if(['moving','unknown'].includes(item.move?.status)&&item.projectId){try{this.context.run({item},()=>this.move(item.id));}catch(error){item.move.status='failed';item.move.reason=String(error.message);}}
  this.save();
 }
 get active(){return this.context.getStore()||this.activeStages.values().next().value||this.reservations.values().next().value||null;}
 set active(value){if(value)this.activeStages.set('legacy',value);else this.activeStages.delete('legacy');}
 hasActive(id,key){return [...this.activeStages.values(),...this.reservations.values()].some(a=>a.item?.id===id&&(!key||a.key===key));}
 save(){atomicWrite(this.file,this.state);this.onEvent({type:'exam-queue',snapshot:this.status()});}
 isRemoved(id){return !!this.state.items.find(i=>i.id===id)?.removedAt;}
 item(id){const item=this.state.items.find(i=>i.id===id);if(!item||(item.removedAt&&this.context.getStore()?.item!==item))throw Error('대기열 시험지를 찾을 수 없습니다. 이미 제거되었을 수 있습니다.');return item;}
 canRemovePending(item){
  // Removal unregisters the item; it never deletes its source or processing journal.
  return !!item&&!item.hidden&&!item.removedAt;
 }
 assertRemovablePending(id){const item=this.item(id);if(!this.canRemovePending(item))throw Error('이미 대기열에서 제거된 시험지입니다.');return item;}
 removePending(id){
  if(this.isRemoved(id))return this.status();
  const item=this.assertRemovablePending(id),before={hidden:item.hidden,removedAt:item.removedAt,status:item.status};
  item.hidden=true;item.removedAt=now();item.status='cancelled';
  // Publish only after the durable write succeeds; a write failure leaves the UI and state intact.
  try{atomicWrite(this.file,this.state);}catch(error){for(const [key,value]of Object.entries(before)){if(value===undefined)delete item[key];else item[key]=value;}throw error;}
  this.onEvent({type:'exam-queue',snapshot:this.status()});return this.status();
 }
 observe(project,previous){
  if(!project.queueSource||!previous)return;const item=this.state.items.find(i=>i.id===project.queueSource.queueId);if(!item||item.removedAt)return;let changed=false;
  const invalidate=(p,stages)=>{for(const stage of stages){const key=p.id+':'+stage,s=item.steps[key];if(s&&!this.hasActive(item.id,key)){s.status='pending';s.reason='입력·범위·문항 변경: 후속 단계 재확인';changed=true;}}};
  const scopeChanged=hash(project.scope)!==hash(previous.scope);if(scopeChanged){item.scope=project.scope?clone(project.scope):null;item.scopeConfirmed=!!project.scope;changed=true;}
  for(const p of project.problems){const old=previous.problems.find(x=>x.id===p.id);if(!old)continue;
   if(hash({regions:p.regions,crops:p.cropPaths})!==hash({regions:old.regions,crops:old.cropPaths}))invalidate(p,['recognition','solve','analysis','upload']);
   else if(scopeChanged||hash({body:p.original?.body,choices:p.original?.choices,diagram:p.original?.diagram,observed:p.recognition?.observedDiagram,source:p.recognition?.body,version:p.recognition?.version})!==hash({body:old.original?.body,choices:old.original?.choices,diagram:old.original?.diagram,observed:old.recognition?.observedDiagram,source:old.recognition?.body,version:old.recognition?.version}))invalidate(p,['solve','analysis','upload']);
   else if(hash({answer:p.original?.answer,solution:p.original?.solution})!==hash({answer:old.original?.answer,solution:old.original?.solution}))invalidate(p,['analysis','upload']);
  }
  if(changed){item.hidden=false;if(!this.active&&item.status!=='cancelled')item.status='pending';this.save();}
 }
 status(){return {...clone(this.state),activeStages:[...new Map([...this.reservations,...this.activeStages]).values()].map(a=>({itemId:a.item?.id,key:a.key})),aiRequests:{active:this.aiGate.active,waiting:this.aiGate.waiters.length,limit:this.aiGate.limit},items:this.state.items.filter(i=>!i.hidden).map(i=>{let p;try{if(i.linkedTo&&this.state.items.find(x=>x.id===i.linkedTo)?.projectId)i.projectId=this.state.items.find(x=>x.id===i.linkedTo).projectId;if(i.projectId)p=this.store.get(i.projectId);}catch{}const s=summary(i,p);return {...clone(i),canRemovePending:this.canRemovePending(i),discoveryIssues:s.discovery.active,resolvedDiscoveryIssues:[...(i.resolvedDiscoveryIssues||[]),...s.discovery.resolved],summary:s};})};}
 add(files){this.store.validateSources(files);const added=[];for(const file of files){const digest=fileHash(file),existing=this.state.items.find(i=>i.hash===digest);if(existing){if(existing.removedAt&&this.hasActive(existing.id))throw Error('제거한 시험지의 진행 중 결과를 저장하고 있습니다. 완료 후 다시 추가하세요.');existing.hidden=false;if(existing.removedAt)existing.status='held';delete existing.removedAt;added.push({id:existing.id,reused:true});continue;}
  const metadata={...inferSourceInfo(path.basename(file)),numbering:{total:null,objectiveCount:null,writtenCount:null,confirmed:false}},identity=examKey(metadata),candidate=identity&&this.state.items.find(i=>!i.removedAt&&examKey(i.metadata)===identity&&i.status!=='cancelled');
  const item={id:crypto.randomUUID(),hash:digest,originalPath:path.resolve(file),currentPath:path.resolve(file),name:path.basename(file),metadata,scope:null,scopeConfirmed:false,status:candidate?'held':'pending',duplicateCandidate:candidate?.id||null,duplicateDecision:null,projectId:null,steps:{},discoveryIssues:[],move:{status:'pending'},createdAt:now()};this.state.items.push(item);added.push({id:item.id,reused:false});}
  this.save();return {added,snapshot:this.status()};
 }
 edit(id,patch){if(this.hasActive(id))throw Error('현재 단계가 끝난 뒤 정보를 수정하세요.');const item=this.item(id),before=hash({metadata:item.metadata,scope:item.scope,scopeConfirmed:item.scopeConfirmed});
  if(patch.metadata){const oldMetadata=hash(item.metadata),m={...item.metadata,...patch.metadata};for(const key of Inventory.fields)m[key]=String(m[key]||'').slice(0,120).trim()||null;
   if(m.numbering){const n=m.numbering;for(const key of ['total','objectiveCount','writtenCount'])if(n[key]!=null&&!validCount(n[key],key==='writtenCount'))throw Error('총문항 수는 1~2000 정수, 서술형은 0도 가능합니다.');if(n.total!=null&&n.objectiveCount!=null&&n.writtenCount!=null&&n.total!==n.objectiveCount+n.writtenCount)throw Error('총수와 객관식·서술형 수가 다릅니다.');if(n.confirmed&&n.total==null)throw Error('확인 총수를 입력하세요.');}item.metadata=m;
   const identity=examKey(m),candidate=identity&&this.state.items.find(i=>!i.removedAt&&i.id!==item.id&&examKey(i.metadata)===identity&&i.status!=='cancelled');
   if(!item.linkedTo&&!item.duplicateDecision){item.duplicateCandidate=candidate?.id||null;if(candidate){item.status='held';item.reason='같은 시험 정체성의 다른 스캔인지 시작 전에 확인하세요.';}}
   for(const [key,s]of Object.entries(item.steps))if(key.endsWith(':upload')&&(s.status!=='complete'||oldMetadata!==hash(m)))s.status='pending';
  }
  if(Object.hasOwn(patch,'scope')){const oldScope=hash({scope:item.scope,confirmed:item.scopeConfirmed});item.scope=patch.scope?require('./rules.cjs').validateScope(patch.scope):null;item.scopeConfirmed=!!patch.scopeConfirmed&&!!item.scope;if(oldScope!==hash({scope:item.scope,confirmed:item.scopeConfirmed}))for(const [key,s]of Object.entries(item.steps))if(/:(solve|analysis|upload)$/.test(key)){s.status='pending';s.reason='시험범위 변경: 후속 단계 재확인';}}
  if(patch.duplicateDecision){if(!['separate','same'].includes(patch.duplicateDecision))throw Error('중복 확인을 선택하세요.');item.duplicateDecision=patch.duplicateDecision;
   if(patch.duplicateDecision==='same'){const target=this.item(item.duplicateCandidate);item.projectId=target.projectId;item.linkedTo=target.id;item.status='held';item.reason='같은 시험의 다른 스캔: 기존 문항을 열어 필요한 영역만 재지정하세요.';}else item.status='pending';}
  if(!item.linkedTo&&(!item.duplicateCandidate||item.duplicateDecision)&&before!==hash({metadata:item.metadata,scope:item.scope,scopeConfirmed:item.scopeConfirmed}))item.status='pending';this.save();return this.status();
 }
 action(action,id,value){
  if(action==='removePending'||action==='remove')return this.removePending(id);
  const item=id?this.item(id):null;
  if(action==='start'||action==='resume'){if(this.active)throw Error('현재 단계 종료를 기다려 주세요.');if(this.state.retryAt>Date.now())throw Error('속도 제한 안내 시간까지 대기하세요.');this.state.retryAt=null;this.state.mode='running';this.state.reason=null;this.state.generation++;for(const i of this.state.items)if(i.status==='running')i.status='pending';}
  else if(action==='pause'){this.state.mode='paused';this.state.reason='일시정지: 실행 중인 단계의 결과를 저장한 뒤 멈춥니다.';}
  else if(action==='cancel'){if(item)item.status='cancelled';else{this.state.mode='cancelled';for(const i of this.state.items)if(!['complete','cancelled'].includes(i.status))i.status='cancelled';}}
  else if(action==='order'){if(this.active)throw Error('일시정지 후 순서를 바꾸세요.');const index=this.state.items.indexOf(item),next=Math.max(0,Math.min(this.state.items.length-1,index+value));this.state.items.splice(index,1);this.state.items.splice(next,0,item);}
  else if(action==='retry'){if(this.active)throw Error('현재 단계 종료를 기다려 주세요.');item.status='pending';item.discoveryIssues=[];for(const s of Object.values(item.steps))if(['failed','held','unknown'].includes(s.status)){s.status='pending';s.retryAuthorized=true;}item.move.status=item.move.status==='failed'?'pending':item.move.status;}
  else if(action==='limits'){
   if(this.active||this.aiGate.active||this.aiGate.waiters.length)throw Error('일시정지 후 상한을 바꾸세요.');
   const limits={...this.state.limits};
   if(Object.hasOwn(value,'aiConcurrency')){if(!validLimit(value.aiConcurrency))throw Error('동시 처리 수는 1 이상의 정수로 입력하세요.');limits.aiConcurrency=value.aiConcurrency;}
   for(const [k,max]of [['maxQuestions',2000],['maxRetries',2]])if(value[k]!=null){if(!Number.isInteger(value[k])||value[k]<(k==='maxRetries'?0:1)||value[k]>max)throw Error('실행 상한을 확인하세요.');limits[k]=value[k];}
   this.aiGate.setLimit(limits.aiConcurrency);this.state.limits=limits;
  }
  else if(action==='confirmTotal'){
   if(this.active||!['paused','idle'].includes(this.state.mode))throw Error('처리가 멈춘 뒤 총수를 확인하세요.');
   if(!item?.projectId||item.status==='cancelled')throw Error('처리한 시험지를 확인하세요.');
   const {total,objectiveCount,writtenCount}=value||{};
   if(!validCount(total)||!validCount(objectiveCount)||!validCount(writtenCount,true)||total!==objectiveCount+writtenCount)throw Error('총수와 객관식·서답형 수를 확인하세요.');
   const project=this.store.get(item.projectId),problems=project.problems||[];
   if(fileHash(item.currentPath)!==item.hash)throw Error('원본 파일이 바뀌어 총수를 확인할 수 없습니다.');
   if(!Number.isInteger(item.pages)||item.pages<1||item.pages>500)throw Error('전체 페이지 탐색을 먼저 완료하세요.');
   for(let page=1;page<=item.pages;page++){
    const step=item.steps['page:'+page];if(step?.kind!=='regions'||step.status!=='complete'||!Array.isArray(step.result?.regions))throw Error('전체 페이지 탐색을 먼저 완료하세요.');
    for(let index=0;index<step.result.regions.length;index++){const key=item.id+':'+page+':'+index;if(problems.filter(p=>p.queueDetectionKeys?.includes(key)&&p.regions?.some(r=>r.page===page)).length!==1)throw Error('탐색 영역과 문항 연결을 확인하세요.');}
   }
   for(const p of problems){if(!p.cropPaths?.length||p.cropPaths.some(file=>!fs.statSync(file).isFile()||!fs.statSync(file).size))throw Error('문항 원본 캡처를 확인하세요.');}
   const numbering={total,objectiveCount,writtenCount,confirmed:true};
   const inventory=Inventory.inventory(problems.map(p=>({questionId:p.original?.id||p.id,source:{originalNumber:p.recognition?.originalNumber||p.recognition?.sourceQuestionNumber,numbering:p.recognition?.sourceNumbering||{section:'unknown'}}})),numbering);
   if(problems.length!==total||!inventory.complete)throw Error('총수·문항 번호의 누락, 중복 또는 불명확한 항목을 확인하세요.');
   item.completionConfirmation={numbering,basis:completionBasis(item,project),confirmedAt:now(),method:'explicit_user_count_confirmation',evidence:'사용자가 원본 총수와 객관식·서답형 수를 확인했습니다. 저장된 문항 번호 및 전체 페이지 탐색 기록과 대조했습니다.'};
  }
  else throw Error('대기열 명령을 확인하세요.');this.save();return this.status();
 }
 next(){if(this.state.mode!=='running')return null;const item=this.state.items.find(i=>!i.hidden&&['pending','running'].includes(i.status)&&!i.linkedTo&&(!i.duplicateCandidate||i.duplicateDecision));if(!item){this.state.mode='idle';this.save();return null;}item.processingStartedAt ||= now();item.status='running';this.save();return clone(item);}
 ensureProject(id){const item=this.item(id);if(fileHash(item.currentPath)!==item.hash)throw Error('선택 이후 원본 내용이 바뀌었습니다. 해당 시험지를 보류합니다.');if(item.projectId)return this.store.get(item.projectId);const project=this.store.createExternal(item.currentPath,item.id);item.projectId=project.id;this.save();return project;}
 stage(id,key,kind,basis,execute,verify){
  if(this.isRemoved(id))return Promise.resolve({stopped:true});
  const token=id+':'+key,existing=this.stageCalls.get(token),fingerprint=hash(basis);
  if(existing){if(existing.fingerprint!==fingerprint)return Promise.reject(Error('진행 중 단계의 입력이 바뀌었습니다.'));return existing.promise;}
  const problem=key.split(':')[0];if([...this.activeStages.values()].some(a=>a.item?.id===id&&a.key.split(':')[0]===problem))return Promise.reject(Error('같은 문항의 이전 단계가 끝난 뒤 실행하세요.'));
  if(this.state.mode!=='running'||this.item(id).status==='cancelled')return Promise.resolve({stopped:true});
  const active={item:this.item(id),key,responseIndex:0};this.activeStages.set(token,active);
  const promise=this.context.run(active,()=>this._stage(id,key,kind,basis,execute,verify)).finally(()=>{this.activeStages.delete(token);this.stageCalls.delete(token);this.save();});
  this.stageCalls.set(token,{fingerprint,promise});return promise;
 }
 async _stage(id,key,kind,basis,execute,verify){
  const item=this.item(id);if(this.state.mode!=='running'||item.status==='cancelled')return {stopped:true};
  let step=item.steps[key];const fingerprint=hash(basis);
  try {
   if(step?.fingerprint===fingerprint&&step.status==='complete'&&await verify(step.result))return {result:clone(step.result),reused:true};
   if(step?.fingerprint===fingerprint&&step.status==='unknown'&&!step.retryAuthorized){if(await verify(step.result)){step.status='complete';this.save();return {result:clone(step.result),reused:true};}if(!step.responses?.some(r=>r.status==='complete'))return {held:true,reason:step.reason};}
  }catch(error){
   // A lookup failure cannot authorize a duplicate upload or AI call.
   const type=failure(error);step.status='unknown';step.unknownKind=kind==='upload'?'upload':'artifact';step.reason='저장 결과 조회 실패: '+String(error.message).slice(0,1900);
   if(['pause','rate'].includes(type)){this.state.mode='paused';this.state.reason=step.reason;if(type==='rate')this.state.retryAt=Date.now()+Math.max(1000,Number(error.retryAfterMs)||Number(error.retryAfter)*1000||60000);}
   this.save();return {held:true,status:step.status,reason:step.reason};
  }
  if(this.state.mode!=='running'||item.status==='cancelled')return {stopped:true};
  if(step?.fingerprint===fingerprint&&['failed','held'].includes(step.status)&&!step.retryAuthorized)return {held:true,reason:step.reason};
  if(!step||step.fingerprint!==fingerprint)step=item.steps[key]={kind,fingerprint,status:'pending',attempts:0,responses:[]};
   const allowUnknownRetry=!!step.retryAuthorized;step.status='running';step.retryAuthorized=false;step.startedAt=now();step.attempts++;Object.assign(this.context.getStore(),{item,step,key,responseIndex:0,allowUnknownRetry});this.save();
  try{step.result=await execute(step);if(!await verify(step.result))throw Error('산출물 확인 필요: '+key);step.status='complete';step.finishedAt=now();step.reason=null;this.save();return {result:clone(step.result)};}
  catch(error){if(error.dispatched===false&&error.queueStopped){step.status='pending';step.reason=error.message;this.save();return {stopped:true};}const type=failure(error);step.reason=String(error.message).slice(0,2000);step.status=type==='unknown'?'unknown':type==='failed'?'failed':'held';step.unknownKind=kind==='upload'?'upload':'ai';
   if(['pause','rate'].includes(type)){this.state.mode='paused';this.state.reason=step.reason;if(type==='rate')this.state.retryAt=Date.now()+Math.max(1000,Number(error.retryAfterMs)||Number(error.retryAfter)*1000||60000);}
   this.save();return {held:true,reason:step.reason,status:step.status};
  }finally{/* stage() releases its own context after verification/persistence */}
 }
 bridge(bridge,{provider='codex'}={}){const queue=this;return new Proxy(bridge,{get(target,key){if(key!=='run'){const v=Reflect.get(target,key,target);return typeof v==='function'?v.bind(target):v;}return async request=>{
   const active=queue.context.getStore();if(!active)return queue.aiGate.run(()=>target.run(request));const {step}=active,index=active.responseIndex++,fingerprint=hash({images:(request.images||[]).map(fileHash),text:request.text,model:request.model,effort:request.effort,execution:request.execution});let response=step.responses[index];
   if(response?.fingerprint===fingerprint&&response.status==='complete')return clone(response.value);
   if(response&&['running','unknown'].includes(response.status)&&!active.allowUnknownRetry)throw Error('AI 결과불명: 중복 비용 가능성이 있어 개별 재시도 확인이 필요합니다.');
   return queue.aiGate.run(async()=>{
   const assertRunning=()=>{if(queue.state.mode!=='running'||active.item.status==='cancelled')throw Object.assign(Error('일시정지: 새 AI 요청을 시작하지 않았습니다.'),{code:'quota',dispatched:false,queueStopped:true});};
   await queue.admission.run(async()=>{assertRunning();
   response=step.responses[index]={fingerprint,requestId:crypto.randomUUID(),problemId:request.context?.id,kind:step.kind,status:'running',startedAt:now()};queue.state.usage.calls++;queue.save();});
   try{let value;for(let attempt=0;;attempt++){try{value=await target.run(request);break;}catch(error){if(error.dispatched!==false||failure(error)!=='unknown'||attempt>=queue.state.limits.maxRetries)throw error;if(queue.state.mode!=='running')throw error;await new Promise(resolve=>setTimeout(resolve,Math.max(1,Number(error.retryAfterMs)||500*2**attempt)));await queue.admission.run(async()=>{assertRunning();response.preDispatchRetries=(response.preDispatchRetries||0)+1;queue.state.usage.calls++;queue.save();});}}response.value=clone(value);response.status='complete';response.finishedAt=now();response.durationMs=Date.parse(response.finishedAt)-Date.parse(response.startedAt);const tokens=value.tokens,total=typeof tokens==='number'?tokens:Number(tokens?.totalTokens??tokens?.total_tokens??(tokens?.inputTokens!=null?tokens.inputTokens+(tokens.outputTokens||0):NaN));if(Number.isFinite(total)){queue.state.usage.tokens+=total;queue.state.usage.tokenReports++;}queue.save();
    return value;}
   catch(e){response.status=failure(e)==='unknown'?'unknown':'failed';response.reason=String(e.message);if(e.code==='response_unknown'){queue.state.mode='paused';queue.state.reason='AI 실행 종료를 확인하지 못했습니다. 새 요청을 멈추고 결과를 확인하세요.';}queue.save();throw e;}
   });
  };}});}
 finish(id){if(this.hasActive(id))throw Error('진행 중 단계가 끝난 뒤 완료 처리하세요.');const item=this.item(id),s=summary(item,this.store.get(item.projectId));if(item.status==='cancelled')return this.status();item.status=s.failed||s.held||s.unknown||s.discovery.active.length?'held':s.complete===s.discovered&&s.uploaded===s.discovered&&s.discovered?'complete':'held';item.reason=item.status==='held'?'실패·보류·누락·확인 필요 항목을 열어 확인하세요.':null;
  // A scan with unconfirmed totals can be processed/uploaded, but cannot prove whole-exam success.
  if(item.status==='complete'&&!s.whole){item.move.status='held';item.move.reason='전체 문항 수·누락·중복 번호 확인 필요';}this.save();return this.status();}
 move(id){
  if(this.hasActive(id))throw Error('진행 중 단계가 끝난 뒤 이동하세요.');
  const item=this.item(id),s=summary(item,this.store.get(item.projectId));
  const eligible=item.status!=='cancelled'&&s.whole;
  if(!eligible&&!(item.move.target&&['moving','unknown'].includes(item.move.status)))throw Error('전체 문항 처리·업로드 성공과 원본 총수 확인이 필요합니다.');
  const source=item.originalPath,io=this.io,sourceStat=file=>{try{return io.statSync(file,{bigint:true});}catch(error){if(error.code==='ENOENT')return null;throw error;}};
  const identity=stat=>({dev:String(stat.dev),ino:String(stat.ino),size:String(stat.size)});
  const finish=target=>{
   item.currentPath=target;item.move.status='complete';item.move.reason=null;item.move.finishedAt=now();
   try{this.store.relocateExternal(item.projectId,item.id,target);}catch(error){this.store.cache?.delete(item.projectId);item.move.status='unknown';item.move.reason='원본 이동 확인 · 작업 경로 저장 재확인: '+error.message;}
   this.save();return this.status();
  };
  let target=item.move.target;
  try{
   if(item.move.status==='complete'){if(fileHash(item.currentPath)!==item.hash)throw Error('이동된 원본을 확인하세요.');return finish(item.currentPath);}
   const parent=path.dirname(source),folder=path.join(parent,'완료된 시험지');
   if(io.lstatSync(parent).isSymbolicLink())throw Error('원본 부모 폴더 연결을 확인하세요.');
   if(!io.existsSync(folder)){if(!eligible)throw Error('이동 결과 경로 확인 필요');io.mkdirSync(folder);}
   if(io.lstatSync(folder).isSymbolicLink()||path.dirname(io.realpathSync(folder))!==io.realpathSync(parent))throw Error('완료 폴더는 실제 원본 부모 안에 있어야 합니다.');
   if(target&&path.dirname(path.resolve(target))!==path.resolve(folder))throw Error('이동 기록의 대상 폴더를 확인하세요.');
   let src=sourceStat(source),dst=target&&sourceStat(target);
   if(!src&&dst){if(!dst.isFile()||fileHash(target)!==item.hash)throw Error('이동 결과 내용이 달라 원본 위치 확인 필요');return finish(target);}
   if(!src)throw Object.assign(Error('원본과 이동 결과를 찾지 못했습니다. 장치 연결과 파일 위치를 확인하세요.'),{moveResultUnknown:!!target});
   if(!src.isFile()||fileHash(source)!==item.hash||io.lstatSync(source).isSymbolicLink())throw Error('원본 내용 또는 연결 경로가 바뀌었습니다. 이동을 보류합니다.');
   // Only reconcile an old link/unlink journal with a nonzero, matching file identity.
   // New operations never create a hard link, copy, or delete an existing destination.
   if(dst&&!item.move.method){const a=identity(src),b=identity(dst);if(a.ino!=='0'&&a.ino===b.ino&&a.dev===b.dev&&dst.isFile()&&fileHash(target)===item.hash){io.unlinkSync(source);return finish(target);}}
   if(!eligible)throw Error('미완료 또는 취소 작업의 새 원본 이동은 보류합니다.');
   if(dst&&item.move.status==='unknown'&&item.move.sourceIdentity){const actual=identity(src),saved=item.move.sourceIdentity;if(actual.ino==='0'||actual.ino!==saved.ino||actual.dev!==saved.dev)throw Object.assign(Error('양쪽 경로가 존재하고 원본 정체성이 달라 이동 결과 확인 필요'),{moveResultUnknown:true});}
   const choose=()=>{const parsed=path.parse(source);let candidate=path.join(folder,parsed.base);for(let n=2;sourceStat(candidate);n++){if(n>10000)throw Error('동일 이름 파일이 너무 많아 이동을 보류합니다.');candidate=path.join(folder,parsed.name+' ('+n+')'+parsed.ext);}return candidate;};
   if(!target||dst)target=choose();
   for(let attempt=0;attempt<8;attempt++){
    item.move={status:'moving',method:'win32-noreplace',target,sourceIdentity:identity(src),expectedHash:item.hash,dispatchedAt:now(),attempts:(item.move.attempts||0)+1};
    this.save(); // The intent is durable before calling the OS.
    try{this.moveFile(source,target,{expectedHash:item.hash});}
    catch(error){if(error.code==='EEXIST'){target=choose();continue;}throw error;}
    if(sourceStat(source)||!sourceStat(target)||fileHash(target)!==item.hash)throw Object.assign(Error('이동 후 경로·내용 확인 필요'),{moveResultUnknown:true});
    return finish(target);
   }
   throw Error('파일명 충돌 재시도 상한에 도달했습니다. 이동을 보류합니다.');
  }catch(error){
   // A missing acknowledgement is reconciled from files before any further OS operation.
   try{if(target&&!sourceStat(source)&&sourceStat(target)?.isFile()&&fileHash(target)===item.hash)return finish(target);}
   catch(queryError){error=Object.assign(Error(error.message+' · 결과 조회 실패: '+queryError.message),{moveResultUnknown:!!item.move.dispatchedAt});}
   item.move.status=error.moveResultUnknown?'unknown':'failed';item.move.reason=String(error.message);this.save();return this.status();
  }
 }
}
module.exports={ExamQueue,summary,hash,fileHash,examKey,failure,discoveryIssueView};
