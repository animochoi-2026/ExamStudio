import {installPaperForms} from './desktop-paper-form-ui.js';
import {installExamQueueUI} from './exam-queue-ui.js';
import {installUpdateUI} from './update-ui.js';
import {installBankUI} from './bank-ui.js';
import {installRegionEditor} from './region-editor-ui.js';
import {installMaintenanceUI} from './maintenance-ui.js';
import { installWorkflowUI } from './workflow-ui.js';
import { installBatchUI } from './batch-ui.js';
import { installDialogInput } from './dialog-input.js';
import { preferGeminiReason, selectGeminiModel, boundedAccountCheck, codexUsageWindows } from './provider-selection.js';
import './equal-angle-groups.js';
import './diagram-layout.js';
import './review-issues.js';
import './solution-display.js';
import './solution-guide.js';
import './solution-guide-render.js';
import './question-presentation.js';
import './structured-layout.js';
import {showSourceFigurePicker} from './source-figure-ui.js';
import {questionFlow} from './figure-layout-ui.js';
import './diagnostics.js';
const {issueKey,uniqueIssues,logKey,sourceReady}=globalThis.ExamReviewIssues;
import {loadPdfDocument,createPdfRender} from './pdf-rendering.js';
const $ = (id) => document.getElementById(id);
const api = window.exam;
installDialogInput($('mainDialog'),api);
const state = { errors: [], project: null, recent: [], selectedId: null, view: 'chat', page: 1, pages: 1, zoom: 1, fitting: 'height', pdf: null, image: null, sourceSize: null, activeSourceId: 'primary', sourceViews: new Map(), renderToken: 0, renderTask: null, append: false, replacement: null, drawing: null, busy: null, saving: false, loading: false, account: null, models: [], accountError: '', rateLimits: null, aiSettings: { model: 'gpt-6-astra', effort: 'medium' }, aiDraft: null, savingAi: false, drafts: new Map(), editor: null, documentBusy: false };
const symbols = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'];
let recognitionPrompt = '선택한 영역에서 인쇄된 원문을 인식하세요.';
let workflowUI;
let batchUI;
let bankUI;
let regionEditor;
let provider = 'codex', geminiState = { available: false, models: [], buckets: [], error: '' }, geminiSettings = { model: 'gemini-3.8-flash-medium', effort: 'medium' };
let claudeState={available:false,models:[],error:''},claudeSettings={model:'sonnet',effort:'medium'};
let geminiAccess = 'unknown';
let manualProviderChoice = false, startupProviderReady = null, selectingStartupProvider = true;
function currentAiSettings() { return provider === 'claude' ? claudeSettings : provider === 'gemini' ? geminiSettings : state.aiSettings; }

function element(tag, className = '', text = '') { const node = document.createElement(tag); if (className) node.className = className; if (text !== '') node.textContent = text; return node; }
function button(text, className, action) { const node = element('button', className, text); node.type = 'button'; if (action) node.addEventListener('click', action); return node; }
function selected() { return state.project?.problems.find((p) => p.id === state.selectedId) || null; }
function projectQuestions() { return (state.project?.problems || []).flatMap((p) => [p.original, ...(p.variants || [])].filter(Boolean)); }
function includedQuestions() { return projectQuestions().filter((q) => q.include !== false && (!q.needsReview||q.approval?.method==='user_question_only'&&q.approval?.status==='approved')); }
function errorText(error) { return String(error?.message || error || '작업을 완료하지 못했습니다.').replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '').replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]').replace(/\bsk-[A-Za-z0-9_-]{8,}/g, '[redacted]'); }
function toast(text, isError = false, action = null, context = errorContext()) { if(isError){rememberError(text,context);return;} const node = element('div', `toast${isError ? ' error' : ''}`); node.append(element('span', '', text)); if (action) node.append(button(action.label, '', () => { action.run(); node.remove(); })); node.append(button('×', '', () => node.remove())); $('toastRegion').append(node); setTimeout(() => node.remove(), isError ? 18000 : 9000); }
function guarded(fn) { return async (...args) => { const context=errorContext(); try { await fn(...args); } catch (error) { toast(errorText(error), true, null, context); } }; }
function errorContext(){return {projectId:state.project?.id||null,problemId:selected()?.id||null};}
function visibleErrors(){
 const runtime=[...new Map(state.errors.filter(e=>!e.projectId||e.projectId===state.project?.id).map(e=>[logKey(e),e])).values()].filter(e=>!(state.project?.problems.find(p=>p.id===e.problemId)?.recognition&&/확인된 원문이 필요|미확인 조건을 먼저|먼저 원문 판독/.test(e.text)));
 const issues=(state.project?.problems||[]).flatMap(p=>{
  const r=p.recognition;if(!r)return [];
  const list=uniqueIssues(r.uncertainties).map(u=>({id:'issue:'+p.id+':'+issueKey(u),role:'error',projectId:state.project.id,problemId:p.id,text:u.text,issueKey:issueKey(u),sourceVersion:r.version,virtual:true}));
  if(!list.length&&!r.confirmed&&!r.generationConsent?.active&&!r.sourceStale&&!r.rulesStale)list.push({id:'confirm:'+p.id,role:'error',projectId:state.project.id,problemId:p.id,text:'원문 판독 확인이 필요합니다.',sourceVersion:r.version,virtual:true,confirmationOnly:true});
  return list;
 });
 const generated=(state.project?.problems||[]).flatMap(p=>[p.original,...(p.variants||[])].filter(q=>q&&!(q.approval?.status==='approved'&&q.approval?.method==='manual_user_authorized')).flatMap(q=>[...new Set([...(q.validation?.errors||[]),...(q.checks?.program?.errors||[]),...(q.checks?.ai?.status==='failed'?q.checks.ai.unverified||[]:[])])].filter(text=>!(q.dismissedDiagnostics||[]).includes(text)).map(text=>({id:'question:'+q.id+':'+text,questionId:q.id,version:q.version,text,problemId:p.id,projectId:state.project.id,questionIssue:true,persisted:false}))));
 return [...issues,...generated,...runtime];
}
function retryOptions(problem,entry=null,task=null){
 const runs=(problem.runs||[]).slice().reverse();const run=runs.find(r=>(!task||r.task===task)&&entry&&r.reason===entry.text)||runs.find(r=>(!task||r.task===task)&&['failed','held'].includes(r.status))||runs.find(r=>r.task===(task||'generation'));
 return run?.requestOptions?{...run.requestOptions,force:run.requestOptions.force||['recognition','solve'].includes(run.task),reuseSolution:false,acceptReplacement:run.task==='recognition'}:{task:task||'generation',text:'유사문제를 만들어 주세요.',count:1,variant:'numeric_only'};
}
async function retryFromIssue(problem,entry,ignore=false,additionalInstructions=''){
 if(selected()?.id!==problem.id)await selectProblem(problem.id);
 const request=retryOptions(problem,entry);$('mainDialog').close();
 const options={...request,userInstructions:[request.userInstructions,additionalInstructions].filter(Boolean).join('\n')};
 if(ignore&&request.task==='generation')Object.assign(options,{allowUnverifiedGeneration:true,overrideSourceVersion:problem.recognition?.version});
 if(ignore&&request.task==='solve'){
  const originalTarget=!request.targetIds?.length||request.targetIds.includes(problem.original?.id);
  if(originalTarget){
   const projectId=state.project.id,r=selected().recognition;
   if(r?.uncertainties?.length)state.project=await api.ignoreSourceIssues({projectId,problemId:problem.id,sourceVersion:r.version,keys:r.uncertainties.map(issueKey)});
   state.project=await api.confirmSource({projectId,problemId:problem.id,sourceVersion:selected().recognition?.version,reviewed:true});
  }
  Object.assign(options,{autoRecover:false,recoveryWhenNeeded:false,force:true,reuseSolution:false});
 }
 await sendMessage(request.text,'retry',options);
}
async function openErrorEntry(entry){
 const p=state.project?.problems.find(p=>p.id===entry.problemId);
 if(p){await selectProblem(p.id);if(selected()?.id!==p.id)return;
  if(entry.questionIssue){state.view=p.original?.id===entry.questionId?'original':'variants';renderAll();requestAnimationFrame(()=>document.getElementById('question-'+entry.questionId)?.scrollIntoView({block:'center'}));return;}
  if(entry.virtual&&p.recognition){showSourceReview(p,null,entry.issueKey);return;}
 }
 const root=openDialog(p?problemIndex(p.id)+'번 문제 작업 오류':'오류 기록','원인과 다음 작업');root.append(element('p','error-explanation',entry.text));
 if(p){const input=element('textarea');input.id='errorRecoveryRequest';input.rows=4;input.placeholder='필요한 설명이나 요청을 입력하세요. 예: 방법 1은 종이를 접어 정삼각형을 만드는 과정입니다.';const task=retryOptions(p,entry).task,ignoreLabel=task==='solve'?'오류를 무시하고 풀이 작성':task==='generation'?'오류를 무시하고 유사문제 생성':'요청한 작업 다시 시도';root.append(input,button('요청 반영 · 다시 시도','button primary',guarded(()=>recoverError(entry,p,null,input.value.trim()))),button(ignoreLabel,'button outline',guarded(()=>retryFromIssue(p,entry,true,input.value.trim()))));root.append(button('자동 정리','button outline',guarded(()=>recoverError(entry,p,null,input.value.trim()))));root.append(element('p','editor-hint','문제 내용은 원문대로 유지합니다. 연결·응답 오류는 해당 작업을 다시 시도합니다.'));}
 root.append(button('닫기','button quiet',()=>$('mainDialog').close()));
}
function renderErrors(){
 const root=$('errorList');if(!root)return;const records=visibleErrors();root.replaceChildren();
 $('clearErrors').disabled=!records.length||records.some(e=>e.pending);
 if(!records.length)root.append(element('p','muted','표시할 오류가 없습니다.'));
 for(const entry of records){
  const node=element('article','message error'),head=element('div','message-head');
  const n=state.project?.problems.findIndex(p=>p.id===entry.problemId)??-1;
  const title=entry.questionIssue&&state.project.problems[n]?.original?.id===entry.questionId?`${n+1}번 원문 확인 필요`:entry.questionIssue?`${n+1}번 문제 · 유사문제 ${(state.project.problems[n].variants||[]).findIndex(q=>q.id===entry.questionId)+1} 확인 필요`:entry.virtual?`${n+1}번 문제 확인 필요 항목`:n>=0?`${n+1}번 문제 오류 기록`:entry.problemId?'삭제된 문제 오류 기록':'공통 오류 기록';
  const link=button(title,'error-entry-link',guarded(()=>openErrorEntry(entry)));head.append(link);
  const remove=button('삭제','button compact quiet',guarded(()=>removeErrorEntries([entry])));remove.disabled=!!entry.pending;remove.setAttribute('aria-label','오류 항목 삭제');head.append(remove);
  const detail=button(globalThis.ExamDiagnostics.explain(entry.text,state.project?.problems.find(p=>p.id===entry.problemId)?.variants?.find(q=>q.id===entry.questionId)?.diagram),'error-entry-text',guarded(()=>openErrorEntry(entry)));node.append(head,detail,button('자동 정리','button compact primary',guarded(()=>recoverError(entry))));root.append(node);
 }
}
async function removeErrorEntries(entries){
 for(const e of entries.filter(e=>e.questionIssue))state.project=await api.dismissQuestionIssues({projectId:state.project.id,problemId:e.problemId,questionId:e.questionId,version:e.version,texts:[e.text]});
 const grouped=new Map();for(const e of entries.filter(e=>e.virtual)){if(!grouped.has(e.problemId))grouped.set(e.problemId,[]);grouped.get(e.problemId).push(e);}
 for(const [problemId,items] of grouped){state.project=await api.ignoreSourceIssues({projectId:state.project.id,problemId,sourceVersion:items[0].sourceVersion,keys:items.filter(e=>e.issueKey).map(e=>e.issueKey)});}
 const persisted=entries.filter(e=>!e.virtual&&e.persisted!==false).map(e=>e.id);
 if(persisted.length)await api.removeErrors(persisted);
 const ids=new Set(entries.map(e=>e.id));state.errors=state.errors.filter(e=>!ids.has(e.id));
 if(state.editor)renderErrors();else renderAll();
}
function rememberError(text,context){
 const entry={...context,id:crypto.randomUUID(),role:'error',text:errorText(text),createdAt:new Date().toISOString(),pending:true,persisted:false};state.errors.push(entry);renderErrors();$('errorList').scrollTop=$('errorList').scrollHeight;
 if(api?.recordError)void api.recordError(entry).then(saved=>{const at=state.errors.findIndex(e=>e.id===entry.id);if(at>=0)state.errors[at]=saved;state.errors=[...new Map(state.errors.map(e=>[logKey(e),e])).values()];renderErrors();}).catch(()=>{entry.pending=false;entry.text+='\n[파일 저장에 실패하여 이 오류는 현재 창에서만 보관됩니다.]';renderErrors();});else{entry.pending=false;renderErrors();}
}
function apiRequired() { if (!api) throw new Error('데스크톱 앱으로 실행하면 시험지 열기와 AI 연결을 사용할 수 있습니다.'); }
function sourceOperationsBlocked() { return !!state.queueRunning || !!state.busy || !!state.batch || state.loading || state.saving || state.documentBusy || state.savingAi; }
function sourceZoomBlocked() { return !state.sourceSize || !!state.loading || !!state.drawing; }
function modelKey(model) { return model.model || model.id; }
function modelMetadata(value) { return state.models.find((model) => model.id === value || model.model === value) || null; }
function modelLabel(value) { const model = modelMetadata(value) || geminiState.models.find(m => m.model === value) || claudeState.models.find(m=>m.model===value) || ({sonnet:{displayName:'Claude Sonnet'},opus:{displayName:'Claude Opus'}})[value]; return model?.displayName || model?.model || value || 'Astra'; }
function effortLabel(value) { return ({ none: '없음', minimal: '최소', low: '낮음', medium: '보통', high: '높음', xhigh: '매우 높음', max: '최대', ultra: '최상' })[value] ? `${({ none: '없음', minimal: '최소', low: '낮음', medium: '보통', high: '높음', xhigh: '매우 높음', max: '최대', ultra: '최상' })[value]} · ${value}` : String(value || ''); }
function supportedEfforts(model) { const entries = (Array.isArray(model?.supportedReasoningEfforts) ? model.supportedReasoningEfforts : []).map((item) => typeof item === 'string' ? { reasoningEffort: item, description: '' } : item).filter((item) => typeof item?.reasoningEffort === 'string'); if (!entries.length && typeof model?.defaultReasoningEffort === 'string') entries.push({ reasoningEffort: model.defaultReasoningEffort, description: '' }); return entries; }
function imageModel(model) { return !!model && (!Array.isArray(model.inputModalities) || model.inputModalities.includes('image')); }
function renderAiControls() {
  const preferences = state.aiDraft || state.aiSettings, models = $('aiModel'), efforts = $('aiEffort'); models.replaceChildren(); efforts.replaceChildren();
  for (const model of state.models) { if (!modelKey(model)) continue; const available = imageModel(model); const option = element('option', '', `${model.displayName || modelKey(model)}${available ? '' : Array.isArray(model.inputModalities) ? ' · 이미지 미지원' : ' · 이미지 지원 미확인'}`); option.value = modelKey(model); option.disabled = !available; option.title = model.description || ''; models.append(option); }
  const selectedModel = modelMetadata(preferences.model); if (!selectedModel) { const stored = element('option', '', `${preferences.model}${state.models.length ? ' · 이용 가능 여부 확인 필요' : ' · 목록 확인 중'}`); stored.value = preferences.model; stored.disabled = true; models.append(stored); }
  models.value = selectedModel ? modelKey(selectedModel) : preferences.model;
  const supported = supportedEfforts(selectedModel);
  for (const item of supported) { const option = element('option', '', effortLabel(item.reasoningEffort)); option.value = item.reasoningEffort; option.title = item.description || ''; efforts.append(option); }
  if (!supported.some((item) => item.reasoningEffort === preferences.effort)) { const placeholder = element('option', '', preferences.effort ? `${effortLabel(preferences.effort)} · 지원 확인 필요` : '추론 수준 선택'); placeholder.value = preferences.effort || ''; placeholder.disabled = true; efforts.prepend(placeholder); }
  efforts.value = preferences.effort || ''; models.disabled = state.savingAi || !state.models.some(imageModel); efforts.disabled = state.savingAi || !imageModel(selectedModel) || !supported.length;
  $('aiSettingsStatus').textContent = state.accountError ? '목록 갱신 확인: '+state.accountError+' · 마지막 확인 목록을 유지합니다.' : state.savingAi ? 'AI 설정 저장 중…' : state.aiDraft && !state.aiDraft.effort ? '이 모델의 추론 수준을 선택하면 저장됩니다.' : !selectedModel && state.models.length ? '저장된 모델을 현재 계정에서 확인하지 못했습니다. 모델을 선택해 주세요.' : !state.models.length ? '계정 연결 후 실제 지원 모델과 추론 수준을 확인할 수 있습니다.' : '선택하면 자동 저장되며, 다음 요청부터 적용됩니다.';
}
async function persistAiSettings(preferences) {
  apiRequired(); state.savingAi = true; renderAiControls(); updateControls();
  try { const saved = await api.saveAiSettings(preferences); state.aiSettings = { model: saved.model, effort: saved.effort }; state.aiDraft = null; renderAccount(); }
  catch (error) { state.aiDraft = null; throw error; }
  finally { state.savingAi = false; renderAiControls(); updateControls(); }
}
async function changeAiModel() {
  const model = modelMetadata($('aiModel').value); if (!imageModel(model)) { renderAiControls(); throw new Error('문제 이미지를 읽을 수 있는 모델을 선택해 주세요.'); }
  const supported = supportedEfforts(model).map((item) => item.reasoningEffort), current = (state.aiDraft || state.aiSettings).effort;
  const effort = supported.includes(current) ? current : supported.includes(model.defaultReasoningEffort) ? model.defaultReasoningEffort : '';
  state.aiDraft = { model: modelKey(model), effort }; renderAiControls(); updateControls(); if (effort) await persistAiSettings(state.aiDraft);
}
async function importProjectWith(loader) {
  apiRequired(); if (sourceOperationsBlocked()) throw new Error('진행 중인 작업이 끝난 뒤 시험지를 열어 주세요.');
  if (state.editor && !window.confirm('저장하지 않은 문제 수정을 닫고 다른 시험지를 열까요?')) return;
  const p = selected(); if (p) state.drafts.set(p.id, $('chatInput').value);
  state.loading = true; updateControls(); try { const project = await loader(); if (project) { state.editor=null; if (project.id === state.project?.id) { const previousIds = new Set(projectSources().map(s=>s.id)); state.project = project; const added = projectSources().find(s=>!previousIds.has(s.id)); await loadSource(added?.id || state.activeSourceId); } else { await loadProject(project); await workflowUI.scopeRefresh(); await workflowUI.chooseScope(); } } } finally { state.loading = false; updateControls(); }
}
function confirmNewWorkspace() {
  if(sourceOperationsBlocked())return;
  const root=openDialog('새 작업을 시작할까요?', '현재 작업 닫기');
  root.append(element('p','','현재 열린 원본 파일·문제·풀이·대화를 화면에서 모두 닫고, 처음 실행한 것처럼 빈 화면으로 돌아갑니다.'));
  root.append(element('p','','자동 저장된 작업과 출력 파일은 삭제하지 않습니다. 「저장 작업 열기」나 최근 작업에서 다시 열 수 있습니다. AI 계정과 프롬프트 설정도 유지됩니다.'));
  root.append(element('p','editor-hint','전송하지 않은 채팅과 저장하지 않은 편집 내용은 사라집니다.'));
  const cancel=button('취소','button outline',()=>$('mainDialog').close());cancel.id='cancelNewWorkspace';
  const confirm=button('확인 · 새 작업 시작','button primary',guarded(async()=>{
    if(sourceOperationsBlocked())return;
    state.loading=true;updateControls();confirm.disabled=true;cancel.disabled=true;
    try {
      await api.resetWorkspace();
      // Reload clears viewer resources, drafts, review navigation and transient UI together.
      window.location.reload();
    } catch(error) { state.loading=false;updateControls();confirm.disabled=false;cancel.disabled=false;throw error; }
  }));confirm.id='confirmNewWorkspace';root.append(cancel,confirm);cancel.focus();
}
function fileDrag(event) { return Array.from(event.dataTransfer?.types || []).includes('Files') || Array.from(event.dataTransfer?.items || []).some((item) => item.kind === 'file'); }
function showFileDrop(active) { document.querySelector('.source-pane').classList.toggle('file-drag-active', active); $('fileDropOverlay').hidden = !active; $('fileDropTitle').textContent = sourceOperationsBlocked() ? '현재 작업이 끝난 뒤 놓아 주세요' : (state.project ? '놓으면 현재 시험지에 파일을 추가합니다' : '놓으면 시험지를 엽니다'); }
function wireFileDrop() {
  let depth = 0;
  window.addEventListener('dragenter', (event) => { if (!fileDrag(event)) return; event.preventDefault(); depth++; showFileDrop(true); });
  window.addEventListener('dragover', (event) => { if (!fileDrag(event)) return; event.preventDefault(); event.dataTransfer.dropEffect = sourceOperationsBlocked() ? 'none' : 'copy'; showFileDrop(true); });
  window.addEventListener('dragleave', (event) => { if (!fileDrag(event) && !depth) return; depth = Math.max(0, depth - 1); if (!depth) showFileDrop(false); });
  window.addEventListener('drop', guarded(async (event) => { if (!fileDrag(event)) return; event.preventDefault(); depth = 0; showFileDrop(false); const files = Array.from(event.dataTransfer.files || []); if (!files.length) return; if (files.some(file=>!/\.(pdf|png|jpe?g|webp|bmp)$/i.test(file.name))) throw new Error('PDF, PNG, JPG, WEBP, BMP 파일을 열 수 있습니다.'); await importProjectWith(() => api.importDroppedFiles(files,state.project?.id)); }));
  window.addEventListener('dragend', () => { depth = 0; showFileDrop(false); }); window.addEventListener('blur', () => { depth = 0; showFileDrop(false); });
}
function mathInto(target, value) { target.replaceChildren(); target.classList.add('math-content'); const text = String(value || ''); const pattern = /\$\$([\s\S]+?)\$\$|(?<!\\)\$([^$\n]+?)(?<!\\)\$/g; let last = 0; for (const match of text.matchAll(pattern)) { target.append(document.createTextNode(text.slice(last, match.index).replace(/\\\$/g, '$'))); const span = element(match[1] !== undefined ? 'div' : 'span'); if (window.katex) { try { window.katex.render(match[1] ?? match[2], span, { displayMode: match[1] !== undefined, throwOnError: false, trust: false, strict: false }); } catch { span.textContent = match[0]; } } else span.textContent = match[0]; target.append(span); last = match.index + match[0].length; } target.append(document.createTextNode(text.slice(last).replace(/\\\$/g, '$'))); return target; }
function solutionNode(q){const node=element('div','solution-content');const html=globalThis.ExamSolutionGuideRender.html(q,{math:value=>{const target=mathInto(element('div'),value);return target.innerHTML;}});if(html===null)return mathInto(node,globalThis.ExamSolutionDisplay.solutionText(q)||'원문 확인 후 정답·상세 풀이가 자동 작성됩니다.');node.innerHTML=html;return node;}
function diagramSvg(diagram) {
  const source = globalThis.ExamDiagramLayout.diagramSvg(diagram);
  if (!source) return null;
  const parsed = new DOMParser().parseFromString(source, 'image/svg+xml');
  if (parsed.querySelector('parsererror')) return null;
  const svg = document.importNode(parsed.documentElement, true);
  svg.classList.add('question-diagram');
  svg.removeAttribute('width'); svg.removeAttribute('height');
  return svg;
}

function updateControls() {
  renderAccount();
  const project = state.project, p = selected(), blocked = sourceOperationsBlocked();
  $('detectRegions').disabled = !state.sourceSize || blocked;
  $('aiModel').disabled = blocked || !state.models.some(imageModel);
  $('aiEffort').disabled = blocked || !supportedEfforts(modelMetadata((state.aiDraft || state.aiSettings).model)).length;
  $('autoClassify').disabled = true;
  $('cancelSelection').disabled = !(state.drawing || state.append || state.replacement || p) || blocked;
  $('cancelSelection').textContent = state.drawing || state.append || state.replacement ? '선택 취소 · Esc' : '선택 영역 취소';
  $('classifyProblem').disabled = !p || blocked || (provider === 'gemini' && (geminiAccess !== 'subscribed' || !geminiState.available));
  $('claudeTab').disabled=blocked;for(const id of ['claudeModel','claudeEffort','checkClaude'])$(id).disabled=blocked;
  $('codexTab').disabled = blocked; $('geminiTab').disabled = blocked || geminiAccess !== 'subscribed' || (!!geminiState.error && !geminiState.available); $('geminiTab').title = geminiAccess === 'unsubscribed' ? '미구독 설정으로 비활성화됨' : geminiAccess === 'unknown' ? 'Gemini 구독 상태를 먼저 선택하세요.' : geminiState.error || ''; $('geminiAccess').value = geminiAccess; $('geminiAccess').disabled = blocked; $('checkGemini').disabled = blocked; $('geminiModel').disabled = blocked || !geminiState.available;
  $('problemPart').value = p?.part || ''; $('problemPart').disabled = !p || blocked; $('problemPartHint').textContent = p ? '원문 영역 선택 · 시험 범위와 별개' : '문제를 선택한 뒤 지정하세요.';
  for (const id of ['codexAccountSettings','geminiAccountSettings','claudeAccountSettings','promptProfile','addPromptProfile','editPromptProfile']) $(id).disabled = blocked;
  $('renamePromptProfile').disabled = $('deletePromptProfile').disabled = blocked || !state.scopePresetId;
  $('projectTitle').disabled = !project || blocked; $('projectTitle').value = project?.title || ''; $('projectTitle').title = project?.title || '';
  $('sourceName').textContent = activeSource()?.name || 'PDF · 이미지'; $('sourceName').title = activeSource()?.name || '';
  for (const id of ['importSource', 'emptyImport', 'openProject', 'newProject', 'addSourceTab', 'resetWorkspace']) $(id).disabled = blocked;
  $('importSource').textContent = project ? '＋ 파일 추가' : '＋ 원본 불러오기'; $('importSource').title = 'PDF · 사진을 여러 개 선택해 하나의 시험지로 만듭니다';
  $('newProject').hidden = !project;
  for (const tab of document.querySelectorAll('.source-tab, .source-tab-close')) tab.disabled = blocked;
  for (const id of ['fitWidth', 'fitPage', 'fitHeight', 'zoomIn', 'zoomOut']) $(id).disabled = sourceZoomBlocked();
  $('pageNumber').disabled = !state.sourceSize || blocked;
  $('deleteSelection').disabled = !p || blocked; $('previousPage').disabled = $('edgePreviousPage').disabled = !state.sourceSize || state.page <= 1 || blocked; $('nextPage').disabled = $('edgeNextPage').disabled = !state.sourceSize || state.page >= state.pages || blocked;
  $('pageNumber').value = state.page; $('pageNumber').max = state.pages; $('pageTotal').textContent = `/ ${state.pages}`; $('zoomLabel').textContent = `${Math.round(state.zoom * 100)}%`;

  $('selectionHint').textContent = state.replacement ? `문제 ${problemIndex(state.replacement.problemId)} · 영역 ${state.replacement.regionIndex + 1}을 다시 드래그하세요 · Esc 취소` : state.append && p ? `문제 ${problemIndex(p.id)}에 영역 추가` : $('collectRegions').checked ? '박스 이동·테두리 크기 조절 / 빈 곳 드래그로 추가 → 전체 인식' : '드래그해서 문제를 선택하세요';
  $('viewCrop').disabled = !p; $('manageProblems').disabled = !project?.problems?.length || blocked;
  const count = includedQuestions().length; $('documentCount').textContent = `${count}문제`; $('variantCount').textContent = p?.variants?.length || 0;
  for (const id of ['previewDocument', 'exportHwp']) $(id).disabled = !count || blocked;
  $('exportPdf').disabled=$('exportDocx').disabled=!projectQuestions().length||blocked;
  $('solutionFontSetting').disabled=$('solutionFontSizeSetting').disabled=!project||blocked;$('solutionFontSetting').value=project?.settings?.solutionFont||project?.settings?.bodyFont||'맑은 고딕';$('solutionFontSizeSetting').value=String(project?.settings?.solutionFontSize||9);
  $('bodyFontSetting').disabled=$('bodyFontSizeSetting').disabled=!project||blocked;$('bodyFontSetting').value=project?.settings?.bodyFont||'맑은 고딕';$('bodyFontSizeSetting').value=String(project?.settings?.bodyFontSize||12);
  $('showQuestionLabels').disabled=!project||blocked;$('showQuestionLabels').checked=project?.settings?.showQuestionLabels!==false; paperForms?.refresh(blocked); $('layoutSetting').disabled = !project || blocked; $('spaceSetting').disabled = !project || blocked; $('layoutSetting').value = project?.settings?.layout || 'auto'; $('spaceSetting').value = String(project?.settings?.workspaceLines ?? 2);
  $('chatInput').disabled = !p || blocked || !!(provider === 'codex' && state.aiDraft && !state.aiDraft.effort); $('sendChat').disabled = !p || blocked || (provider === 'gemini' && !geminiState.available) || !!(provider === 'codex' && state.aiDraft && !state.aiDraft.effort) || !$('chatInput').value.trim(); $('cancelChat').hidden = !state.busy; $('cancelChat').disabled = state.busy?.canceling || false;
  $('composerStatus').textContent = state.busy ? (state.busy.status || '문제를 살펴보고 있습니다…') : selectingStartupProvider ? '사용 가능한 AI 연결을 확인하고 있습니다…' : (p ? `문제 ${problemIndex(p.id)}에 대한 대화 · Enter 전송 / Shift+Enter 줄바꿈` : '문제마다 대화가 따로 보관됩니다');
  if (selectingStartupProvider) $('sendChat').disabled = true;
  $('regionSummary').textContent = project?.problems?.length ? `${project.problems.length}개 문제 · ${project.problems.reduce((n, item) => n + item.regions.length, 0)}개 선택 영역` : '선택한 문제가 없습니다';
  $('viewerLoading').hidden = !state.loading;
}
function problemIndex(id) { return (state.project?.problems.findIndex((p) => p.id === id) ?? -1) + 1; }
async function moveProblemTo(id,targetId){
 if(sourceOperationsBlocked())return;
 const list=state.project.problems,from=list.findIndex(p=>p.id===id),to=list.findIndex(p=>p.id===targetId);if(from<0||to<0||from===to)return;
 const before=[...list];list.splice(to,0,...list.splice(from,1));try{await saveProject();}catch(error){state.project.problems=before;renderAll();throw error;}
}
function bindProblemDrag(node,id,afterMove=()=>{}){
 node.draggable=!sourceOperationsBlocked();node.dataset.problemId=id;
 node.addEventListener('dragstart',event=>{if(sourceOperationsBlocked()){event.preventDefault();return;}event.dataTransfer.setData('application/x-exam-problem',id);event.dataTransfer.effectAllowed='move';});
 node.addEventListener('dragover',event=>{if(!sourceOperationsBlocked()&&Array.from(event.dataTransfer.types).includes('application/x-exam-problem')){event.preventDefault();event.dataTransfer.dropEffect='move';node.classList.add('drop-target');}});
 node.addEventListener('dragleave',()=>node.classList.remove('drop-target'));
 node.addEventListener('drop',guarded(async event=>{node.classList.remove('drop-target');const from=event.dataTransfer.getData('application/x-exam-problem');if(!from||sourceOperationsBlocked())return;event.preventDefault();await moveProblemTo(from,id);afterMove();}));
}
function renderTabs(){
 const root=$('problemTabs'),offset=root.scrollLeft,changed=root.dataset.selected!==state.selectedId;root.replaceChildren();const problems=state.project?.problems||[];
 if(!problems.length)root.append(element('span','muted','왼쪽에서 문제를 선택하면 여기에 모입니다'));
 problems.forEach((p,i)=>{const tab=button(`문제 ${i+1}`,`problem-tab${p.id===state.selectedId?' active':''}`,guarded(()=>selectProblem(p.id)));tab.disabled=state.loading;bindProblemDrag(tab,p.id);tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(p.id===state.selectedId));tab.title=p.original?.body?.slice(0,100)||`${p.regions.length}개 선택 영역`;if(p.needsReview||p.warnings?.length)tab.append(element('span','tiny-dot'));if(state.busy?.problemId===p.id)tab.append(element('span','spinner'));root.append(tab);});
 root.scrollLeft=offset;root.dataset.selected=state.selectedId||'';if(changed)root.querySelector('.active')?.scrollIntoView({block:'nearest',inline:'nearest'});
}

async function selectProblem(id) {
  if (state.editor && !window.confirm('저장하지 않은 수정을 닫고 다른 문제를 볼까요?')) return;
  state.editor = null;
  const previous = selected(); if (previous) state.drafts.set(previous.id, $('chatInput').value);
  if (state.selectedId !== id) state.replacement = null;
  state.selectedId = id;
  const p = selected(); $('chatInput').value = state.drafts.get(id) || '';
  renderAll();
  if (p?.regions[0] && !p.regions.some(r=>regionSourceId(r)===state.activeSourceId && r.page===state.page)) {
    const region=p.regions.find(r=>r.role!=='context')||p.regions[0];
    await loadSource(regionSourceId(region),region.page);
  }
}
function projectSources() { return state.project?.sources || (state.project?.source ? [{...state.project.source,id:'primary'}] : []); }
function activeSource() { return projectSources().find(s=>s.id===state.activeSourceId); }
function regionSourceId(region) { return region?.sourceId || 'primary'; }
function regionLabel(region) { const source=projectSources().find(s=>s.id===regionSourceId(region)); return `${source?.name || '원본'} · ${region?.page || 1}페이지`; }
function confirmCloseSource(source) {
  if(sourceOperationsBlocked()||state.drawing)return;
  const projectId=state.project.id,sources=projectSources(),index=sources.findIndex(s=>s.id===source.id),last=sources.length===1;
  const affected=state.project.problems.filter(p=>p.regions.some(r=>regionSourceId(r)===source.id));
  const root=openDialog('원본 파일을 닫을까요?','파일 탭 닫기');root.append(element('p','',source.name));
  root.append(element('p','',last?'마지막 파일입니다. 현재 작업을 닫고 빈 화면으로 돌아갑니다. 자동 저장된 문제·풀이·대화는 「저장 작업 열기」에서 다시 열 수 있습니다.':affected.length?`이 파일의 영역을 사용하는 문제 ${affected.map(p=>problemIndex(p.id)).join(', ')}번과 해당 풀이·유사문제·대화를 현재 작업에서 함께 제거합니다. 다른 파일의 문제는 유지됩니다.`:'이 파일만 현재 작업에서 닫습니다. 다른 파일과 문제는 유지됩니다.'));
  root.append(element('p','editor-hint','컴퓨터에 저장된 원본 PDF·사진 파일은 삭제하지 않습니다.'));
  if(state.editor)root.append(element('p','editor-hint','저장하지 않은 편집 내용은 닫힙니다.'));
  const confirm=button('확인 · 파일 닫기','button primary',guarded(async()=>{
    if(sourceOperationsBlocked()||state.project?.id!==projectId)return;
    state.loading=true;updateControls();confirm.disabled=true;
    try{
      const result=await api.closeSource({projectId,sourceId:source.id,removeProblems:affected.length>0});
      if(!result.project){window.location.reload();return;}
      const previousActive=state.activeSourceId,activeClosed=previousActive===source.id;
      state.project=result.project;state.editor=null;state.batchSummary='';state.replacement=null;state.append=false;state.contextCapture=false;
      for(const id of result.removedProblemIds)state.drafts.delete(id);
      state.errors=state.errors.filter(e=>e.projectId!==projectId||!result.removedProblemIds.includes(e.problemId));
      state.sourceViews.delete(source.id);
      if(result.promotedSourceId){const saved=state.sourceViews.get(result.promotedSourceId);state.sourceViews.delete(result.promotedSourceId);if(saved)state.sourceViews.set('primary',saved);}
      if(!state.project.problems.some(p=>p.id===state.selectedId)){state.selectedId=state.project.problems[0]?.id||null;state.view='chat';}
      $('chatInput').value=state.drafts.get(state.selectedId)||'';$('mainDialog').close();
      let target=activeClosed?projectSources()[Math.min(index,projectSources().length-1)].id:previousActive===result.promotedSourceId?'primary':previousActive;
      // A new primary file can reuse the same id; force the viewer to reload its bytes.
      if(activeClosed){state.activeSourceId=null;await loadSource(target);}
      else if(previousActive===result.promotedSourceId)state.activeSourceId='primary';
    }finally{state.loading=false;renderAll();}
  }));confirm.id='confirmCloseSource';root.append(button('취소','button outline',()=>$('mainDialog').close()),confirm);
}
function renderSourceTabs() {
  const root=$('sourceTabs'),offset=root.scrollLeft,changed=root.dataset.active!==state.activeSourceId;
  root.replaceChildren(); $('sourceTabStrip').hidden=!state.project;
  for (const source of projectSources()) {
    const tab=button(source.name,`source-tab${source.id===state.activeSourceId?' active':''}`,guarded(async()=>{
      if(sourceOperationsBlocked()||state.drawing)return;
      if(state.editor&&!window.confirm('저장하지 않은 문제 수정을 닫고 다른 원본 파일을 볼까요?'))return;
      state.editor=null;
      await loadSource(source.id);
    }));
    tab.dataset.sourceId=source.id;tab.title=source.name;tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(source.id===state.activeSourceId));tab.disabled=sourceOperationsBlocked();
    const group=element('div',`source-tab-group${source.id===state.activeSourceId?' active':''}`),close=button('×','source-tab-close',()=>confirmCloseSource(source));close.dataset.sourceId=source.id;close.title=source.name+' 닫기';close.setAttribute('aria-label',source.name+' 닫기');close.disabled=sourceOperationsBlocked();group.append(tab,close);root.append(group);
  }
  root.scrollLeft=offset;root.dataset.active=state.activeSourceId;
  if(changed)root.querySelector('.active')?.scrollIntoView({block:'nearest',inline:'nearest'});
}

function setView(view) { if (state.editor && !window.confirm('저장하지 않은 수정을 닫을까요?')) return; state.editor = null; state.view = view; renderAll(); }
function renderAll() { updateControls(); renderSourceTabs(); renderTabs(); renderRegions(); renderWork(); renderErrors(); batchUI?.refresh(); }
function renderRegions() { const layer = $('selectionLayer'); layer.replaceChildren(); for (const p of state.project?.problems || []) for (const [regionIndex, region] of p.regions.entries()) { if (regionSourceId(region) !== state.activeSourceId || region.page !== state.page) continue; const replacing = state.replacement?.problemId === p.id && state.replacement.regionIndex === regionIndex; const box = element('div', `region-box${p.id === state.selectedId ? ' selected' : ''}${replacing ? ' replacing' : ''}`); box.style.left = `${region.x * 100}%`; box.style.top = `${region.y * 100}%`; box.style.width = `${region.width * 100}%`; box.style.height = `${region.height * 100}%`; box.append(element('span', 'region-label', `문제 ${problemIndex(p.id)}${p.regions.length > 1 ? ` · 영역 ${regionIndex + 1}` : ''}${replacing ? ' · 다시 지정 중' : ''}`));regionEditor?.bind(box,p,regionIndex); layer.append(box); } }
function noticeFor(p) { const warnings = [...new Set([...(p.warnings || []), ...(p.needsReview ? ['원문 조건과 풀이를 확인한 뒤 문서에 포함해 주세요.'] : [])])]; if (!warnings.length) return null; const notice = element('div', 'review-notice'); notice.append(element('strong', '', '확인이 필요한 부분')); const list = element('ul'); for (const warning of warnings) list.append(element('li', '', warning)); notice.append(list); return notice; }
function renderWork() {
  document.querySelectorAll('.view-tab').forEach((tab) => { const active = tab.dataset.view === state.view; tab.classList.toggle('active', active); tab.setAttribute('aria-selected', String(active)); });
  const p = selected(), root = $('workContent'); if (!p) { if (!root.querySelector('.work-empty')) { root.replaceChildren(); const empty = element('div', 'empty-state work-empty'); empty.append(element('span', 'assistant-mark', '✳'), element('h2', '', '문제 하나에서 시작하는\n새로운 시험지'), element('p', '', '왼쪽 시험지에서 문제 영역을 선택하세요.\n인식한 내용을 함께 고치고 유사문제를 만들 수 있어요.')); root.append(empty); } $('chatSuggestions').hidden = true; return; }
  const wasNearBottom = root.scrollHeight - root.scrollTop - root.clientHeight < 90; root.replaceChildren();
  if (state.view === 'chat') {
    if (!p.messages?.length && state.busy?.problemId !== p.id) { const intro = element('div', 'context-card'); intro.append(element('strong', '', `문제 ${problemIndex(p.id)} · ${p.regions.length}개 영역 선택됨`), element('p', '', '선택한 영역에서 지문과 도형 조건을 인식합니다. 애매한 표시가 있으면 대화로 바로잡을 수 있어요.')); intro.append(button('원문 인식하기', 'button compact primary', () => sendMessage(recognitionPrompt, 'recognition'))); root.append(intro); }
    const warning = noticeFor(p); if (warning) root.append(warning);
    for (const message of p.messages||[]) root.append(messageNode(message));
    if (state.busy?.problemId === p.id) { if (state.busy.userText) root.append(messageNode({ role: 'user', text: state.busy.userText, requestKind: state.busy.requestKind, createdAt: new Date().toISOString() })); const pending = messageNode({ role: 'assistant', text: state.busy.stream || state.busy.status || '문제를 읽고 조건을 확인하고 있습니다…', model: state.busy.model, effort: state.busy.effort }); pending.classList.add('pending'); pending.querySelector('.message-head').prepend(element('span', 'spinner')); root.append(pending); }
    if (p.original && state.busy?.problemId !== p.id) { const summary = element('div', 'context-card'); summary.append(element('strong', '', `인식한 원문${p.variants?.length ? ` · 유사문제 ${p.variants.length}개` : ''}`), element('p', '', '문제 탭에서 수식·도형을 확인하고, 사용할 문제를 문서에 포함하세요.')); summary.append(button('원문 확인', 'button compact outline', () => setView('original'))); if (p.variants?.length) summary.append(button('유사문제 확인', 'button compact outline', () => setView('variants'))); root.append(summary); }
    if (wasNearBottom || state.busy?.problemId === p.id) root.scrollTop = root.scrollHeight;
  } else if (state.view === 'original') {
    const warning = noticeFor(p); if (warning) root.append(warning);
    if (p.original) root.append(questionCard(p.original, p)); else { const empty = element('div', 'empty-state blank-original'); empty.append(element('h2', '', '아직 인식한 원문이 없습니다'), element('p', '', '선택 영역을 AI로 인식하거나 원문을 직접 입력하세요.')); empty.append(button('원문 인식하기', 'button primary', () => sendMessage(recognitionPrompt, 'recognition')), button('직접 입력', 'button quiet', () => createManualOriginal())); root.append(empty); }
  } else {
    if (!p.variants?.length) { const empty = element('div', 'empty-state blank-original'); empty.append(element('h2', '', '첫 유사문제를 만들어 보세요'), element('p', '', p.original ? '개수와 바꾸고 싶은 조건을 아래 대화창에 적어 주세요.' : '원문을 먼저 인식한 뒤 유사문제를 만들 수 있습니다.')); const btn = button('같은 유형으로 1문제 만들기', 'button primary', () => sendMessage('원래 문제와 풀이 원리는 같고 수치 또는 도형 배치를 바꾼 유사문제 1개를 만들어 주세요. 각 문제의 정답, 상세 풀이, 도형 조건을 검토해 주세요.', 'suggestion')); btn.disabled = !p.original || !!state.busy; empty.append(btn); root.append(empty); } else p.variants.forEach((question) => root.append(questionCard(question, p)));
  }
  renderSuggestions();
}
function requestDisplay(message) {
  if (message.role !== 'user') return message.text;
  const kind = message.requestKind || (message.text === recognitionPrompt ? 'recognition' : '');
  return ({ recognition: '원문 인식 요청', review: '선택 영역 재인식 요청', suggestion: '유사문제 생성 요청' })[kind] || message.text;
}
function messageNode(message) { if(message.role==='error'){const node=element('article','message error');const head=element('div','message-head','작업 오류');const time=element('time','',new Date(message.createdAt).toLocaleString('ko-KR'));time.dateTime=message.createdAt;head.append(time);node.append(head,element('div','message-text',message.text));return node;} const node = element('article', `message ${message.role === 'user' ? 'user' : 'assistant'}`); const header = element('div', 'message-head'); header.append(element('span', '', '✳'), element('strong', '', message.role === 'user' ? '나' : message.model ? modelLabel(message.model) : 'Astra')); if (message.role !== 'user' && message.effort) header.append(element('span', 'message-effort', `추론 ${effortLabel(message.effort)}`)); if (message.createdAt) { const time = element('time', '', new Date(message.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })); time.dateTime = message.createdAt; header.append(time); } node.append(header, mathInto(element('div', 'message-text'), requestDisplay(message))); return node; }
function renderSuggestions() {
 const root=$('chatSuggestions'),p=selected();root.replaceChildren();root.hidden=!p||!!state.busy;if(!p)return;
 const actions=p.original?[['수치 바꾸기','원문과 풀이 구조가 같은 유사문제를 만들어 주세요.',{task:'generation',variant:'numeric_only'}],['도형 좌우 반전','좌우 반전과 수치 변경을 적용해 주세요.',{task:'generation',variant:'mirror_numeric'}],['다른 성질 활용','같은 주제의 다른 성질을 활용해 주세요.',{task:'generation',variant:'alternative_property'}],['조건·정답 재검수','문항 조건에서 정답과 풀이를 재검수하세요.',{task:'validation'}]]:[['원문 인식하기',recognitionPrompt,{task:'recognition'}]];
 for(const [label,text,options] of actions)root.append(button(label,'suggestion',guarded(()=>sendMessage(text,options.task==='recognition'?'recognition':options.task==='generation'?'suggestion':'',options))));
}

async function recoverError(entry,problem=null,question=null,additionalInstructions=''){
 const p=problem||state.project?.problems.find(p=>p.id===entry?.problemId)||selected();
 if(sourceOperationsBlocked())return;
 $('mainDialog').close();
 if(!p){if(provider==='claude')await refreshClaude(false);else if(provider==='gemini')await refreshGemini(false);else await refreshAccount();toast('연결을 확인했습니다. 문제를 선택한 뒤 작업을 다시 시도해 주세요.');return;}
 if(selected()?.id!==p.id)await selectProblem(p.id);
 if(selected()?.id!==p.id)return;
 const reason=entry?.text||'';
 if(/Word|docx|미주|문서|출력/i.test(reason)&&!/승인|재검|원문|풀이|조건/.test(reason)){await exportDocument('docx');return;}
 if(globalThis.ExamDiagnostics.transport(reason)){await retryFromIssue(p,entry,false,additionalInstructions);return;}
 if(!p.recognition||!p.original){const done=await sendMessage(recognitionPrompt,'recognition',{task:'recognition',force:true,acceptReplacement:true});if(done&&selected()?.id===p.id&&selected()?.recognition&&selected()?.original)return recoverError(null,selected(),selected().original);return;}
 const q=question||p.variants.find(q=>q.id===entry?.questionId)||p.original;
 const repairDiagram=q.kind==='variant'&&q.validation?.errors?.length;
 const retrySolution=q.kind==='variant'&&!repairDiagram&&(q.solutionDraft||!q.solution);
 const done=q.kind==='original'
  ?await sendMessage('원문 인쇄 내용을 보존하여 오독만 최소 교정하고, 출제 의도에 따른 정답·상세 풀이를 작성해 주세요. 표현상 주의점은 풀이 마지막에 참고 코멘트로 남겨 주세요.','recover',{userInstructions:additionalInstructions,task:'solve',autoRecover:true,targetIds:[q.id],force:true,includeImages:true})
  :repairDiagram?await sendMessage('문장·조건·정답·풀이를 보존하고 도형 데이터 오류만 최소 수정하세요.','recover',{userInstructions:additionalInstructions,task:'revision',revisionMode:'diagram',targetIds:[q.id]})
  :retrySolution?await sendMessage('이 문항을 그대로 유지하고 출제 의도에 따라 정답·풀이를 작성하세요. 표현상 주의점은 풀이 마지막에 참고 코멘트로 남겨 주세요.','recover',{userInstructions:additionalInstructions,task:'solve',targetIds:[q.id],force:true})
  :await sendMessage('이 유사문제의 출제 의도·수치·정답을 가능한 한 유지하고 오류만 최소 수정해 주세요. 표현상 주의점만 있으면 문항을 변경하지 말고 풀이 마지막에 참고 코멘트를 남겨 주세요.','recover',{userInstructions:additionalInstructions,task:'revision',revisionMode:'content',intentRepair:true,targetIds:[q.id]});
 if(done){
  const current=selected(),result=q.kind==='original'?current?.original:repairDiagram||retrySolution?current?.variants.find(v=>v.id===q.id):current?.variants.at(-1);
  if(!result||result.solutionDraft||result.checks?.ai?.status==='failed'||result.checks?.program?.errors?.length||result.checks?.scope?.status==='incompatible'){state.view=q.kind==='original'?'original':'variants';renderAll();toast('가능한 풀이를 저장했습니다. 아직 확인되지 않은 항목은 기록에 남겼습니다.');return;}
  const relatedReasons=new Set((current.runs||[]).filter(r=>r.task==='solve'&&r.targetIds?.includes(q.id)).map(r=>r.reason).filter(Boolean));
  const resolved=state.errors.filter(e=>e.problemId===p.id&&!globalThis.ExamDiagnostics.transport(e.text)&&(e.id===entry?.id||relatedReasons.has(e.text)));
  if(resolved.length){await api.removeErrors(resolved.map(e=>e.id));const ids=new Set(resolved.map(e=>e.id));state.errors=state.errors.filter(e=>!ids.has(e.id));}
  state.view=q.kind==='original'?'original':'variants';renderAll();toast(q.kind==='original'||retrySolution?'문제를 보존해 정답·풀이를 작성했습니다.':repairDiagram?'문제는 유지하고 그림 데이터만 정리했습니다.':'최소 수정 결과를 유사문제 목록에 추가했습니다.');
 }
}
function appendRecoveryActions(root,p,q,reason=''){
 const latest=(p.runs||[]).filter(r=>r.task==='solve'&&r.targetIds?.includes(q.id)).at(-1),draft=q.solutionDraft;
 const failure=reason||draft?.holdReason||(['held','failed'].includes(latest?.status)?latest.reason:'')||q.checks?.ai?.unverified?.join('\n')||'';
 if(!failure&&!q.validation?.errors?.length&&q.checks?.ai?.status!=='failed')return;
 const box=element('div','recovery-panel');
 box.append(button('원문대로 자동 정리·풀이 작성','button compact primary',guarded(()=>recoverError({text:failure,problemId:p.id},p,q))));
 box.append(element('p','editor-hint',q.kind==='original'?'인쇄된 문제는 유지하고 오독만 교정합니다. 주의점은 풀이 끝에 적습니다.':'출제 의도를 유지한 최소 수정본을 만듭니다.'));
 const details=element('details','recovery-details');details.append(element('summary','','자세한 기록 (선택)'));
 if(failure)details.append(element('p','error-explanation',failure));
 if(draft){if(draft.reply)details.append(mathInto(element('div','question-body'),draft.reply));if(draft.solution)details.append(mathInto(element('div','question-body'),'검토용 풀이: '+draft.solution));}
 for(const evidence of q.checks?.ai?.evidence||[])details.append(element('p','',evidence));box.append(details);root.append(box);
}
function questionCard(q, p) {
  q={...q,solution:globalThis.ExamSolutionDisplay.solutionText(q)};
  let confirmButton=null;
  const card = element('article', 'question-card');if(q.kind==='original'){const addContext=button('공통 자료 영역 추가','button compact outline add-context',()=>{state.append=true;state.contextCapture=true;state.selectedId=p.id;toast('왼쪽 시험지에서 방법·공통 발문 영역을 드래그하세요. 개별 문제 그림과 별도로 보관합니다.');});addContext.disabled=sourceOperationsBlocked();card.append(addContext);}card.id='question-'+q.id; const head = element('div', 'question-card-head'); head.append(element('span', `question-kind${q.kind === 'variant' ? ' variant' : ''}`, q.kind === 'original' ? '원본문제' : '유사문제'), element('strong', '', q.kind === 'original' ? `원문 ${problemIndex(p.id)}` : `원문 ${problemIndex(p.id)} · 변형 ${(p.variants || []).findIndex((v) => v.id === q.id) + 1}`)); const editButton = button(state.editor === q.id ? '편집 닫기' : '문구 수정', 'button compact outline', () => { if (state.editor === q.id && !window.confirm('저장하지 않은 수정을 닫을까요?')) return; state.editor = state.editor === q.id ? null : q.id; renderWork(); if(state.editor)requestAnimationFrame(()=>document.getElementById(`edit-${q.id}-body`)?.focus()); }); editButton.disabled = !!state.busy || state.saving; head.append(editButton); card.append(head);bankUI?.mount(card,p,q);if(q.kind==='variant'&&q.difficulty)card.append(element('p','editor-hint','난이도: '+q.difficulty+(q.requestedDifficulty&&q.requestedDifficulty!=='same'?' · 선택: '+q.requestedDifficulty:'')));
  if (state.editor === q.id) { card.append(questionEditor(q)); return card; }
  appendRecoveryActions(card,p,q);
  if(q.kind==='original'&&p.recognition?.recovery?.evidence?.length){const changes=element('details','recovery-details');changes.append(element('summary','','원문 대조·인식 교정 기록'));for(const note of p.recognition.recovery.evidence)changes.append(element('p','',note));card.append(changes);}
  if(q.intentRepair){const changes=element('div','review-notice');changes.append(element('strong','','출제 의도 유지 수정본 · 변경 사항'));for(const change of q.changes||[])changes.append(mathInto(element('div','question-body'),change));changes.append(element('p','editor-hint','원문은 보존되어 있습니다. 변경 사항과 풀이를 검토해 주세요.'));card.append(changes);}
  if (q.needsReview) card.append(element('div', 'review-notice', q.reviewReasons?.length?'확인 필요 · '+q.reviewReasons.join(' ')+' 아래 재검수로 현재 문항을 확인할 수 있습니다. 재생성은 새 문제를 만드는 별도 기능입니다.':'확인 필요 · 조건, 정답·풀이와 도형을 살펴본 뒤 아래의 검토 완료를 체크해 주세요.'));
  if(q.validation?.errors?.length){const details=element('details','recovery-details');details.append(element('summary','','그림 확인사항 (선택)'));for(const message of q.validation.errors)details.append(element('p','',globalThis.ExamDiagnostics.explain(message,q.diagram)));card.append(details);}
  else if (q.validation?.checked) card.append(element('p', 'editor-hint', `도형의 좌표 조건 ${q.validation.checked}개를 계산해 확인했습니다. 정답과 풀이의 타당성은 별도로 검토해 주세요.`));
  if(q.kind==='original'){
    const r=p.recognition;
    const missingFigure = !globalThis.ExamDiagramLayout.questionDiagram(q)?.points?.length && ((r?.conditions || []).some(c=>c.source==='diagram') || (r?.marks || []).some(m=>m.origin==='printed'));
    if(missingFigure) card.append(element('div','review-notice','도형 재작성 미완료 · 원본 보기를 확인하고 도형만 다시 그리기를 실행해 주세요.'));
    const confirm=button(batchUI?.isOriginalReview()?'원문 확인 (풀이 별도)':r?.confirmed?(q.answer&&q.solution&&!q.solutionStale?'원문 확인됨':'정답·상세 풀이 작성'):'원문 확인 · 풀이 작성','button compact primary',guarded(async()=>{if(r?.uncertainties?.length||r?.rulesStale||r?.sourceStale)showSourceReview(p);else{await confirmAndSolve(p,{force:!!(r?.confirmed&&q.answer&&q.solution&&!q.solutionStale)});}}));confirm.id='confirmRecognition';confirm.disabled=!!state.busy||!!(r?.confirmed&&!r?.rulesStale&&!r?.sourceStale&&!r?.uncertainties?.length&&q.answer&&q.solution&&!q.solutionStale);confirmButton=confirm;
    if(r){const info=element('details');info.append(element('summary','',`원문 v${r.version} · ${r.domains.join(' / ')} · 확인 필요 ${r.uncertainties.length}개`),element('pre','request-preview',JSON.stringify({conditions:r.conditions,excludedConditions:r.excludedConditions,marks:r.marks,uncertainties:r.uncertainties,printedAnswer:r.printedAnswer,printedSolution:r.printedSolution,locations:r.locations},null,2)));card.append(info);}
  }
  if(q.checks){const info=element('details');info.append(element('summary','','AI 검산 · 프로그램 검사 · 범위 · 사용자 승인'),element('pre','request-preview',JSON.stringify({checks:q.checks,approval:q.approval,provenance:q.provenance,reviews:q.reviews},null,2)));card.append(info);}
  let flow=makeQuestionFlow(q,p,[],true);card.append(flow);
  if(q.kind==='original')void api.readMaterials({projectId:state.project.id,problemId:p.id,questionId:q.id}).then(materials=>{if(!flow.isConnected)return;const next=makeQuestionFlow(q,p,materials,true);flow.replaceWith(next);flow=next;}).catch(e=>toast(errorText(e),true)); if (q.choices?.length) card.append(choicesNode(q.choices,q.choiceLayout));
  if(q.kind==='original') {
    const actions=element('div','recognition-retry-actions');
    for(const [id,label,target] of [['retryDiagram','도형만 다시 그리기','diagram'],['retryText','문장만 다시 인식하기','text'],['retryAll','전체 다시 인식','all']]) {
      const retry=button(label,'button compact outline',guarded(()=>showRecognitionRetry(p,target)));retry.id=id;retry.disabled=sourceOperationsBlocked();actions.append(retry);
    }
    const redrawExample=element('span','editor-hint','예) 22도를 도형밖으로 빼서 안내선으로 이어줘.');redrawExample.id='redrawExample';actions.append(redrawExample);card.append(actions);
  }
  if(q.solutionStale)card.append(element('p','review-notice','원문 조건이나 시험 범위가 바뀌어 기존 풀이를 다시 확인해야 합니다. 원문 확인 후 풀이를 다시 작성하세요.'));
  const details = element('details', 'solution-details'); const solutionSummary=element('summary', 'solution-heading');solutionSummary.append(element('span','','정답과 상세 풀이'));details.append(solutionSummary); const solution = element('div', 'solution-content'); solution.append(mathInto(element('div', 'solution-answer'), `정답: ${q.answer || '아직 작성되지 않았습니다.'}`), solutionNode(q)); details.append(solution); card.append(details);
  if(q.kind==='variant'){const variantActions=element('div','variant-actions');const review=button('재검수','button compact outline review-variant',guarded(()=>sendMessage('이 문항의 조건·정답·풀이를 다시 검수해 주세요. 문항을 새로 만들거나 바꾸지 마세요.','review',{task:'validation',targetIds:[q.id]})));review.title='현재 문제·정답·풀이를 검사합니다. 새 문제를 만들지 않습니다.';review.disabled=sourceOperationsBlocked();variantActions.append(review);const remove=button('삭제','button compact quiet danger-text delete-variant',guarded(()=>showVariantDeletion(p,q)));remove.disabled=sourceOperationsBlocked();variantActions.append(remove);const regenerate=button('유사문제 재생성','button compact outline regenerate-variant',guarded(()=>showVariantRegeneration(p,q)));regenerate.disabled=!!state.busy||state.saving;variantActions.prepend(regenerate);card.append(variantActions);}
  if(q.answer||q.solution){const regenerate=button('풀이 재생성','button compact outline regenerate-solution',guarded(event=>{event.preventDefault();event.stopPropagation();showSolutionRegeneration(p,q);}));regenerate.disabled=!!state.busy||state.saving;solutionSummary.append(regenerate);}
  const footer = element('div', 'question-footer'), label = element('label', 'include-label'); const include = element('input'); include.type = 'checkbox'; include.checked = q.include !== false && (!q.needsReview||q.approval?.method==='user_question_only'&&q.approval?.status==='approved'); include.disabled = !!state.busy || state.saving; include.addEventListener('change', guarded(async () => { try{state.project=await api.approveQuestion({projectId:state.project.id,problemId:p.id,questionId:q.id,approved:include.checked});}finally{renderAll();} })); label.append(include, document.createTextNode('검토 완료 · Word에 포함'));include.setAttribute('aria-label','검토 완료 · Word에 포함'); footer.append(label);const questionOnly=button(q.approval?.method==='user_question_only'&&q.include?'문제만 포함됨':'풀이 없이 문제만 포함','button compact outline include-question-only',guarded(async()=>{state.project=await api.includeWithoutSolution({projectId:state.project.id,problemId:p.id,questionId:q.id});renderAll();}));questionOnly.disabled=sourceOperationsBlocked();footer.append(questionOnly);
  if (q.kind === 'variant') { const index = p.variants.findIndex((v) => v.id === q.id); for (const [labelText, direction] of [['↑', -1], ['↓', 1]]) { const move = button(labelText, 'button compact quiet', guarded(async () => { [p.variants[index], p.variants[index + direction]] = [p.variants[index + direction], p.variants[index]]; await saveProject(); })); move.title = direction < 0 ? '앞으로 이동' : '뒤로 이동'; move.setAttribute('aria-label', move.title); move.disabled = !!state.busy || state.saving || index + direction < 0 || index + direction >= p.variants.length; footer.append(move); } }
  const layout = element('select'); layout.setAttribute('aria-label', '이 문제의 지면 배치'); [['auto', '길이 자동 판단'], ['half', '짧은 문제 · 반 단'], ['full', '긴 문제 · 한 단']].forEach(([value, text]) => { const option = element('option', '', text); option.value = value; layout.append(option); }); layout.value = q.layout || 'auto'; layout.disabled = !!state.busy || state.saving; layout.addEventListener('change', guarded(async () => { q.layout = layout.value; await saveProject(); })); footer.append(layout); const position=element('select');position.setAttribute('aria-label','그림 위치');position.className='diagram-position';for(const {value,label} of globalThis.ExamQuestionPresentation.placementOptions(q.body)){const o=element('option','',label);o.value=value;position.append(o);}position.value=globalThis.ExamQuestionPresentation.figureSlot(q,'diagram');position.disabled=sourceOperationsBlocked();position.addEventListener('change',guarded(async()=>{state.project=await api.setPresentation({projectId:state.project.id,problemId:p.id,targetIds:[q.id],figureId:'diagram',slot:position.value});renderAll();}));footer.append(position);
  if(q.choices?.length){const picker=element('select');picker.setAttribute('aria-label','선택지 배치');for(const [value,label] of [['auto','선택지 · 기존 배치'],['vertical','선택지 · 세로 정렬']]){const o=element('option','',label);o.value=value;picker.append(o);}picker.value=q.choiceLayout||'auto';picker.disabled=sourceOperationsBlocked();picker.addEventListener('change',guarded(async()=>{state.project=await api.setPresentation({projectId:state.project.id,problemId:p.id,targetIds:[q.id],choiceLayout:picker.value});renderAll();}));footer.append(picker);}
  if(q.kind==='original'){const useSource=button(q.diagramMode==='source'?'원본 그림 추가·변경':'원본 그림 그대로 사용','button compact outline',guarded(()=>showSourceFigurePicker({p,q,api,projectId:state.project.id,openDialog,element,button,onSave:project=>{state.project=project;$('mainDialog').close();renderAll();},onError:e=>toast(errorText(e),true)})));useSource.disabled=sourceOperationsBlocked();footer.append(useSource);if(q.diagramMode==='source'){const redraw=button('인식 도형으로 전환','button compact quiet',guarded(async()=>{state.project=await api.setPresentation({projectId:state.project.id,problemId:p.id,targetIds:[q.id],diagramMode:'redraw'});renderAll();}));redraw.disabled=sourceOperationsBlocked();footer.append(redraw);}}
  card.append(footer); if(confirmButton)card.append(confirmButton); return card;
}
function showVariantDeletion(problem,question){
 const root=openDialog('유사문제 삭제',problemIndex(problem.id)+'번 원문 · 변형 '+(problem.variants.findIndex(q=>q.id===question.id)+1));
 root.append(element('p','','이 유사문제를 목록과 Word 출력 대상에서 삭제합니다. 원문과 다른 유사문제는 유지합니다.'));
 const actions=element('div','dialog-actions'),remove=button('삭제','button primary',guarded(async()=>{if(sourceOperationsBlocked())return;remove.disabled=true;state.project=await api.deleteVariant({projectId:state.project.id,problemId:problem.id,questionId:question.id});$('mainDialog').close();state.editor=null;renderAll();}));remove.id='confirmDeleteVariant';actions.append(button('취소','button outline',()=>$('mainDialog').close()),remove);root.append(actions);
}
function showVariantRegeneration(problem,question){
 const projectId=state.project.id,problemId=problem.id;
 const root=openDialog('유사문제 재생성',problemIndex(problemId)+'번 원문 · 변형 '+(problem.variants.findIndex(q=>q.id===question.id)+1));
 root.append(element('p','','선택한 유사문제를 바탕으로 새 문제 1개와 정답·상세 풀이를 만듭니다. 기존 문항은 보존하며 새 문항은 검토 후 Word에 포함할 수 있습니다.'));
 root.classList.add('regeneration-form');const label=element('label','regeneration-field','난이도'),level=element('select');level.id='regenerationDifficulty';label.htmlFor=level.id;
 for(const [value,text] of [['same','현재 유사문제와 동일'],...['하','중하','중','중상','상'].map(x=>[x,x])]){const option=element('option','',text);option.value=value;level.append(option);}label.append(level);root.append(label);
 const extraLabel=element('label','regeneration-field','추가 요청사항 (선택)'),extra=element('textarea');extra.id='variantRegenerationRequest';extra.rows=4;extra.maxLength=4000;extra.placeholder='예: 계산은 간단하게, 보조선을 찾아야 풀리는 중상 난이도로 만들어 주세요.';extraLabel.htmlFor=extra.id;extraLabel.append(extra);root.append(extraLabel,element('p','editor-hint','직접 입력한 요청을 기존 규칙과 난이도 선택보다 우선 적용합니다. 충돌하지 않는 규칙은 유지합니다.'));
 const start=button('유사문제 재생성','button primary',guarded(async()=>{
  if(state.project.id!==projectId||selected()?.id!==problemId){toast('선택한 문제가 바뀌었습니다. 해당 문제에서 다시 실행하세요.',true);return;}
  if(sourceOperationsBlocked())return;
  start.disabled=true;const difficulty=level.value;$('mainDialog').close();
  await sendMessage('선택한 유사문제를 바탕으로 새 문제 1개를 재생성해 주세요.','suggestion',{task:'generation',regenerateOf:question.id,targetIds:[question.id],difficulty,regenerationInstructions:extra.value.trim(),variant:question.provenance?.variant||'numeric_only'});
 }));start.id='startVariantRegeneration';const actions=element('div','dialog-actions');actions.append(button('취소','button outline',()=>$('mainDialog').close()),start);root.append(actions);level.focus();
}
function showSolutionRegeneration(problem,question){
 const projectId=state.project.id,problemId=problem.id,questionId=question.id;
 const variantIndex=problem.variants.findIndex(q=>q.id===questionId);
 const root=openDialog('풀이 재생성',`${problemIndex(problemId)}번 원문${question.kind==='variant'?' · 유사문제 '+(variantIndex+1):''}`);
 root.append(element('p','','현재 선택한 모델로 정답과 상세 풀이를 다시 작성합니다. 문제와 그림은 유지하며 이전 풀이는 이력에 보관합니다.'));
 const label=element('label','retry-feedback','추가 요청사항 (선택)'),input=element('textarea');input.id='solutionRegenerationRequest';input.rows=4;input.maxLength=4000;input.placeholder='예: 닮음 대신 삼각형의 합동을 이용해 풀어 주세요. 보조선을 긋는 이유도 자세히 설명해 주세요.';label.append(input);root.append(label);
 root.append(element('p','editor-hint','추가 요청을 기존 프롬프트보다 최우선으로 적용하고, 충돌하는 규칙만 이번 풀이에서 제외합니다. 비워 두면 기본 규칙으로 다시 작성합니다.'));
 const status=element('p','editor-hint');status.setAttribute('role','status');root.append(status);
 const start=button('요청 반영 · 풀이 재생성','button primary',guarded(async()=>{
  if(state.project.id!==projectId||selected()?.id!==problemId){status.textContent='선택한 문제가 바뀌었습니다. 창을 닫고 해당 문제에서 다시 실행해 주세요.';return;}
  if(sourceOperationsBlocked())return;
  start.disabled=true;
  const extra=input.value.trim();
  const text='이 문항의 본문과 그림은 유지하고 정답·상세 풀이를 새로 작성해 검산해 주세요.';
  $('mainDialog').close();
  await sendMessage(text,'solve',{task:'solve',targetIds:[questionId],solutionInstructions:extra,force:true});
 }));start.id='startSolutionRegeneration';
 const cancel=button('취소','button outline',()=>$('mainDialog').close());cancel.id='cancelSolutionRegeneration';root.append(start,cancel);input.focus();
}
function showGenerationWarning(problem,text,kind,options){
 const sourceVersion=problem.recognition?.version,projectId=state.project.id;
 const root=openDialog('오류가 남아 있는 원문으로 생성','유사문제 생성 안내');
 root.append(element('p','','확인 필요 항목이나 오류를 무시하고 유사문제를 만들 수 있습니다. 기존 원문과 오류 기록은 유지되며 생성 문항은 검토 필요 상태로 저장됩니다. 연결 실패나 불완전한 응답은 무시할 수 없습니다.'));
 const list=element('ul');for(const e of visibleErrors().filter(e=>e.problemId===problem.id))list.append(element('li','',e.text));root.append(list);
 root.append(button('원문 확인·교정','button outline',()=>showSourceReview(problem,()=>sendMessage(text,kind,options),null,{generationRequest:{text,kind,options}})));
 const proceed=button('오류를 무시하고 생성','button primary',guarded(async()=>{
  if(state.project.id!==projectId||selected()?.id!==problem.id)throw Error('선택한 문제가 바뀌었습니다. 다시 생성을 눌러 주세요.');
  $('mainDialog').close();await sendMessage(text,kind,{...options,allowUnverifiedGeneration:true,overrideSourceVersion:sourceVersion});
 }));proceed.id='generateIgnoringErrors';proceed.disabled=!problem.recognition?.body?.trim();root.append(proceed,button('취소','button quiet',()=>$('mainDialog').close()));
}
function showSourceReview(problem,onReady=null,focusKey=null,{solveAfter=!batchUI?.isOriginalReview(),generationRequest=null}={}){
 const projectId=state.project.id,problemId=problem.id,r=problem.recognition;
 const root=openDialog((r?.uncertainties?.length?'확인할 원문 조건':'원문 판독 확인')+' · 문제 '+problemIndex(problem.id),'원인과 다음 작업');
 root.append(element('p','',generationRequest?'원문과 대조하여 미확인 항목을 확인하세요. 유사문제 생성은 아래 별도 버튼으로 계속할 수 있습니다.':'원문과 대조하여 필요한 항목만 입력하세요. 나머지 확인 항목을 무시하고 원문 풀이를 작성할 수 있습니다. 조건·수치가 잘못되었다면 직접 교정하거나 전체 다시 인식할 수 있습니다.'));
 if(problem.original){root.append(mathInto(element('div','question-body'),problem.original.body));appendRecoveryActions(root,problem,problem.original);}
 const stale=!r||r.sourceStale||r.rulesStale;
 if(stale)root.append(element('p','review-notice','원문 또는 인식 규칙이 변경되었습니다. 선택 영역과 아래 인식 내용을 대조하세요. 잘못된 내용은 직접 교정하고, 현재 내용이 맞으면 검토 완료를 누르세요.'));
 const inputs=[];
 for(const [index,issue] of (r?.uncertainties||[]).entries()){
  const item=element('div','source-review-item');item.append(element('p','',issue.text),element('small','muted',issue.location?.description||''));
  const note=element('textarea');note.className='source-issue-note';note.placeholder='확인 근거 (선택). 예: 본문에 같은 길이가 명시되어 있어 흐린 빗금은 조건에 사용하지 않음';note.maxLength=2000;
  item.append(note);root.append(item);inputs.push({index,note});if(focusKey===issueKey(issue)){item.classList.add('focused-issue');requestAnimationFrame(()=>{if(!note.isConnected)return;item.scrollIntoView({block:'center'});if(!root.contains(document.activeElement)||document.activeElement===$('closeDialog'))note.focus({preventScroll:true});});}
 }
 const status=element('p','editor-hint');status.id='sourceReviewStatus';root.append(status);root.append(element('p','editor-hint','필요한 칸에만 입력하세요. 입력한 설명은 다음 작업에 반영하고, 빈칸의 항목은 미확인 상태로 무시하여 진행합니다. 무시한 항목은 검증 완료로 처리하지 않습니다.'));
 const submit=button(onReady?'원문 검토 완료 후 계속':solveAfter?'원문 검토 완료 · 풀이 작성':'원문 검토 완료','button primary',guarded(async()=>{
  if(state.project?.id!==projectId||selected()?.id!==problemId)throw Error('선택한 문제가 바뀌었습니다.');
  const resolutions=inputs.filter(v=>v.note.value.trim()).map(v=>({index:v.index,note:v.note.value.trim()}));
  submit.disabled=true;
  try{
   if(resolutions.length)state.project=await api.resolveSourceIssues({projectId,problemId,sourceVersion:r.version,resolutions});
   const current=selected().recognition;if(current.uncertainties.length)state.project=await api.ignoreSourceIssues({projectId,problemId,sourceVersion:current.version,keys:current.uncertainties.map(issueKey)});
   $('mainDialog').close();const success=await confirmAndSolve(selected(),{reviewed:true,confirmOnly:!solveAfter});if(onReady&&success===true)await onReady();
  }finally{submit.disabled=!r;}
 }));submit.id='confirmSourceReview';submit.disabled=!r;
 const retry=button('전체 다시 인식','button outline',guarded(async()=>{ $('mainDialog').close();if(r)await showRecognitionRetry(problem,'all');else await sendMessage(recognitionPrompt,'recognition',{task:'recognition'});}));retry.id='reviewRetryAll';
 root.append(submit,retry);
 if(r?.body){const proceed=button(generationRequest?'오류를 무시하고 유사문제 생성':solveAfter?'오류를 무시하고 풀이 작성':'확인 항목을 무시하고 검토 완료','button outline',()=>{if(generationRequest)showGenerationWarning(problem,generationRequest.text,generationRequest.kind,generationRequest.options);else submit.click();});proceed.id='continueSourceIgnoringErrors';root.append(proceed);}
 if(!r?.uncertainties?.length&&!stale)root.append(element('p','editor-hint',solveAfter?'현재 구체적인 미확인 조건은 없습니다. 인식한 원문을 확인하면 정답·풀이를 자동 작성합니다.':'검토 완료 후 하단 전체 풀이 생성 버튼으로 풀이를 모아서 작성하세요.'));
 if(problem.original)root.append(button('원문 직접 교정','button outline',()=>{$('mainDialog').close();state.view='original';state.editor=problem.original.id;renderAll();}));
 root.append(button('닫기','button quiet',()=> $('mainDialog').close()));
}
async function confirmAndSolve(problem,options={}){
 const projectId=state.project.id;state.project=await api.confirmSource({projectId,problemId:problem.id,reviewed:!!options.reviewed,sourceVersion:problem.recognition?.version});renderAll();
 if(selected()?.id!==problem.id)return false;
 if(options.confirmOnly||batchUI?.isOriginalReview()||(!options.force&&problem.original?.answer&&problem.original?.solution&&!problem.original?.solutionStale&&!problem.original?.solutionDraft))return true;
 const completed=await sendMessage('확인된 원문의 정답과 상세 풀이를 작성하고 검산해 주세요.','solve',{task:'solve',targetIds:[problem.original.id],reuseSolution:true,force:false,...options});
 if(selected()?.id===problem.id){state.view='original';renderAll();}return completed;
}
async function showRecognitionRetry(problem, target='diagram') {
  if(sourceOperationsBlocked()) return;
  const projectId=state.project.id,problemId=problem.id;
  const root=openDialog(target==='all'?'전체 다시 인식':target==='diagram'?'도형만 다시 그리기':'문장만 다시 인식하기','문제 '+problemIndex(problemId),'recognition-retry-modal');
  root.append(element('p','',(target==='all'?'선택 영역의 문장·그림·조건을 모두 다시 인식합니다. 이전 미확인 항목은 새 인식 결과로 갱신합니다.':target==='diagram'?'본문·선택지·정답·풀이·기존 조건을 유지하고 도형만 다시 그립니다.':'도형·좌표·도형 조건을 유지하고 본문 문장과 선택지만 다시 인식합니다.')+' 기존 결과는 이력에 보관하며 관련 문항은 재검토 대상으로 표시합니다.'));
  const fields=element('div','retry-model-fields');
  function field(id,label){const row=element('label','',label),select=element('select');select.id=id;row.append(select);fields.append(row);return select;}
  function option(select,value,label,disabled=false){const o=element('option','',label);o.value=value;o.disabled=disabled;select.append(o);}
  const vendor=field('retryProvider','AI 연결'),model=field('retryModel','모델'),effort=field('retryEffort','추론 수준');
  option(vendor,'codex','GPT · Codex');option(vendor,'gemini','Gemini · Antigravity',geminiAccess!=='subscribed');option(vendor,'claude','Claude');vendor.value=provider;
  const note=element('label','retry-feedback','다시 확인할 부분 (선택)'),feedback=element('textarea');feedback.id='retryFeedback';feedback.rows=3;feedback.maxLength=2000;feedback.placeholder=target==='diagram'?'예) 22도를 도형밖으로 빼서 안내선으로 이어줘.':'예: 둘째 줄의 분모와 부등호를 다시 확인해 주세요.';note.append(feedback);
  const status=element('p','editor-hint');status.setAttribute('role','status');
  const cancel=button('취소','button outline',()=> $('mainDialog').close());cancel.id='cancelRecognitionRetry';
  const start=button(target==='all'?'선택한 모델로 전체 인식':target==='diagram'?'선택한 모델로 다시 그리기':'선택한 모델로 문장 인식','button primary');start.id='startRecognitionRetry';
  const angleHint=element('p','editor-hint','예) 22도를 도형밖으로 빼서 안내선으로 이어줘. 추가 요청이 없으면 각도 숫자는 안쪽에 둡니다. 요청과 충돌하는 기본 지침만 이번 다시 그리기에서 제외합니다.');angleHint.id='retryAngleHint';angleHint.hidden=target!=='diagram';
  root.append(fields,note,angleHint,status,cancel,start);
  let catalog=[],loading=false,requesting=false,sequence=0;
  const isOpen=()=>root.contains(start)&&$('mainDialog').open;
  function updateEffort(){
    const old=effort.value;effort.replaceChildren();const meta=catalog.find(m=>modelKey(m)===model.value);
    const supported=vendor.value==='gemini'?(meta?[{reasoningEffort:meta.effort}]:[]):supportedEfforts(meta);
    for(const item of supported)option(effort,item.reasoningEffort,effortLabel(item.reasoningEffort));
    const saved=vendor.value==='claude'?claudeSettings:vendor.value==='gemini'?geminiSettings:state.aiSettings;
    effort.value=supported.some(x=>x.reasoningEffort===old)?old:supported.some(x=>x.reasoningEffort===saved.effort)?saved.effort:meta?.defaultReasoningEffort||supported[0]?.reasoningEffort||'';
    effort.disabled=loading||requesting||vendor.value==='gemini';
    start.disabled=loading||requesting||!model.value||!effort.value;
  }
  async function loadModels(){
    const token=++sequence,chosen=vendor.value;loading=true;model.disabled=true;start.disabled=true;status.textContent='사용 가능한 모델 확인 중…';
    try {
      if(chosen==='claude'){const account=await api.claudeAccount();if(token!==sequence||!isOpen())return;if(!account.available)throw Error(account.error);claudeState=account;catalog=account.models;}
      else if(chosen==='gemini') {const account=await api.geminiAccount();if(token!==sequence||!isOpen())return;if(!account.available)throw Error(account.error||'Gemini 연결을 확인해 주세요.');geminiState=account;catalog=account.models;}
      else {catalog=state.models.filter(imageModel);if(!catalog.length){const account=await api.account();if(token!==sequence||!isOpen())return;catalog=(account.models||[]).filter(imageModel);state.models=account.models||[];}}
      if(token!==sequence||!isOpen())return;
      model.replaceChildren();for(const m of catalog)option(model,modelKey(m),m.displayName||modelKey(m));
      const saved=chosen==='claude'?claudeSettings:chosen==='gemini'?geminiSettings:state.aiSettings;if(catalog.some(m=>modelKey(m)===saved.model))model.value=saved.model;
      status.textContent=catalog.length?'매번 새 인식 요청을 보냅니다. 재시도에도 선택한 서비스의 사용량이 적용됩니다.':'사용 가능한 모델이 없습니다. 사이드바에서 계정 연결을 확인해 주세요.';
    } catch(error){if(token!==sequence||!isOpen())return;catalog=[];model.replaceChildren();status.textContent=errorText(error);}
    finally {if(token===sequence&&isOpen()){loading=false;model.disabled=!catalog.length;updateEffort();}}
  }
  vendor.addEventListener('change',loadModels);model.addEventListener('change',updateEffort);effort.addEventListener('change',updateEffort);
  start.addEventListener('click',guarded(async()=>{
    if(loading||requesting||start.disabled||sourceOperationsBlocked())return;
    if(state.project.id!==projectId||selected()?.id!==problemId)throw Error('선택한 문제가 바뀌었습니다. 다시 시도해 주세요.');
    const chosen=vendor.value,selection={model:model.value,effort:effort.value},extra=feedback.value.trim();
    manualProviderChoice=true;selectingStartupProvider=false;
    requesting=true;state.savingAi=true;start.disabled=vendor.disabled=model.disabled=effort.disabled=cancel.disabled=true;$('closeDialog').disabled=true;
    const preventClose=event=>event.preventDefault();$('mainDialog').addEventListener('cancel',preventClose);updateControls();
    try {
      const saved=chosen==='claude'?claudeSettings:chosen==='gemini'?geminiSettings:state.aiSettings;
      if(selection.model!==saved.model||selection.effort!==saved.effort){if(chosen==='claude')claudeSettings=await api.saveClaudeSettings(selection);else if(chosen==='gemini')geminiSettings=await api.saveGeminiSettings(selection);else {state.aiSettings=await api.saveAiSettings(selection);state.aiDraft=null;}}
      manualProviderChoice=true;selectingStartupProvider=false;provider=chosen;
    } catch(error){status.textContent=errorText(error);return;}
    finally {requesting=false;state.savingAi=false;vendor.disabled=cancel.disabled=false;$('closeDialog').disabled=false;$('mainDialog').removeEventListener('cancel',preventClose);model.disabled=!catalog.length;updateEffort();renderAiControls();renderGemini();}
    $('mainDialog').close();
    const retryResult=await sendMessage(recognitionPrompt+(extra&&target!=='diagram'?'\n다시 확인할 부분: '+extra:''),'recognition',{task:'recognition',recognitionTarget:target,userInstructions:extra,...(target==='diagram'?{angleLabelLeaders:'auto',additionalInstructions:extra}:{}),force:true,acceptReplacement:true});
    if(retryResult!==false&&state.project.id===projectId&&selected()?.id===problemId){state.view='original';renderAll();}
  }));
  // Focus once before asynchronous model discovery. Native window/WebContents
  // refocusing on pointerdown can interrupt an IME composition after typing starts.
  feedback.focus({preventScroll:true});
  await loadModels();
}
function showDeleteFigure(p,q,figureId,label){
 if(sourceOperationsBlocked())return;
 const root=openDialog('그림 삭제',label);
 root.append(element('p','','이 그림을 문제 화면과 출력물에서 삭제할까요? 본문·정답·풀이는 유지됩니다. 원본 시험지 파일은 삭제하지 않습니다.'));
 const actions=element('div','dialog-actions'),remove=button('그림 삭제','button primary',guarded(async()=>{
  if(sourceOperationsBlocked())return;remove.disabled=true;
  try{state.project=await api.setPresentation({projectId:state.project.id,problemId:p.id,targetIds:[q.id],deleteFigureId:figureId});$('mainDialog').close();renderAll();}finally{remove.disabled=false;}
 }));remove.id='confirmDeleteFigure';actions.append(button('취소','button outline',()=>$('mainDialog').close()),remove);root.append(actions);
}
function makeQuestionFlow(q,p,materials,editable=false,number){let figure;if(q.hiddenFigureIds?.includes('diagram'))figure=null;else if(q.diagramMode==='source'){figure=element('img','source-figure-image');figure.alt='선택한 원본 그림';if(q.sourceFigureDataUrl)figure.src=q.sourceFigureDataUrl;else if(p)void api.readSourceFigure({projectId:state.project.id,problemId:p.id,questionId:q.id}).then(url=>{if(figure.isConnected&&url)figure.src=url;}).catch(e=>{figure.alt='원본 그림을 읽지 못했습니다. 영역을 다시 지정하세요.';toast(errorText(e),true);});}else figure=diagramSvg(globalThis.ExamDiagramLayout.questionDiagram(q));const flow=questionFlow({question:q,materials,editable,number,element,mathInto,statementBoxNode,diagramNode:figure,blocked:sourceOperationsBlocked,onDelete:(figureId,label)=>showDeleteFigure(p,q,figureId,label),onMove:guarded(async(figureId,slot)=>{if(sourceOperationsBlocked())return;state.project=await api.setPresentation({projectId:state.project.id,problemId:p.id,targetIds:[q.id],figureId,slot});renderAll();toast('그림 위치를 저장했습니다. Word·PDF에도 같은 순서로 적용됩니다.');})});
 if(editable&&p){const controls=element('div','structure-controls'),picker=element('select');picker.setAttribute('aria-label','문항 출력 방식');for(const [value,label] of [['auto','자동'],['normal','일반'],['structure','구조 보존']]){const option=element('option','',label);option.value=value;option.disabled=value==='structure'&&!q.layoutDocument;picker.append(option);}picker.value=q.layoutMode||'auto';picker.disabled=sourceOperationsBlocked();picker.addEventListener('change',guarded(async()=>{state.project=await api.setPresentation({projectId:state.project.id,problemId:p.id,targetIds:[q.id],layoutMode:picker.value});renderAll();toast('저장된 데이터로 출력 방식을 바꿨습니다. AI 호출 없음.');}));controls.append(picker,element('span','editor-hint',globalThis.ExamStructuredLayout.status(q).message));if(q.diagramMode==='source'||materials.length)controls.append(element('span','editor-hint','원본 이미지 사용 · 필기 잔존 가능성을 확인하세요.'));for(const note of globalThis.ExamStructuredLayout.warnings(q))controls.append(element('span','editor-hint',note));flow.prepend(controls);}
 return flow;}
function questionBodyNode(text){const node=element('div','question-body');for(const part of globalThis.ExamQuestionPresentation.subparts(text))node.append(mathInto(element('div','subquestion-part'),part));return node;}
function statementBoxNode(items){const box=element('div','statement-box');for(const text of items)box.append(mathInto(element('div'),text));return box;}
function choicesNode(choices,layout) { const root = element('div', 'question-choices'+(layout==='vertical'?' vertical-choices':'')); choices.forEach((choice, index) => { const row = element('div', 'question-choice'); row.append(element('span', '', symbols[index] || `${index + 1}.`), mathInto(element('span'), String(choice).replace(/^[①②③④⑤⑥⑦⑧]\s*/, ''))); root.append(row); }); return root; }
function questionEditor(q) { const form = element('form', 'editor-form'); const controls = {}; for (const [key, label, value] of [['body', '문제 본문', q.body], ['statementBox','보기 상자 · ㄱ. ㄴ. 기호 포함, 한 줄에 하나씩',(q.statementBox||[]).join('\n')], ['choices', '정답 선택지 · 한 줄에 하나씩', (q.choices || []).join('\n')], ['answer', '정답', q.answer], ['solution', '상세 풀이', q.solution]]) { const id = `edit-${q.id}-${key}`; const lab = element('label', '', label); lab.htmlFor = id; const input = element('textarea', key === 'body' ? 'body-input' : ''); input.id = id; input.value = value || ''; input.rows = key === 'solution' ? 6 : key === 'answer' ? 2 : 4; controls[key] = input; form.append(lab, input); }
  form.append(element('p', 'editor-hint', '본문·보기·선택지를 직접 고친 뒤 ‘수정 저장’을 누르세요. 저장 후 검토하여 문서에 포함하면 Word·PDF에 반영됩니다. 수식은 $\\frac{1}{2}$처럼 $로 감싸세요. 별도 줄 수식은 $$…$$를 사용합니다. 도형 변경은 대화로 요청할 수 있습니다.')); const preview = element('div', 'editor-preview'); mathInto(preview, controls.body.value); controls.body.addEventListener('input', () => mathInto(preview, controls.body.value)); form.append(preview); const actions = element('div', 'editor-actions'); actions.append(button('취소', 'button outline compact', () => { state.editor = null; renderWork(); })); const save = button('수정 저장', 'button primary compact'); save.type = 'submit'; actions.append(save); form.append(actions);
  const mode=element('select');mode.id='manualRevisionMode';
  for(const [value,label] of [['correction','인식 오류 교정'],['content','문제 내용 수정본 만들기']]){const option=element('option','',label);option.value=value;mode.append(option);}if(q.kind==='original')form.prepend(mode);
  let recognitionData, initialRecognitionData;
  const p=selected();if(q.kind==='original'&&p.recognition){const details=element('details');details.append(element('summary','','조건·표식·불확실성 교정 (구조화 데이터)'));recognitionData=element('textarea');recognitionData.id='recognitionDataEditor';recognitionData.rows=14;const keys=['body','givens','statementBox','boxSlot','bodyBorder','diagramSlot','choices','conditions','printedAnswer','printedSolution','domains','uncertainties','marks','observedDiagram','materials','layoutDocument'];recognitionData.value=JSON.stringify(Object.fromEntries(keys.map(k=>[k,k==='observedDiagram' ? globalThis.ExamDiagramLayout.questionDiagram({observedDiagram:p.recognition[k]}) : p.recognition[k]])),null,2);initialRecognitionData=recognitionData.value;details.append(recognitionData);form.append(details);}
  form.addEventListener('submit',guarded(async event=>{event.preventDefault();
    const values={body:controls.body.value,statementBox:controls.statementBox.value.split('\n').filter(x=>x.trim()),choices:controls.choices.value.split('\n').filter(x=>x.trim()),answer:controls.answer.value,solution:controls.solution.value};
    state.project=await api.editQuestion({projectId:state.project.id,problemId:p.id,questionId:q.id,mode:mode.value,values,...(recognitionData&&recognitionData.value!==initialRecognitionData?{recognitionData:JSON.parse(recognitionData.value)}:{})});state.editor=null;renderAll();toast('수정 버전을 저장했습니다. 관련 결과를 확인해 주세요.');
  }));return form;

}
async function createManualOriginal() { const p = selected(); if (!p || state.busy) return; p.original = { id: crypto.randomUUID(), kind: 'original', sourceId: p.id, body: '', choices: [], answer: '', solution: '', diagram: null, include: false, layout: 'auto', needsReview: true }; state.editor = p.original.id; renderWork(); }

async function saveProject() { if (!state.project) return; if (state.busy) throw new Error('AI 작업이 끝난 뒤 수정할 수 있습니다.'); state.saving = true; $('saveStatus').textContent = '저장 중…'; updateControls(); try { state.project = await api.saveProject(structuredClone(state.project)); $('saveStatus').textContent = '모든 변경 저장됨';return true; } catch (error) { $('saveStatus').textContent = '저장 실패 · 다시 시도해 주세요'; throw error; } finally { state.saving = false; renderAll(); } }
async function loadProject(project) {
  if (!project) return;
  state.batchSummary='';state.project=project;state.selectedId=project.problems[0]?.id||null;
  state.sourceViews.clear();state.activeSourceId=null;state.page=1;state.zoom=1;
  state.append=false;state.replacement=null;state.view='chat';state.editor=null;state.drafts.clear();$('chatInput').value='';
  const first=project.problems[0]?.regions[0];
  try{await loadSource(regionSourceId(first),first?.page||1);}catch(error){if(!project.assetIssues?.length)throw error;renderAll();}
  if(project.assetIssues?.length)toast('누락된 자료 '+project.assetIssues.length+'개가 있습니다. 나머지 문항은 사용할 수 있습니다. AI 설정 아래 데이터 관리에서 다시 연결하세요.',true);
  $('saveStatus').textContent='모든 변경 저장됨';
}
async function loadSource(sourceId, requestedPage) {
  const source=projectSources().find(s=>s.id===sourceId);
  if(!source)throw Error('원본 파일을 찾을 수 없습니다.');
  document.getElementById('missingSourceNotice')?.remove();
  if(state.activeSourceId && state.sourceSize)state.sourceViews.set(state.activeSourceId,{page:state.page,zoom:state.zoom,fitting:state.fitting,scrollTop:$('viewer').scrollTop});
  const saved=state.sourceViews.get(sourceId);
  state.loading=true;updateControls();
  try {
    // Finish cancellation before another file renders into the shared canvas.
    ++state.renderToken;
    if(state.renderTask){const task=state.renderTask;task.cancel();try{await task.promise;}catch(error){if(error.name!=='RenderingCancelledException')throw error;}state.renderTask=null;}
    if(state.activeSourceId!==sourceId || (!state.pdf && !state.image)) {
      $('pageStage').hidden=true;$('selectionLayer').replaceChildren();
      const oldPdf=state.pdf;state.pdf=null;state.image=null;state.sourceSize=null;state.pages=1;state.activeSourceId=sourceId;
      renderSourceTabs();if(oldPdf)await oldPdf.loadingTask.destroy();
      const asset=await api.readAsset(source.path);
      if(source.type==='pdf') {
        const binary=atob(asset.base64||asset.dataUrl.split(',')[1]);
        state.pdf=await loadPdfDocument(Uint8Array.from(binary,c=>c.charCodeAt(0))).promise;
        state.pages=state.pdf.numPages;
      } else {
        state.image=await loadImage(asset.dataUrl);state.sourceSize={width:state.image.naturalWidth,height:state.image.naturalHeight};
      }
    }
    state.page=Math.min(state.pages,Math.max(1,requestedPage||saved?.page||1));state.zoom=saved?.zoom||1;state.fitting=saved?.fitting??'height';
    await renderPage();$('viewer').scrollTop=requestedPage?0:saved?.scrollTop||0;
  } catch(error){if(state.project?.assetIssues?.some(a=>a.path===source.path)){const note=element('p','review-notice','이 원본 파일이 누락되었습니다. 다른 파일 탭과 저장된 문항은 사용할 수 있습니다. AI 설정 아래 데이터 관리에서 자료를 다시 연결하세요.');note.id='missingSourceNotice';$('viewer').append(note);return;}throw error;} finally { state.loading=false;renderAll(); }
}

function loadImage(src) { return new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('이미지를 열 수 없습니다.')); img.src = src; }); }
async function renderPage() {
  if (!state.pdf && !state.image) return;
  const token = ++state.renderToken;
  if (state.renderTask) { state.renderTask.cancel(); state.renderTask = null; }
  const page = state.pdf ? await state.pdf.getPage(state.page) : null;
  if (token !== state.renderToken) return;
  if (page) { const viewport = page.getViewport({ scale: 1 }); state.sourceSize = { width: viewport.width, height: viewport.height }; }
  $('viewer').classList.toggle('height-fit',state.fitting==='height');
  if (state.fitting) {
    const viewer=$('viewer'),style=getComputedStyle(viewer);
    const width=Math.max(1,viewer.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)-2);
    const height=Math.max(1,viewer.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom)-2);
    state.zoom=state.fitting==='height'?height/state.sourceSize.height:Math.min(2,width/state.sourceSize.width,state.fitting==='page'?height/state.sourceSize.height:Infinity);
  }
  const canvas = $('pageCanvas'), stage = $('pageStage'), dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = state.sourceSize.width * state.zoom, height = state.sourceSize.height * state.zoom;
  let rendered = state.image;
  if (page) {
    const {canvas: buffer, task} = createPdfRender(page, state.zoom, dpr);
    state.renderTask = task;
    try { await task.promise; }
    catch (error) { if (error.name === 'RenderingCancelledException') return; throw error; }
    finally { if (state.renderTask === task) state.renderTask = null; }
    rendered = buffer;
  }
  if (token !== state.renderToken) return;
  // Publish only a complete page. The old display stays intact during rendering.
  canvas.width = Math.ceil(width * dpr); canvas.height = Math.ceil(height * dpr);
  canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
  stage.style.width = `${width}px`; stage.style.height = `${height}px`;
  const ctx = canvas.getContext('2d', {alpha: false, willReadFrequently: true});
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(rendered, 0, 0, canvas.width, canvas.height);
  stage.hidden = false; $('sourceEmpty').hidden = true;
  updateControls(); renderRegions();
}
function normalizedPoint(event) { const rect = $('selectionLayer').getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) }; }
function drawSelection(event) { if (!state.drawing) return; const point = normalizedPoint(event), start = state.drawing.start; const region = { sourceId: state.activeSourceId, page: state.page, x: Math.min(point.x, start.x), y: Math.min(point.y, start.y), width: Math.abs(point.x - start.x), height: Math.abs(point.y - start.y) }; state.drawing.region = region; const box = state.drawing.node; Object.assign(box.style, { left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%` }); }
async function cropRegion(region) { let source = state.image; if (state.pdf) { const page = await state.pdf.getPage(region.page), rendered = createPdfRender(page, 3); await rendered.task.promise; source = rendered.canvas; } const sw = source.naturalWidth || source.width, sh = source.naturalHeight || source.height; const crop = document.createElement('canvas'); const width = region.width * sw, height = region.height * sh; const factor = Math.min(1, 4000 / Math.max(width, height)); crop.width = Math.max(1, Math.round(width * factor)); crop.height = Math.max(1, Math.round(height * factor)); crop.getContext('2d').drawImage(source, region.x * sw, region.y * sh, width, height, 0, 0, crop.width, crop.height); return crop.toDataURL('image/png'); }
function cancelDrawing() {
  const drawing = state.drawing; state.drawing = null;
  if (drawing) { drawing.node.remove(); const layer = $('selectionLayer'); if (layer.hasPointerCapture(drawing.pointerId)) layer.releasePointerCapture(drawing.pointerId); }
  state.append = false; state.replacement = null; state.contextCapture=false; updateControls(); renderRegions();
}
async function finishSelection(event) {
  if (!state.drawing) return; drawSelection(event); const region = state.drawing.region; state.drawing.node.remove(); state.drawing = null;
  if ($('selectionLayer').hasPointerCapture(event.pointerId)) $('selectionLayer').releasePointerCapture(event.pointerId);
  if (region.width * state.sourceSize.width < 20 || region.height * state.sourceSize.height < 20) return;
  state.loading = true; updateControls(); const appendId = state.append ? state.selectedId : undefined; const replacement = state.replacement;
  try {
    const data = await cropRegion(region);
    if ((replacement || !$('collectRegions').checked) && !await confirmRegionSelection(data, region, !!replacement)) return;
    if (replacement) state.project = await api.replaceRegion({ projectId: state.project.id, problemId: replacement.problemId, regionIndex: replacement.regionIndex, region, imageDataUrl: data });
    else state.project = await api.addRegion({ projectId: state.project.id, ...(appendId ? { problemId: appendId } : {}), region:state.contextCapture?{...region,role:'context'}:region, imageDataUrl: data });
    state.selectedId = replacement?.problemId || appendId || state.project.problems[state.project.problems.length - 1].id; state.view = 'chat'; state.append = false; state.replacement = null;
    $('chatInput').value = state.drafts.get(state.selectedId) || ''; renderAll();
  } finally { state.loading = false; updateControls(); }
  if(state.contextCapture){state.contextCapture=false;state.view='original';renderAll();toast('공통 자료를 추가했습니다. 재인식 또는 풀이 재시도 시 함께 전달합니다.');return;}
  if (replacement) { promptRegionReview('선택 영역을 바꿨습니다. 기존 대화는 유지됩니다. 새 영역을 다시 인식해 주세요.'); return; }
  if ($('collectRegions').checked) { renderAll(); return; }
  // Recognition returns actual domains in the same request; no classification pre-call.
  await sendMessage(appendId ? '이 문제의 선택 영역을 추가했습니다. 모든 선택 영역을 함께 읽고, 기존 원문 인식 결과를 다시 확인해서 빠진 지문이나 도형 조건을 반영해 주세요. 필기는 원문 조건에서 제외하고 불확실한 부분은 알려 주세요.' : recognitionPrompt, appendId ? 'review' : 'recognition');
}
function confirmRegionSelection(data, region, replacing) {
  const root = openDialog('이 문제 영역이 맞나요?', '선택 영역 확인', 'region-confirm-modal');
  root.append(element('p', '', `${regionLabel(region)} · 지문과 도형 가장자리의 표시가 모두 포함되었는지 확인해 주세요.`));
  const preview = element('img', 'region-confirm-image'); preview.src = data; preview.alt = '방금 선택한 문제 영역'; root.append(preview);
  return new Promise(resolve => {
    let accepted = false;
    $('mainDialog').addEventListener('close', () => resolve(accepted), {once:true});
    const confirm = button(replacing ? '확인 · 영역 교체' : '확인 · 인식하기', 'button primary', () => {accepted = true; $('mainDialog').close();});
    confirm.id = 'confirmRegionSelection';
    const cancel = button('취소 · 다시 선택', 'button outline', () => $('mainDialog').close()); cancel.id = 'cancelRegionSelection';
    root.append(cancel, confirm); cancel.focus();
  });
}
function promptRegionReview(message) { const p = selected(); if (!p) return; const text = '선택한 원본 영역을 수정했습니다. 현재 선택된 모든 영역을 다시 읽고 기존 원문의 지문, 수식, 도형 조건을 바로잡아 주세요. 기존 유사문제와 풀이도 바뀐 원문에 맞는지 확인해 주세요. 손으로 쓴 필기를 원문 조건으로 사용하지 마세요.'; updateControls(); toast(message, false, { label: '다시 인식', run: guarded(async () => { if (selected()?.id !== p.id) await selectProblem(p.id); await sendMessage(text, 'review'); }) }); }
async function beginRegionReplacement(problemId, regionIndex) { if (state.busy || state.saving || state.loading) return; const p = state.project.problems.find((item) => item.id === problemId); const region = p?.regions[regionIndex]; if (!region) return; state.selectedId = problemId; state.replacement = { problemId, regionIndex }; state.append = false; $('mainDialog').close(); await loadSource(regionSourceId(region),region.page); renderAll(); toast(`문제 ${problemIndex(problemId)}의 영역 ${regionIndex + 1}을 바꿉니다. 올바른 범위를 새로 드래그하세요.`); }

async function sendMessage(text, requestKind = '', options = {}) {
 if(!requestKind&&!options.task&&globalThis.ExamQuestionPresentation.presentationOnly(text)){
  const p=selected();if(!p||sourceOperationsBlocked())return false;
  const parsed=globalThis.ExamTaskIntent.infer(text),variants=/유사|변형/.test(text),original=/원문|원본/.test(text),all=/전체|모든/.test(text),number=text.match(/(\d+)\s*번\s*(?:문제|원문)/);
  const problems=all?state.project.problems:number?[state.project.problems[Number(number[1])-1]]:[p];
  if(problems.some(q=>!q))throw Error('지정한 문제 번호가 없습니다.');
  const updates=problems.map(problem=>({problem,targets:Number.isInteger(parsed.variantIndex)?[problem.variants[parsed.variantIndex]]:original?[problem.original]:variants||(!all&&state.view==='variants')?problem.variants:all?[problem.original,...problem.variants].filter(Boolean):[problem.original]}));
  if(!updates.some(u=>u.targets.length)||updates.some(u=>u.targets.some(q=>!q)))throw Error('그림 위치를 바꿀 문항을 먼저 선택하세요.');
  for(const {problem,targets} of updates)if(targets.length)state.project=await api.setPresentation({projectId:state.project.id,problemId:problem.id,targetIds:targets.map(q=>q.id),diagramPosition:globalThis.ExamQuestionPresentation.positionRequest(text),choiceLayout:globalThis.ExamQuestionPresentation.choiceLayoutRequest(text)||undefined,text});
  $('chatInput').value='';state.drafts.delete(p.id);renderAll();return true;
 }
 const requestedProblemId = selected()?.id; if (startupProviderReady && !manualProviderChoice) await startupProviderReady; if (selected()?.id !== requestedProblemId) return; const p = selected(); if (!p || sourceOperationsBlocked() || !text.trim()) return; if(provider==='gemini'&&!geminiState.available){toast(geminiState.error||'Gemini 연결을 확인해 주세요.',true);return false;} if(provider==='codex'&&state.aiDraft&&!state.aiDraft.effort){toast('모델의 추론 수준을 선택해 주세요.',true);return false;} const resolved=workflowUI.request(text.trim(),requestKind,options);if(resolved.needsTaskChoice&&!options.task){const root=openDialog('요청할 작업 확인','입력하신 문장은 그대로 전달합니다');root.append(element('p','',text));for(const [task,label] of [['generation','유사문제 생성'],['revision','원문 수정'],['validation','조건·정답 재검수'],['solve','원문 풀이 작성']])root.append(button(label,'button outline',guarded(()=>{$('mainDialog').close();return sendMessage(text,requestKind,{...options,task});})));return false;}const requestedTask=resolved.task;if(requestedTask==='solve'&&!resolved.autoRecover&&resolved.targetIds.includes(p.original?.id)&&!p.recognition?.confirmed){showSourceReview(p);return false;}if(requestedTask==='generation'&&!options.allowUnverifiedGeneration&&(!sourceReady(p.recognition)||visibleErrors().some(e=>e.problemId===p.id&&!/요청 \d+문항, 반환 \d+문항: 수량 불일치/.test(e.text||'')))){showGenerationWarning(p,text,requestKind,resolved);return false;} state.view = 'chat'; state.editor = null; state.busy = { problemId: p.id, userText: text.trim(), requestKind, stream: '', status: `${modelLabel(currentAiSettings().model)}에 연결하고 있습니다…`, model: currentAiSettings().model, effort: currentAiSettings().effort, canceling: false }; $('chatInput').value = ''; state.drafts.delete(p.id); renderAll(); $('workContent').scrollTop = $('workContent').scrollHeight; try { const result = await api.chat(resolved); if (result?.project) state.project = result.project; $('saveStatus').textContent = '모든 변경 저장됨'; return true; } catch (error) { if (!requestKind) { state.drafts.set(p.id, text); if (state.selectedId === p.id) $('chatInput').value = text; } try { const recovered = await api.openProject(state.project.id); if (recovered) state.project = recovered; } catch {} toast(errorText(error), true, null, {projectId:state.project.id,problemId:p.id}); return false; } finally { const usedGemini = provider === 'gemini'; state.busy = null; renderAll(); if (usedGemini) void refreshGeminiUsage(); if (state.selectedId === p.id && state.view === 'chat') $('workContent').scrollTop = $('workContent').scrollHeight; } }
function openDialog(title, eyebrow, className = '') { const dialog = $('mainDialog'); dialog.className = `modal ${className}`; $('dialogTitle').textContent = title; $('dialogEyebrow').textContent = eyebrow; $('dialogBody').replaceChildren();$('dialogBody').classList.remove('regeneration-form'); if (!dialog.open) dialog.showModal(); return $('dialogBody'); }
async function showCrops() { const p = selected(); if (!p) return; const root = openDialog(`문제 ${problemIndex(p.id)} · 선택한 원본`, 'ORIGINAL CAPTURE'); root.append(element('p', '', '범위가 잘못되었다면 해당 영역을 다시 지정하세요. 문제별 대화는 그대로 유지되며, 수정 후 다시 인식할 수 있습니다.')); const list = element('div', 'crop-list'); root.append(list); for (let i = 0; i < p.cropPaths.length; i++) { const figure = element('figure'), caption = element('figcaption', 'crop-caption'); caption.append(element('span', '', `${regionLabel(p.regions[i])} · 영역 ${i + 1}`)); const replace = button('이 영역 다시 지정', 'button compact outline', guarded(() => beginRegionReplacement(p.id, i))); const remove = button('이 영역 선택 취소', 'button compact quiet danger-text', guarded(async () => {
      const finalRegion = p.regions.length === 1;
      if (!window.confirm(finalRegion ? '마지막 선택 영역입니다. 삭제하면 이 문제의 대화, 원문, 유사문제도 함께 삭제됩니다. 문제 전체를 삭제할까요?' : `영역 ${i + 1}을 삭제할까요? 다른 선택 영역과 이 문제의 대화는 유지됩니다.`)) return;
      state.project = await api.removeRegion({ projectId: state.project.id, problemId: p.id, regionIndex: i }); state.replacement = null;
      if (!state.project.problems.some((item) => item.id === state.selectedId)) state.selectedId = state.project.problems[0]?.id || null;
      $('mainDialog').close(); renderAll();
      if (finalRegion) toast('문제와 마지막 선택 영역을 삭제했습니다.'); else promptRegionReview('영역을 삭제했습니다. 남은 영역으로 원문을 다시 인식해 주세요.');
    })); replace.disabled = remove.disabled = !!state.busy || state.saving || state.loading; caption.append(replace, remove); figure.append(caption); const asset = await api.readAsset(p.cropPaths[i]); const img = element('img'); img.src = asset.dataUrl; img.alt = `문제 ${problemIndex(p.id)} 원본 영역 ${i + 1}`; figure.append(img); list.append(figure); } }
function showManageProblems(){
 const root=openDialog('문제 순서 관리','문제 번호는 변경한 순서대로 다시 매깁니다');root.append(element('p','','문제를 잡아 원하는 위치로 드래그하세요. 각 원문 뒤의 유사문제와 풀이도 함께 이동합니다.'));
 const sort=button('시험지 앞에서부터 정렬','button outline',guarded(async()=>{if(sourceOperationsBlocked())return;const before=[...state.project.problems];const anchor=p=>p.regions.find(r=>r.role!=='context')||p.regions[0]||{page:Infinity,y:Infinity,x:Infinity};state.project.problems.sort((a,b)=>{const x=anchor(a),y=anchor(b);const order=r=>projectSources().findIndex(s=>s.id===regionSourceId(r));return order(x)-order(y)||x.page-y.page||x.y-y.y||x.x-y.x;});try{await saveProject();showManageProblems();}catch(e){state.project.problems=before;renderAll();throw e;}}));sort.id='sortProblemsBySource';sort.title='파일 탭 순서 → 페이지 → 위에서 아래 → 같은 높이에서는 왼쪽에서 오른쪽';root.append(sort);
 state.project.problems.forEach((p,index)=>{const row=element('div','manage-row'),text=element('div','manage-text');bindProblemDrag(row,p.id,showManageProblems);row.append(element('span','drag-handle','⠿'));text.append(element('strong','',`문제 ${index+1}`),element('p','',p.original?.body||`${regionLabel(p.regions[0])} · 인식 대기`));row.append(text);
 for(const [title,dir] of [['↑',-1],['↓',1]]){const move=button(title,'button compact outline',guarded(async()=>{await moveProblemTo(p.id,state.project.problems[index+dir].id);showManageProblems();}));move.setAttribute('aria-label',dir<0?'앞으로 이동':'뒤로 이동');move.disabled=index+dir<0||index+dir>=state.project.problems.length;row.append(move);}
 row.append(button('삭제','button compact quiet danger-text',guarded(async()=>{if(!window.confirm(`문제 ${index+1}의 선택 영역, 대화, 유사문제를 삭제할까요?`))return;state.project=await api.removeProblem({projectId:state.project.id,problemId:p.id});if(state.selectedId===p.id)state.selectedId=state.project.problems[0]?.id||null;renderAll();showManageProblems();})));root.append(row);});
}

async function showPreview(){
 state.documentBusy=true;updateControls();
 const root=openDialog('시험지 미리보기','PDF와 동일한 페이지','preview-modal');
 const status=element('p','preview-note','출력 페이지를 만들고 있습니다…');root.append(status);
 let pdf,loadingTask;
 try{
  const result=await api.previewDocument({projectId:state.project.id,renderPdf:true});
  if(!status.isConnected||!$('mainDialog').open)return;
  loadingTask=loadPdfDocument(Uint8Array.from(atob(result.pdfBase64),c=>c.charCodeAt(0)));pdf=await loadingTask.promise;
  status.textContent=`PDF 저장과 동일한 배치 · ${pdf.numPages}쪽 · 본문 ${result.settings.bodyFont||'맑은 고딕'} ${result.settings.bodyFontSize||12}pt · 풀이 ${result.settings.solutionFont||result.settings.bodyFont||'맑은 고딕'} ${result.settings.solutionFontSize||9}pt. Word·한글은 해당 프로그램의 페이지 나눔에 따라 차이가 있을 수 있습니다.`;
  for(let n=1;n<=pdf.numPages;n++){
   if(!status.isConnected||!$('mainDialog').open)break;
   const page=await pdf.getPage(n),{canvas,task}=createPdfRender(page,1.5);canvas.className='pdf-preview-page';canvas.setAttribute('aria-label',`미리보기 ${n}쪽`);
   await task.promise;page.cleanup();if(status.isConnected&&$('mainDialog').open)root.append(canvas);
  }
 }catch(error){status.textContent='미리보기를 만들지 못했습니다. '+errorText(error);throw error;}
 finally{try{await loadingTask?.destroy();}finally{state.documentBusy=false;updateControls();}}
}
function showExportSelection(format='docx'){
 const projectId=state.project.id,root=openDialog((format==='pdf'?'PDF':'Word')+'에 포함할 문제 선택','선택한 문항을 검토한 뒤 저장하세요');
 root.append(element('p','','포함할 문항을 선택하세요. 풀이를 완성하지 못했어도 ‘풀이 없이 문제만 포함’으로 저장할 수 있습니다. 미완성 풀이와 오류 기록은 보존됩니다.'));
 const rows=[];
 for(const p of state.project.problems)for(const [index,q] of [p.original,...p.variants].entries())if(q){
  const row=element('div','source-review-item'),label=element('label'),check=element('input');check.type='checkbox';check.className='export-question-choice';check.checked=!!q.include||(q.kind==='variant'&&!q.documentExcluded&&q.approval?.status!=='approved');
  label.append(check,document.createTextNode(' '+problemIndex(p.id)+'번 원문'+(q.kind==='variant'?' · 유사문제 '+index:'')+(q.include?' (포함됨)':' (미포함)')));row.append(label,mathInto(element('div','question-body'),q.body));
  const details=element('details');details.append(element('summary','','정답·풀이 확인'),mathInto(element('div'),q.answer||'정답 미입력'),solutionNode(q));const svg=diagramSvg(globalThis.ExamDiagramLayout.questionDiagram(q));if(svg)details.append(svg);row.append(details);
  if(q.reviewReasons?.length)row.append(element('p','editor-hint',q.reviewReasons.join(' ')));
  const only=element('input');only.type='checkbox';only.className='export-question-only';only.checked=!!q.questionOnlyExport||(!q.solution||!!q.solutionDraft)&&q.approval?.method!=='manual_user_authorized';const onlyLabel=element('label');onlyLabel.append(only,document.createTextNode(' 풀이 없이 문제만 포함 (답지는 미생성으로 표시)'));row.append(onlyLabel);const status=element('p','review-notice');status.hidden=true;row.append(status);root.append(row);rows.push({p,q,check,status,only});
 }
 const status=element('p','editor-hint');root.append(status);
 const save=button('선택한 문항 검토 완료 · '+(format==='pdf'?'PDF':'Word')+' 저장','button primary',async()=>{
  if(state.project.id!==projectId)return;save.disabled=true;
  try{
   if(!rows.some(r=>r.check.checked)){status.textContent='저장할 문항을 하나 이상 선택하세요.';return;}
   for(const r of rows){r.status.hidden=true;{try{state.project=r.check.checked&&r.only.checked?await api.includeWithoutSolution({projectId,problemId:r.p.id,questionId:r.q.id}):await api.approveQuestion({projectId,problemId:r.p.id,questionId:r.q.id,approved:r.check.checked});}catch(e){r.status.hidden=false;r.status.textContent=errorText(e);status.textContent='표시된 문항을 수정하거나 선택을 해제한 뒤 저장해 주세요.';return;}}}
   $('mainDialog').close();renderAll();await exportDocument(format,true);
  }catch(e){status.textContent=errorText(e);}finally{save.disabled=false;renderAll();}
 });save.id='saveSelectedWord';root.append(save,button('취소','button quiet',()=>$('mainDialog').close()));
}
async function exportDocument(format,reviewed=false) { if(['docx','pdf'].includes(format)&&!reviewed&&(!includedQuestions().length||projectQuestions().some(q=>q.kind==='variant'&&!q.documentExcluded&&(!q.include||q.needsReview)))){showExportSelection(format);return;} state.documentBusy = true; updateControls(); $('saveStatus').textContent = format === 'hwpx' ? 'HWPX 만드는 중…' : format==='pdf'?'PDF 만드는 중…':'Word 문서 만드는 중…'; try { const result = await api.exportDocument({ projectId: state.project.id, format, audience: 'teacher' }); if (!result) return; if(result.success===false||result.format!==format)throw new Error(result.error||'요청한 형식으로 파일을 저장하지 못했습니다.'); const body = openDialog(result.format === 'hwpx' ? '한글 HWPX를 저장했습니다' : result.format==='pdf'?'PDF를 저장했습니다':'Word 문서를 저장했습니다', 'EXPORT COMPLETE'); body.append(element('p', '', result.path)); if (result.warnings?.length) { const warning = element('div', 'review-notice'); for (const text of result.warnings) warning.append(element('div', '', text)); body.append(warning); } body.append(button('저장한 문서 열기', 'button primary', guarded(() => api.openPath(result.path)))); body.append(button('닫기', 'button outline', () => $('mainDialog').close())); } finally { state.documentBusy = false; $('saveStatus').textContent = '모든 변경 저장됨'; updateControls(); } }
let paperForms;
function renderAccount() {
  const ai = state.busy || currentAiSettings(), isGemini = String(ai.model).startsWith('gemini-');
  const isClaude=provider==='claude';const connected = isClaude?claudeState.available:isGemini ? geminiState.available : !!state.account;
  $('accountDot').className = `status-dot ${connected ? 'connected' : 'warning'}`;
  $('accountLabel').textContent = `${modelLabel(ai.model) || (isGemini ? 'Gemini' : 'GPT')} · ${ai.effort || ''}${state.busy ? ' · 추론 중' : ''}`;
  $('accountButton').title = `${isClaude?'Claude':isGemini ? 'Gemini' : 'GPT · Codex'} · ${ai.model || '모델 선택 필요'} · ${state.busy ? '현재 요청에 사용 중' : '다음 요청에 사용'}`;
}
function renderCodexUsage() {
  const root = $('codexUsage'); root.replaceChildren();
  if (!state.account) { root.textContent = state.accountError || 'GPT 계정 연결이 필요합니다.'; return; }
  for(const {label,remaining,resetsAt} of codexUsageWindows(state.rateLimits)){
    const group=element('div','usage-bucket');
    group.append(element('div','',`${label} · ${remaining===null?'사용량 정보 미제공':`${Math.round(remaining)}% 남음`}`));
    if(remaining!==null){const meter=element('progress');meter.max=100;meter.value=remaining;meter.setAttribute('aria-label',`${label} 남은 사용량`);group.append(meter);}
    if(Number.isFinite(resetsAt))group.append(element('small','',`초기화: ${new Date(resetsAt*1000).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}`));
    root.append(group);
  }
}
async function refreshAccount({force=false}={}) {
  apiRequired(); let result;const beforeModels=JSON.stringify(state.models),beforeError=state.accountError;
  try { result = await api.account({force}); state.account = result.account || null; if(Array.isArray(result.models)&&(!result.error||result.models.length))state.models = result.models; state.accountError = result.error || ''; state.rateLimits = result.rateLimits || null; }
  catch (error) { result = { account: null, models: [], rateLimits: null, error: errorText(error) }; state.accountError = result.error; state.rateLimits = null; }
  renderAccount();if(beforeModels!==JSON.stringify(state.models)||beforeError!==state.accountError)renderAiControls();renderCodexUsage();return result;
}
async function selectStartupProvider() {
  try {
    let codex;
    try { codex = await boundedAccountCheck(refreshAccount); }
    catch (error) { codex = { account: null, models: [], error: errorText(error) }; }
    if (manualProviderChoice || state.busy) return;
    const reason = preferGeminiReason(codex, state.aiSettings.model);
    if (!reason || geminiAccess !== 'subscribed') return;
    let status;
    try { status = await boundedAccountCheck(() => api.geminiAccount()); }
    catch (error) { status = { available: false, models: [], buckets: [], error: errorText(error) }; }
    if (manualProviderChoice || state.busy) return;
    geminiState = status;
    const model = selectGeminiModel(status, geminiSettings.model);
    if (!model) {
      toast(reason + ' Gemini 자동 선택을 완료하지 못했습니다. ' + (status.error || 'Gemini 설치·로그인·사용량을 확인해 주세요.'), true, { label: 'Gemini 연결 확인', run: guarded(() => refreshGemini(true)) });
      return;
    }
    // Validate the model through the existing IPC; do not rewrite valid preferences.
    let settings = geminiSettings;
    if (model !== geminiSettings.model) {
      state.savingAi = true; updateControls();
      try { settings = await boundedAccountCheck(() => api.saveGeminiSettings({ model })); }
      finally { state.savingAi = false; updateControls(); }
    }
    if (manualProviderChoice || state.busy) return;
    geminiSettings = settings; provider = 'gemini';
    toast(reason + ' Gemini를 자동 선택했습니다.');
  } catch (error) { if (!manualProviderChoice) toast('AI 자동 선택을 완료하지 못했습니다. ' + errorText(error), true); }
  finally { selectingStartupProvider = false; renderGemini(); }
}
async function refreshClaude(activate=false) {
  manualProviderChoice=true;selectingStartupProvider=false;state.savingAi=true;updateControls();
  try{claudeState=await api.claudeAccount();if(activate)provider='claude';}
  finally{state.savingAi=false;renderGemini();renderAccount();}
  return claudeState;
}
function showClaudeAccount(){
  manualProviderChoice=true;
  const root=openDialog('Claude 로그인·계정','AI 계정 연결');
  const status=element('p','account-state',claudeState.error||(claudeState.available?'Claude 계정 연결됨':'로그인 후 연결 확인을 눌러 주세요.'));
  const progress=element('p','editor-hint');progress.id='accountActionStatus';progress.setAttribute('role','status');
  root.append(status,element('p','editor-hint','별도 Claude 설치 없이 공식 연결 파일을 준비합니다. 로그인 창과 브라우저에서 Claude Code를 사용할 수 있는 구독 계정으로 로그인하세요. API 키로 자동 전환하지 않습니다.'),element('p','editor-hint','이 컴퓨터의 Claude Code와 로그인을 공유합니다. 로그아웃·계정 전환은 같은 계정을 사용하는 Claude Code에도 적용됩니다. 모델 이용 가능 여부와 사용 한도는 계정에 따라 다릅니다.'),progress);
  const actions=element('div','dialog-actions');root.append(actions);
  for(const [action,label] of [['login','로그인'],['logout','로그아웃'],['switch','계정 전환']]){
    const control=button(label,'button '+(action==='login'?'primary':'outline'),guarded(async()=>{
      if(sourceOperationsBlocked())return;
      if(action!=='login'&&!window.confirm('공유 중인 Claude 계정을 로그아웃'+(action==='switch'?'하고 전환':'')+'할까요?'))return;
      state.savingAi=true;updateControls();for(const b of actions.querySelectorAll('button'))b.disabled=true;
      progress.textContent='Claude 계정 연결을 준비하고 있습니다…';
      try{const result=await api.accountAction({provider:'claude',action});claudeState={...claudeState,available:false,error:''};progress.textContent=result.message||'Claude 로그인 창과 브라우저에서 로그인을 마친 뒤 연결 확인을 눌러 주세요.';status.textContent=progress.textContent;}
      catch(error){progress.textContent='계정 연결 실패: '+errorText(error);}
      finally{state.savingAi=false;renderGemini();renderAccount();for(const b of actions.querySelectorAll('button'))b.disabled=false;}
    }));control.id='account-'+action;actions.append(control);
  }
  const check=button('연결 확인','button outline',guarded(async()=>{for(const b of actions.querySelectorAll('button'))b.disabled=true;try{await refreshClaude(false);status.textContent=claudeState.error||(claudeState.available?'Claude 계정 연결됨':'로그인이 필요합니다.');progress.textContent='';}finally{for(const b of actions.querySelectorAll('button'))b.disabled=false;}}));check.id='account-check';actions.append(check);
}
function showAccount(target = 'codex') {
  if(target==='claude'){showClaudeAccount();return;}
  const gemini = target === 'gemini', root = openDialog(gemini ? 'Gemini 로그인·계정' : 'GPT 로그인·계정', 'AI 계정 연결');
  manualProviderChoice = true;
  const status = element('p', 'account-state', gemini ? (geminiState.available ? 'Google 계정 연결됨' : geminiState.error || '로그인 후 연결 확인을 눌러 주세요.') : (state.account?.type === 'chatgpt' ? 'ChatGPT 로그인됨 · ' + (state.account.email || state.account.planType || '') : state.accountError || 'ChatGPT 로그인이 필요합니다.'));
  const progress = element('p', 'editor-hint'); progress.id='accountActionStatus';
  progress.setAttribute('role','status');progress.setAttribute('aria-live','polite');
  const loginFallback=element('div');loginFallback.id='loginFallback';loginFallback.hidden=true;
  const loginAddress=element('input');loginAddress.id='loginAddress';loginAddress.readOnly=true;loginAddress.style.width='100%';loginAddress.setAttribute('aria-label','공식 ChatGPT 로그인 주소');loginAddress.addEventListener('click',()=>loginAddress.select());
  loginFallback.append(element('p','editor-hint','브라우저가 열리지 않으면 아래 주소를 클릭해 Ctrl+C로 복사한 뒤, 이 컴퓨터의 브라우저 주소창에 붙여 넣으세요. 로그인을 마칠 때까지 문제공방을 켜 두세요.'),loginAddress);
  root.append(status,element('p','editor-hint',gemini ? '별도 Antigravity 설치는 필요 없습니다. 처음에는 공식 연결 파일을 자동으로 내려받은 뒤 Gemini 로그인 창과 기본 브라우저를 엽니다. 이미 로그인되어 있으면 계정을 재사용합니다. 다른 계정은 계정 전환을 선택하세요.' : 'ChatGPT 구독 계정으로 로그인합니다. 이미 로그인되어 있으면 계정을 재사용합니다. 다른 계정은 계정 전환을 선택하세요.'),element('p','editor-hint','이 컴퓨터의 Codex 또는 Antigravity와 로그인 정보를 공유합니다. 로그아웃·계정 전환은 같은 로그인을 쓰는 다른 프로그램에도 영향을 줄 수 있습니다. 브라우저에서 원하는 계정을 직접 선택하세요.'),progress);
  const actions=element('div','dialog-actions');
  for(const [action,label] of [['login','로그인'],['logout','로그아웃'],['switch','계정 전환']]){
    const control=button(label,'button '+(action==='login'?'primary':'outline'),guarded(async()=>{
      if(sourceOperationsBlocked()){progress.textContent='다른 작업이 진행 중입니다. 작업이 끝나거나 전체 중지한 뒤 로그인해 주세요.';return;}
      if(action!=='login'&&!window.confirm('공유 중인 '+(gemini?'Google':'ChatGPT')+' 계정을 로그아웃'+(action==='switch'?'하고 다른 계정으로 전환':'')+'할까요?'))return;
      state.savingAi=true;updateControls();for(const node of actions.querySelectorAll('button'))node.disabled=true;
      loginFallback.hidden=true;loginAddress.value='';progress.textContent=action==='logout'?'로그아웃을 처리하고 있습니다…':'로그인 연결을 준비하고 있습니다. 잠시 기다려 주세요…';
      try{
        const result=await api.accountAction({provider:target,action});
        if(!gemini&&result?.authUrl){loginAddress.value=result.authUrl;loginFallback.hidden=false;}
        if(gemini){geminiState={available:false,models:[],buckets:[],error:'계정 변경 후 연결 확인을 눌러 주세요.'};renderGemini();progress.textContent=action==='login'?'Gemini 로그인 창에서 로그인을 마치고 돌아와 연결 확인을 눌러 주세요.':'Gemini 로그인 창에서 로그아웃을 완료하세요. 계정 전환 중 다시 로그인 창이 열리지 않으면 로그인 버튼을 누르세요. 완료 후 연결 확인을 눌러 주세요.';}
        else {state.account=null;state.models=[];state.rateLimits=null;state.accountError='';renderAccount();renderAiControls();progress.textContent=action==='logout'?'ChatGPT에서 로그아웃했습니다.':'브라우저에서 원하는 계정으로 로그인한 뒤 연결 확인을 눌러 주세요.';}
        status.textContent=progress.textContent;
        if(result?.opened===false&&result.message){progress.textContent=result.message;status.textContent=result.message;}
      }catch(error){
        progress.textContent='계정 연결 실패: '+errorText(error)+(gemini?' 인터넷 연결과 Gemini 로그인 상태를 확인해 주세요.':' 문제공방 폴더 전체를 압축 해제했는지 확인하고 다시 시도해 주세요.');
        status.textContent='로그인이 완료되지 않았습니다.';
      }finally{state.savingAi=false;updateControls();for(const node of actions.querySelectorAll('button'))node.disabled=false;}
    }));control.id='account-'+action;actions.append(control);
  }
  const check=button('연결 확인','button outline',guarded(async()=>{if(gemini){if(geminiAccess!=='subscribed'){showGeminiAccessSettings();return;}await refreshGemini(false);}else await refreshAccount({force:true});showAccount(target);}));check.id='account-check';actions.append(check);root.append(actions,loginFallback);
  if(gemini)root.append(button('설치·로그인 안내','button quiet',guarded(()=>api.openGeminiGuide())),button('구독 상태 설정','button quiet',showGeminiAccessSettings));
}

function renderGemini() {
  $('claudeControls').hidden=provider!=='claude';$('claudeModel').value=claudeSettings.model;$('claudeEffort').value=claudeSettings.effort;$('claudeStatus').textContent=claudeState.error||(claudeState.available?'Claude 연결됨 · 사용량은 Claude 계정에서 확인':'로그인 후 연결 확인을 눌러 주세요.');
  $('codexControls').hidden = provider !== 'codex'; $('geminiControls').hidden = provider !== 'gemini';
  document.querySelector('.gemini-access-row').hidden = provider !== 'gemini';
  for (const [id, key] of [['codexTab','codex'],['geminiTab','gemini'],['claudeTab','claude']]) { $(id).className = `button compact ${provider === key ? 'primary' : 'outline'}`; $(id).setAttribute('aria-selected', String(provider === key)); }
  const models = $('geminiModel'); models.replaceChildren();
  for (const model of geminiState.models) { const option = element('option', '', model.displayName+(model.available===false?' · 한도 소진':'')); option.value = model.model; option.disabled=model.available===false; models.append(option); }
  models.value = geminiSettings.model;
  $('geminiStatus').textContent = geminiState.error || geminiState.usageWarning || (geminiState.available ? 'Google 계정 연결됨' : '연결 확인을 눌러 주세요.');
  const usage = $('geminiUsage'); usage.replaceChildren();
  for (const [windowId, label] of [['5h','5시간'],['weekly','주간']]) {
    const activeModel=geminiState.models.find(m=>m.model===geminiSettings.model);
    const bucket = (activeModel?.buckets||geminiState.buckets || []).find(b=>b.window===windowId);
    const row = element('div','usage-bucket');
    const remaining = Number.isFinite(bucket?.remaining_fraction) ? Math.round(Math.max(0,Math.min(1,bucket.remaining_fraction))*100) : null;
    row.append(element('strong','',`${label} · ${remaining === null ? '사용량 정보 미제공' : `${remaining}% 남음`}`));
    if (remaining !== null) {const bar=element('progress');bar.max=100;bar.value=remaining;bar.setAttribute('aria-label',`${label} 남은 사용량`);row.append(bar);}
    usage.append(row);
  }
  updateControls();
}
async function refreshGeminiUsage() {
  try {geminiState = await api.geminiAccount(); renderGemini();}
  catch (error) {geminiState = {...geminiState,buckets:[],error:'사용량 확인 실패: '+errorText(error)};renderGemini();}
}
async function refreshGemini(activate = false) {
  manualProviderChoice = true; selectingStartupProvider = false;
  state.savingAi = true; updateControls();
  try {
    geminiState = await api.geminiAccount();
    if (!geminiState.available) { if (geminiAccess !== 'subscribed') provider = 'codex'; renderGemini(); window.alert(geminiState.error || 'Gemini 연결을 확인해 주세요.'); return; }
    const model = selectGeminiModel(geminiState, geminiSettings.model);
    if (model && model !== geminiSettings.model) geminiSettings = await api.saveGeminiSettings({model});
    if (activate) provider = 'gemini';
  } finally { state.savingAi = false; renderGemini(); }
}
async function saveGeminiSubscription(requested) {
    manualProviderChoice = true; selectingStartupProvider = false;
    const previous = geminiAccess;
    state.savingAi = true; updateControls();
    try {
      geminiAccess = await api.saveGeminiAccess(requested);
      if (geminiAccess !== 'subscribed') {
        provider = 'codex'; geminiState = await api.geminiAccount();
        toast(geminiState.error + ' GPT 탭을 선택했습니다.');
      } else {
        geminiState = { available: false, models: [], buckets: [], error: '' };
      }
    } catch (error) { geminiAccess = previous; throw error; }
    finally { state.savingAi = false; renderGemini(); }
    if (geminiAccess === 'subscribed') await refreshGemini(!!preferGeminiReason({account:state.account,models:state.models,rateLimits:state.rateLimits},state.aiSettings.model));
}
function showGeminiAccessSettings() {
  const root=openDialog('Gemini 연결·구독 설정','GEMINI');
  root.append(element('p','','결제 여부는 자동 조회되지 않습니다. 본인의 구독 상태를 선택해 주세요.'));
  const select=$('geminiAccess').cloneNode(true);select.id='geminiAccessDialog';select.disabled=false;select.value=geminiAccess;root.append(select);
  const save=button('저장 · 연결 확인','button primary',guarded(async()=>{const value=select.value;$('mainDialog').close();await saveGeminiSubscription(value);}));save.id='saveGeminiAccessDialog';root.append(save);
}
function wireGeminiEvents() {
  $('claudeAccountSettings').addEventListener('click',showClaudeAccount);
  $('claudeTab').addEventListener('click',()=>{manualProviderChoice=true;selectingStartupProvider=false;provider='claude';renderGemini();renderAccount();});
  $('checkClaude').addEventListener('click',guarded(()=>refreshClaude(false)));
  for(const id of ['claudeModel','claudeEffort'])$(id).addEventListener('change',guarded(async()=>{state.savingAi=true;updateControls();try{claudeSettings=await api.saveClaudeSettings({model:$('claudeModel').value,effort:$('claudeEffort').value});}finally{state.savingAi=false;renderGemini();renderAccount();}}));
  $('codexAccountSettings').addEventListener('click', () => showAccount('codex'));
  $('geminiAccountSettings').addEventListener('click', () => showAccount('gemini'));
  $('geminiAccess').addEventListener('change', guarded(() => saveGeminiSubscription($('geminiAccess').value)));
  $('geminiTab').addEventListener('click', guarded(() => refreshGemini(true)));
  $('checkGemini').textContent = 'Gemini 연결·설정';
  $('checkGemini').addEventListener('click', guarded(() => geminiAccess === 'subscribed' ? refreshGemini(false) : showGeminiAccessSettings()));
  $('codexTab').addEventListener('click', () => { manualProviderChoice = true; selectingStartupProvider = false; provider = 'codex'; renderGemini(); });
  $('refreshCodexUsage').addEventListener('click', guarded(()=>refreshAccount({force:true})));
  const refreshModelsAutomatically=()=>{if(api&&provider==='codex'&&!state.busy&&document.visibilityState==='visible')void refreshAccount().catch(()=>{});};
  $('aiModel').addEventListener('focus',refreshModelsAutomatically);window.addEventListener('focus',refreshModelsAutomatically);document.addEventListener('visibilitychange',refreshModelsAutomatically);setInterval(refreshModelsAutomatically,300000);
  $('geminiGuide').addEventListener('click', guarded(() => api.openGeminiGuide()));
  $('geminiModel').addEventListener('change', guarded(async () => {
    const model=$('geminiModel').value; state.savingAi=true; updateControls();
    try { geminiSettings=await api.saveGeminiSettings({model}); } finally { state.savingAi=false; renderGemini(); }
  }));
  $('classifyProblem').addEventListener('click', guarded(classifySelected));
}
async function classifySelected() {
    const p=selected(); if(!p || sourceOperationsBlocked()) return;
    const ai=currentAiSettings(); state.busy={problemId:p.id,status:'문제 파트를 분류하고 있습니다…',model:ai.model,effort:ai.effort}; renderAll();
    try { const result=await api.classifyProblem({projectId:state.project.id,problemId:p.id,provider}); state.project=result.project; toast(`${result.part ? '파트를 지정했습니다.' : '인식된 복수 영역을 적용합니다.'} ${result.reason}`); }
    finally { state.busy=null; renderAll(); }
  }
async function showPromptSettings() { await workflowUI.showSettings(); }

function wireEvents() { $('clearErrors').addEventListener('click',guarded(()=>removeErrorEntries(visibleErrors())));
  regionEditor=installRegionEditor({api,state,$,element,button,openDialog,guarded,toast,errorText,blocked:sourceOperationsBlocked,updateControls,renderAll,renderRegions,selectProblem,cropRegion,getProvider:()=>provider,ready:async()=>{if(startupProviderReady&&!manualProviderChoice)await startupProviderReady;}});
  workflowUI = installWorkflowUI({api,state,$,element,button,openDialog,guarded,toast,renderAll,selected,getProvider:()=>provider});
  installExamQueueUI({api,state,element,button,openDialog,guarded,toast,loadProject,loadSource,renderAll,selectProblem,getProvider:()=>provider,ready:async()=>{if(startupProviderReady)await startupProviderReady;}});
  bankUI=installBankUI({getProvider:()=>provider,renderQuestion:async(p,q)=>{const node=element('div','bank-question-preview');const materials=await api.readMaterials({projectId:state.project.id,problemId:p.id,questionId:q.id});node.append(makeQuestionFlow(q,p,materials,false));if(q.choices?.length)node.append(choicesNode(q.choices,q.choiceLayout));const solution=element('details');solution.append(element('summary','','정답·풀이'),mathInto(element('div'),q.answer||'정답 없음'),solutionNode(q));node.append(solution);return node;},api,state,$,element,button,openDialog,renderAll,loadProject,workflowUI,blocked:sourceOperationsBlocked,toast});
  batchUI = installBatchUI({api,state,$,element,button,openDialog,guarded,toast,renderAll,selectProblem,workflowUI,currentAiSettings,sourceReady,visibleErrors,errorText,showSourceReview,ready:async()=>{
    if(startupProviderReady&&!manualProviderChoice)await startupProviderReady;
    if(sourceOperationsBlocked())return false;
    if(state.editor){toast('편집 내용을 저장하거나 편집을 닫은 뒤 실행하세요.');return false;}
    if(provider==='gemini'&&!geminiState.available){toast(geminiState.error||'Gemini 연결을 확인해 주세요.',true);return false;}
    if(provider==='codex'&&state.aiDraft&&!state.aiDraft.effort){toast('모델의 추론 수준을 선택해 주세요.',true);return false;}return true;
  }});
  installUpdateUI({api,state,element,button,openDialog,blocked:sourceOperationsBlocked,saveProject});
  installMaintenanceUI({api,state,element,button,openDialog,guarded,toast,loadProject,renderAll,blocked:sourceOperationsBlocked});
  $('promptSettingsButton').addEventListener('click', guarded(showPromptSettings));
  $('problemPart').addEventListener('change', guarded(async () => {
    const p = selected(); if (!p || sourceOperationsBlocked()) return;
    const part = $('problemPart').value; state.saving = true; updateControls();
    try { state.project = await api.setProblemPart({ projectId: state.project.id, problemId: p.id, part }); toast('문제 파트를 저장했습니다. 다음 요청부터 적용됩니다.'); }
    finally { state.saving = false; renderAll(); }
  }));
  wireGeminiEvents();
  workflowUI.wireScope();
  $('resetWorkspace').addEventListener('click',confirmNewWorkspace);
  wireFileDrop(); const importSource = guarded(() => importProjectWith(() => api.importSource({projectId:state.project?.id}))); $('importSource').addEventListener('click', importSource); $('addSourceTab').addEventListener('click', importSource); $('emptyImport').addEventListener('click', importSource); $('newProject').addEventListener('click',guarded(()=>importProjectWith(()=>api.importSource()))); $('openProject').addEventListener('click', guarded(() => importProjectWith(() => api.openProject())));
  $('aiModel').addEventListener('change', guarded(async () => { manualProviderChoice = true; selectingStartupProvider = false; await changeAiModel(); })); $('aiEffort').addEventListener('change', guarded(async () => { const model = (state.aiDraft || state.aiSettings).model, effort = $('aiEffort').value; if (!supportedEfforts(modelMetadata(model)).some((item) => item.reasoningEffort === effort)) { renderAiControls(); throw new Error('선택한 모델에서 지원하는 추론 수준을 선택해 주세요.'); } state.aiDraft = { model, effort }; await persistAiSettings(state.aiDraft); }));
  $('projectTitle').addEventListener('change', guarded(async () => { if (!state.project) return; state.project.title = $('projectTitle').value.trim() || '나의 수학 시험지'; await saveProject(); }));
  $('previousPage').addEventListener('click', guarded(async () => { if (state.page > 1) { state.page--; await renderPage(); $('viewer').scrollTop = 0; } })); $('nextPage').addEventListener('click', guarded(async () => { if (state.page < state.pages) { state.page++; await renderPage(); $('viewer').scrollTop = 0; } })); $('pageNumber').addEventListener('change', guarded(async () => { state.page = Math.min(state.pages, Math.max(1, Math.round(Number($('pageNumber').value) || 1))); await renderPage(); $('viewer').scrollTop = 0; }));
  $('edgePreviousPage').addEventListener('click', () => $('previousPage').click()); $('edgeNextPage').addEventListener('click', () => $('nextPage').click());
  $('zoomIn').addEventListener('click', guarded(async () => { if(sourceZoomBlocked())return; state.fitting = false; state.zoom = Math.min(4, state.zoom * 1.2); await renderPage(); })); $('zoomOut').addEventListener('click', guarded(async () => { if(sourceZoomBlocked())return; state.fitting = false; state.zoom = Math.max(.1, state.zoom / 1.2); await renderPage(); })); $('fitWidth').addEventListener('click', guarded(async () => { if(sourceZoomBlocked())return; state.fitting = 'width'; await renderPage(); })); $('fitPage').addEventListener('click', guarded(async () => { if(sourceZoomBlocked())return; state.fitting = 'page'; await renderPage(); $('viewer').scrollTop=0; $('viewer').scrollLeft=0; }));
  $('fitHeight').addEventListener('click', guarded(async () => { if(sourceZoomBlocked())return; state.fitting = 'height'; await renderPage(); $('viewer').scrollTop=0; $('viewer').scrollLeft=0; }));
  $('viewer').addEventListener('wheel', (event) => { if (!(event.ctrlKey || event.metaKey) || sourceZoomBlocked()) return; event.preventDefault(); state.fitting = false; state.zoom = Math.min(4, Math.max(.1, state.zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1))); guarded(renderPage)(); }, { passive: false });
  $('collectRegions').addEventListener('change',updateControls); $('cancelSelection').addEventListener('reset-mode',()=>{state.append=false;state.replacement=null;state.contextCapture=false;updateControls();renderRegions();}); $('deleteSelection').addEventListener('click',guarded(async()=>{const p=selected();if(!p||!window.confirm('선택한 문제와 대화·유사문제를 삭제할까요?'))return;state.project=await api.removeProblem({projectId:state.project.id,problemId:p.id});state.selectedId=state.project.problems[0]?.id||null;renderAll();}));
  $('selectionLayer').addEventListener('pointerdown', (event) => { if (event.button !== 0 || sourceOperationsBlocked() || !state.sourceSize) return; const node = element('div', 'region-box pending'); $('selectionLayer').append(node); state.drawing = { start: normalizedPoint(event), node, region: null, pointerId: event.pointerId }; $('selectionLayer').setPointerCapture(event.pointerId); drawSelection(event); updateControls(); event.preventDefault(); }); $('selectionLayer').addEventListener('pointermove', drawSelection); $('selectionLayer').addEventListener('pointerup', guarded(finishSelection)); $('selectionLayer').addEventListener('pointercancel', () => { if (state.drawing) state.drawing.node.remove(); state.drawing = null; updateControls(); });
  $('cancelSelection').addEventListener('click', guarded(async () => { if (state.drawing || state.append || state.replacement) cancelDrawing(); else await showCrops(); }));
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { if (state.drawing || state.replacement || state.append) cancelDrawing(); } }); document.querySelectorAll('.view-tab').forEach((tab) => tab.addEventListener('click', () => setView(tab.dataset.view)));
  $('viewCrop').addEventListener('click', guarded(showCrops)); $('manageProblems').addEventListener('click', showManageProblems); $('closeDialog').addEventListener('click', () => $('mainDialog').close()); $('mainDialog').addEventListener('click', (event) => { if (event.target === $('mainDialog')) { const rect = $('mainDialog').getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('mainDialog').close(); } });
  $('chatInput').addEventListener('input', () => { const p = selected(); if (p) state.drafts.set(p.id, $('chatInput').value); $('chatInput').style.height = 'auto'; $('chatInput').style.height = `${Math.min(110, $('chatInput').scrollHeight)}px`; updateControls(); }); $('chatInput').addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('chatForm').requestSubmit(); } }); $('chatForm').addEventListener('submit', guarded(async (event) => { event.preventDefault(); await sendMessage($('chatInput').value); })); $('cancelChat').addEventListener('click', guarded(async () => { if(regionEditor?.isRunning()){await regionEditor.cancel();return;} if(state.batch){await batchUI.cancel();return;} if (!state.busy) return; state.busy.canceling = true; state.busy.status = '생성을 중지하고 있습니다…'; updateControls(); await api.cancelChat({ problemId: state.busy.problemId }); }));
  paperForms=installPaperForms({getProject:()=>state.project,saveProject,openDialog,guarded,showPreview}); $('problemTabsPrevious').addEventListener('click',()=>$('problemTabs').scrollBy({left:-240,behavior:'smooth'}));$('problemTabsNext').addEventListener('click',()=>$('problemTabs').scrollBy({left:240,behavior:'smooth'}));$('problemTabs').addEventListener('wheel',e=>{const n=$('problemTabs');if(n.scrollWidth>n.clientWidth&&Math.abs(e.deltaY)>Math.abs(e.deltaX)){e.preventDefault();n.scrollLeft+=e.deltaY;}},{passive:false});$('showQuestionLabels').addEventListener('change',guarded(async()=>{state.project.settings.showQuestionLabels=$('showQuestionLabels').checked;await saveProject();}));$('layoutSetting').addEventListener('change', guarded(async () => { state.project.settings.layout = $('layoutSetting').value; await saveProject(); })); $('spaceSetting').addEventListener('change', guarded(async () => { state.project.settings.workspaceLines = Number($('spaceSetting').value); await saveProject(); })); for(const [id,key] of [['bodyFontSetting','bodyFont'],['bodyFontSizeSetting','bodyFontSize'],['solutionFontSetting','solutionFont'],['solutionFontSizeSetting','solutionFontSize']])$(id).addEventListener('change',guarded(async()=>{state.project.settings[key]=key.endsWith('FontSize')?Number($(id).value):$(id).value;await saveProject();})); $('previewDocument').addEventListener('click', guarded(showPreview)); $('exportPdf').addEventListener('click', guarded(() => exportDocument('pdf'))); $('exportDocx').addEventListener('click', guarded(() => exportDocument('docx'))); $('exportHwp').addEventListener('click', guarded(() => exportDocument('hwpx'))); $('accountButton').addEventListener('click', () => showAccount(provider));
  let resizeTimer; new ResizeObserver(() => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (state.fitting && state.sourceSize && !state.loading) guarded(renderPage)(); }, 140); }).observe($('viewer'));
  api?.onEvent((event) => { if(event.type==='claude-setup'){const progress=document.getElementById('accountActionStatus');if(progress)progress.textContent=event.text;$('claudeStatus').textContent=event.text;} if(event.type==='gemini-setup'){const progress=document.getElementById('accountActionStatus');if(progress)progress.textContent=event.text;const status=document.getElementById('geminiStatus');if(status)status.textContent=event.text;}  if(event.type==='errors-resolved'){const ids=new Set(event.ids);state.errors=state.errors.filter(e=>!ids.has(e.id));renderErrors();} if(event.type==='task-error'){state.errors=state.errors.filter(e=>logKey(e)!==logKey(event.entry));state.errors.push(event.entry);renderErrors();} if(['gemini-unavailable','gemini-availability'].includes(event.type)) { geminiState = { ...geminiState, ...event }; renderGemini(); toast(event.error || 'Gemini 연결을 확인해 주세요.',true,null,{projectId:state.project?.id,problemId:event.problemId||selected()?.id}); } if (event.type === 'usage-updated') { state.rateLimits = event.rateLimits; renderCodexUsage(); } if (event.type === 'account-updated') { if (event.rateLimits !== undefined) { state.rateLimits = event.rateLimits; renderCodexUsage(); } if (event.account !== undefined) state.account = event.account; if (Array.isArray(event.models)) state.models = event.models; if (event.error !== undefined) state.accountError = event.error || ''; renderAccount(); renderAiControls(); renderCodexUsage(); if (!Array.isArray(event.models)) guarded(refreshAccount)(); } if (state.busy && event.problemId === state.busy.problemId) { if (event.type === 'chat-status') state.busy.status = event.text || event.status; if (event.type === 'chat-delta') state.busy.stream += event.text || ''; updateControls(); if (state.view === 'chat' && state.selectedId === event.problemId) renderWork(); } });
}
async function boot() { wireEvents(); updateControls(); renderAiControls(); if (!api) { state.accountError = '데스크톱 앱에서 계정 연결을 사용할 수 있습니다.'; renderAccount(); return; } try { const data = await api.boot(); for(const notice of data.notices||[])toast(notice,true); try{state.errors=[...await api.readErrors(),...state.errors];}catch(error){toast('이전 오류 기록을 읽지 못했습니다. '+errorText(error),true);} renderErrors(); if(data.claudeSettings)claudeSettings=data.claudeSettings; if (data.geminiSettings) geminiSettings = data.geminiSettings; geminiAccess = data.geminiAccess || 'unknown'; $('autoClassify').checked = true; state.recent = data.recent || []; state.account = data.account || null; if (typeof data.aiSettings?.model === 'string' && typeof data.aiSettings?.effort === 'string') state.aiSettings = { model: data.aiSettings.model, effort: data.aiSettings.effort }; renderAccount(); renderAiControls(); const recent = $('recentProjects'); if (state.recent.length) { recent.append(element('span', '', '최근 작업')); for (const project of state.recent.slice(0, 3)) { const item = button(project.title, '', guarded(() => importProjectWith(() => api.openProject(project.id)))); item.append(element('span', '', new Date(project.updatedAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }))); recent.append(item); } } if (data.project) await loadProject(data.project); await workflowUI.scopeRefresh(); startupProviderReady = selectStartupProvider(); } catch (error) { selectingStartupProvider = false; toast(errorText(error), true); updateControls(); } }
await boot();
