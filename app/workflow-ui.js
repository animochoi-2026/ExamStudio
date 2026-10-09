import {scopeTreeEditor} from './scope-tree-ui.js';
import './task-intent.js';
export function installWorkflowUI({api,state,$,element,button,openDialog,guarded,toast,renderAll,selected,getProvider}) {
 const tasks={recognition:'원문 인식',generation:'유사문제 생성',revision:'원문 수정',validation:'재검수',solve:'원문 풀이'};
 const parts={integer:'정수',algebra:'대수',geometry:'기하',combinatorics:'조합'};
 let presets=[];
 function select(id,entries){const node=element('select');node.id=id;for(const [key,title] of entries){const option=element('option','',title);option.value=key;node.append(option);}return node;}
 $('chatForm').dataset.workflowReady='true';

 function request(text='',kind='',overrides={}){
  const p=selected(),parsed=globalThis.ExamTaskIntent.infer(text);
  let type=overrides.task||(kind==='recognition'||kind==='review'?'recognition':kind==='suggestion'?'generation':parsed.task);
  let targetIds=overrides.targetIds||[];
  if(!targetIds.length&&Number.isInteger(parsed.variantIndex)) {const q=p?.variants?.[parsed.variantIndex];if(!q)throw Error('지정한 유사문제 번호가 없습니다.');targetIds=[q.id];}
  if(parsed.recognitionTarget==='diagram'&&Number.isInteger(parsed.variantIndex)&&!overrides.task){type='revision';parsed.revisionMode='diagram';parsed.recognitionTarget='all';}
  if(!targetIds.length)targetIds=type==='validation'&&state.view==='variants'?p?.variants?.map(q=>q.id)||[]:p?.original?[p.original.id]:[];
  return{projectId:state.project?.id,problemId:p?.id,provider:getProvider(),task:type||'generation',needsTaskChoice:!type,text,requestKind:kind,requestId:crypto.randomUUID(),variant:type==='generation'?(parsed.variant||'numeric_only'):'',count:1,difficulty:'same',targetIds,revisionMode:parsed.revisionMode||'content',includeImages:false,...parsed,...overrides,task:type||'generation',variant:type==='generation'?(overrides.variant||parsed.variant||'numeric_only'):(overrides.variant||''),recognitionTarget:type==='recognition'?(overrides.recognitionTarget||parsed.recognitionTarget||'all'):'all',targetIds,count:type==='generation'?globalThis.ExamTaskIntent.generationCount({...overrides,text,requestKind:overrides.requestKind??kind,count:overrides.count??parsed.count}):1,difficulty:type==='generation'?globalThis.ExamTaskIntent.generationDifficulty({...overrides,text,requestKind:overrides.requestKind??kind}):'same'};
 }
 async function scopeRefresh(){const settings=await api.getRulesSettings({projectId:state.project?.id});presets=settings.presets;state.scopePresetId=settings.scopePresetId;const dropdown=$('promptProfile');dropdown.replaceChildren();for(const x of [{id:'',name:state.project?'현재 시험지 범위':'새 시험지 기본 범위'},...presets]){const o=element('option','',x.name);o.value=x.id;dropdown.append(o);}dropdown.value=settings.scopePresetId||'';$('renamePromptProfile').disabled=$('deletePromptProfile').disabled=!settings.scopePresetId;}
 async function chooseScope(){if(state.project)await showScopeDialog('import');}
 async function showScopeDialog(mode='edit'){
  const management=document.querySelector('.scope-manage');if(management)management.open=false;
  const projectId=state.project?.id,settings=await api.getRulesSettings({projectId});
  const root=openDialog(mode==='import'?'시험 범위 선택':mode==='create'?'시험 범위 추가':'시험 범위 설정','출제할 단원을 체크하세요','scope-tree-modal');
  const presetLabel=element('label','','시험 범위 프리셋'),picker=select(mode==='import'?'importScopePreset':'scopePresetPicker',[['','현재 설정'],...settings.presets.map(p=>[p.id,p.name])]);presetLabel.htmlFor=picker.id;picker.value=settings.scopePresetId||'';root.append(presetLabel,picker);
  let nameInput;if(mode==='create'){nameInput=element('input');nameInput.id='profileNameInput';nameInput.placeholder='예: 중2 2학기 중간고사';root.append(element('label','','프리셋 이름'),nameInput);}
  const host=element('div');root.append(host);const editor=scopeTreeEditor({host,scope:settings.scope,element,button});
  picker.addEventListener('change',()=>editor.load(settings.presets.find(p=>p.id===picker.value)?.scope||settings.scope));
  const actions=element('div','scope-tree-actions');
  const apply=button(mode==='import'?'이 범위로 시작':'시험 범위 저장','button primary',guarded(async()=>{
   if(state.project?.id!==projectId)return;
   const scope=editor.read();
   if(mode==='create'||(picker.value&&mode!=='import')){const result=await api.scopePreset({projectId,action:mode==='create'?'create':'update',id:picker.value,scope,name:nameInput?.value});state.project=result.project;}
   else if(picker.value&&!editor.isDirty()){const result=await api.scopePreset({projectId,action:'select',id:picker.value});state.project=result.project;}
   else state.project=await api.saveScope({projectId,scope});
   renderAll();await scopeRefresh();$('mainDialog').close();toast(projectId?'선택한 시험 범위를 적용했습니다.':'새 시험지의 기본 시험 범위를 저장했습니다.');
  }));apply.id=mode==='import'?'confirmImportScope':'saveStructuredScope';
  actions.append(button('기본 범위 선택','button outline',()=>{picker.value='';editor.load(settings.defaultScope);}),apply);root.append(actions);
 }
 async function showSettings(category='production',mode='edit'){
  if(category==='scope')return showScopeDialog(mode);
  const management=document.querySelector('.scope-manage');if(management)management.open=false;
  let settings=await api.getRulesSettings({projectId:state.project?.id});
  const scopeOnly=category==='scope';const root=openDialog(scopeOnly?(mode==='create'?'시험 범위 추가':'시험 범위 설정'):'프롬프트 규칙','선택한 설정만 변경합니다','prompt-settings-modal');
  const tabs=element('div','settings-tabs'),body=element('div');
  for(const [key,title] of (scopeOnly?[]:[['production','문제 생성·수정 규칙'],['recognition','원문 인식 규칙']]))tabs.append(button(title,'button compact outline',()=>draw(key)));
  root.append(tabs,body);
  function draw(key){
   body.replaceChildren();
   const mods=settings.modules.filter(m=>m.editable&&(key==='recognition'?m.id.includes('recognition'):!m.id.includes('recognition')));
   const picker=select('ruleModule',mods.map(m=>[m.id,m.label]));const editor=element('textarea');editor.id='ruleContent';editor.className='rule-content';editor.maxLength=20000;
   const info=element('p','editor-hint'),defaults=element('details');defaults.append(element('summary','','기본 규칙 보기'));const pre=element('pre','request-preview');defaults.append(pre);
   const show=()=>{const m=mods.find(m=>m.id===picker.value);editor.value=m.content;pre.textContent=m.defaultContent;info.textContent=`${m.id} · ${m.version} · ${m.userContent===null?'기본값':'사용자 수정값'} · ${m.tasks.map(t=>tasks[t]).join(' / ')}`;};picker.addEventListener('change',show);show();
   async function persistRule(params){
    const result=await api.saveRule(params);settings={...settings,...result};const failures=[...(result.refresh?.failures||[])];
    if(state.project)try{state.project=await api.openProject(state.project.id);}catch(error){failures.push({projectId:state.project.id,reason:error.message});}
    renderAll();draw(key);toast('선택한 규칙을 저장했습니다.');
    if(failures.length)body.append(element('p','review-notice','규칙 저장은 완료했습니다. 일부 작업 상태를 갱신하지 못했습니다. 해당 작업을 다시 열 때 최신 규칙을 확인합니다. '+failures.map(x=>`${x.projectId||'작업 목록'}: ${x.reason}`).join(' / ')));
   }
   const save=button('선택한 규칙 저장','button primary',guarded(()=>persistRule({id:picker.value,content:editor.value})));save.id='saveRuleModule';
   const reset=button('선택한 규칙 기본값으로','button outline',guarded(()=>persistRule({id:picker.value,reset:true})));reset.id='resetRuleModule';
   body.append(picker,info,editor,defaults,save,reset);
   if(settings.legacy.length){const legacy=element('details');legacy.append(element('summary','','기존 사용자 규칙 원문 보관'),element('p','','역할이 섞인 기존 사용자 규칙은 자동 실행하지 않습니다. 보관한 원문에서 필요한 내용을 위 항목으로 옮겨 저장하세요.'),element('pre','request-preview',JSON.stringify(settings.legacy,null,2)));body.append(legacy);}
  }
  draw(category);
 }
 function wireScope(){
  const change=async params=>{const result=await api.scopePreset({projectId:state.project?.id,...params});state.project=result.project;renderAll();await scopeRefresh();};
  $('promptProfile').addEventListener('change',guarded(()=>change({action:'select',id:$('promptProfile').value})));
  $('editPromptProfile').addEventListener('click',guarded(()=>showSettings('scope')));
  $('addPromptProfile').addEventListener('click',guarded(()=>showSettings('scope','create')));
  for(const [id,action] of [['renamePromptProfile','rename']])$(id).addEventListener('click',()=>{const root=openDialog(action==='create'?'현재 범위 저장':'범위 이름 변경','시험 범위 템플릿');const input=element('input');input.id='profileNameInput';root.append(input,button('저장','button primary',guarded(async()=>{await change({action,id:$('promptProfile').value,name:input.value});$('mainDialog').close();})));});
  $('deletePromptProfile').addEventListener('click',guarded(async()=>{if(window.confirm('범위 템플릿만 삭제할까요? 현재 시험지 범위와 문제는 유지됩니다.'))await change({action:'delete',id:$('promptProfile').value});}));
 }
 return{request,showSettings,scopeRefresh,chooseScope,wireScope};
}
