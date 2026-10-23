import schoolAlias from '../app/school-alias.cjs';
import {appendSchoolGroups} from './school-regions.js';
import {createQuestionReader} from './question-renderer.js';
import {imagePdfCache} from './image-pdf-cache.js';
import model from './past-print-model.cjs';
import forms from '../app/paper-form-model.cjs';
import {paperFormCatalog} from './paper-form-settings.js';
import {scopeTree} from './scope-tree.js';
import {loadingTask} from './loading-task.js';
import {renderPastPrint,renderPastPrintAnswers} from './past-print-render.js';
import {pastPrintPreview} from './past-print-preview.js';
import {setEditGuard} from './edit-guard.js';
import {blobDownload} from './exam-editor.js';
import security from '../app/download-security.cjs';
import {bodyFontRange,validateBodyFont} from './exam-typography.js';
import {figureScalePercent} from './figure-scale.js';
import {outputLifetime} from './output-lifetime.js';
export async function pastPrint(ctx){
 const {root,node,action,field,rpc,reader,config,user,navigate,message,server,client}=ctx;
 let draft=server?{...structuredClone(server.document),id:server.id,version:server.version}:null,rendered=null,busy=false,dirty=false;
 const pdfCache=imagePdfCache({client,config,rpc});
 const previewState={questions:{},answers:{}};
 root.classList.add('past-print');if(root.querySelector(':scope > h2'))root.querySelector(':scope > h2').textContent='직전대비 기출프린트';root.append(node('p','선택한 원본 시험지에서 시험범위에 맞는 문항을 그대로 모읍니다. 같은 내용의 문항도 자동 제거하지 않습니다.','lead'));
 const controls=node('section','','panel'),summary=node('p','','hint'),output=node('section'),preview=node('div','','past-print-preview');root.append(controls,summary,output,preview);
 const reportError=e=>{summary.className='error';summary.textContent=e.message;};
 const run=async(title,task)=>{if(busy)return;busy=true;try{return await loadingTask({root,node,action},title,task);}catch(e){reportError(e);return false;}finally{busy=false;}};
 setEditGuard({dirty:()=>dirty||busy,save:()=>run('기출프린트 저장 중',()=>save())});
 function savedPopup(){const d=node('dialog','','mock-dialog');d.setAttribute('aria-label','기출프린트 저장 완료');d.append(node('h2','저장 완료'),node('strong',draft.title),node('p','내 시험지에서 다시 열 수 있습니다.'));d.append(action('확인',()=>d.close()));d.addEventListener('close',()=>d.remove(),{once:true});root.append(d);d.showModal();}
 async function prepare(next,load,{answersOnly=false,sourceReader=reader,section='all'}={}){return answersOnly&&rendered?.loaded?{...rendered,answers:await renderPastPrintAnswers({draft:next,loaded:rendered.loaded,root,node,current:load.current})}:await renderPastPrint({draft:next,root,node,reader:sourceReader,rpc:(n,a)=>load.wait(signal=>rpc(n,a,{signal})),config,section,progress:(t,n,total)=>load.stage(t+' · '+n+'/'+total+'문항',n,total),wait:p=>load.wait(p),current:load.current});}
 async function generate(next,{answersOnly=false,markDirty=true}={}){return run('기출프린트 생성 중',async load=>{const result=await prepare(next,load,{answersOnly});draft=next;rendered=result;dirty=dirty||markDirty;showOutput();summary.className='hint';summary.textContent='총 '+next.items.length+'문항 · 문제지 '+result.questions.children.length+'쪽(표지 포함) · 정답지 '+result.answers.children.length+'쪽';return true;});}
 function showOutput(){output.replaceChildren();preview.replaceChildren();
  const title=field(output,'프린트 제목',draft.title);title.maxLength=200;title.onchange=async()=>{const value=title.value.trim();if(!value){title.value=draft.title;return;}await generate({...structuredClone(draft),title:value});};
  const mode=node('select');mode.setAttribute('aria-label','정답지 형식');for(const [v,t]of [['quick','빠른정답'],['detailed','정답+풀이']]){const o=node('option',t);o.value=v;mode.append(o);}mode.value=draft.answerMode;mode.onchange=async()=>{const value=mode.value;mode.value=draft.answerMode;await generate({...structuredClone(draft),answerMode:value},{answersOnly:true});};output.append(mode);
  const buttons=node('div','','actions');buttons.append(action('기출프린트 저장',async()=>{if(await run('기출프린트 저장 중',()=>save()))savedPopup();}));
  for(const [key,label]of [['questions','문제지'],['answers','정답지']])buttons.append(action(label+' PDF 저장',async()=>{if(busy)return;busy=true;try{
   if(!await save())return;
   const {exportPdf}=await import('./web-export.js');
   const requestId=crypto.randomUUID();
   await security.officialDownload({rpc,spaceId:config.spaceId,requestId,format:'pdf',revisions:draft.items.map(x=>x.revisionId),kind:'exam',paperId:draft.id,
    generate:securityWatermark=>exportPdf(async()=>{
     const sourceReader=createQuestionReader(client,config),life=outputLifetime(summary.pdfSignal,1200000),load={current:life.current,wait:work=>life.wait(typeof work==='function'?work(life.signal):work),stage:text=>{summary.textContent=text;}};
     try{const fresh=await prepare(draft,load,{sourceReader,section:key});return {pages:fresh[key],timings:fresh.timings,dispose:()=>{life.close();sourceReader.clear();}};}catch(error){life.close();sourceReader.clear();throw error;}
     },draft.title,summary,{download:false,cache:pdfCache,job:{kind:'exam',paperId:draft.id,version:draft.version,part:key,answerMode:draft.answerMode||'quick',requestId,document:structuredClone(draft)},securityWatermark,questionCount:draft.items.length,section:key,answerWatermarks:key==='answers'}),publish:file=>blobDownload(file.name,file.blob)});
  }catch(e){reportError(e);}finally{busy=false;}}));
  buttons.append(action('내 시험지 목록',()=>navigate('exam')));output.append(buttons,node('p','문제지·정답지 PDF는 각각 최신본 1개를 보관합니다. 수정이 없으면 바로 내려받고, 수정 후에는 새 파일 생성에 성공한 뒤 교체합니다.','hint'));
  if(!rendered){preview.append(action('미리보기·편집 열기',()=>generate(draft,{markDirty:false})),node('p','보관된 PDF는 미리보기를 만들지 않고 바로 받을 수 있습니다.','hint'));return;}
  for(const [key,label]of [['questions','문제지 미리보기'],['answers','정답지 미리보기']]){const section=node('details');section.open=key==='questions';section.append(node('summary',label));preview.append(section);if(key==='questions')previewOptions(section);pastPrintPreview({section,pages:rendered[key],node,action,label,state:previewState[key]});}
 }
 function previewOptions(section){
  const panel=node('section','','past-print-options');panel.setAttribute('aria-label','문제지 표시 설정');panel.append(node('h3','문제지 표시 설정'));
  const points=field(panel,'원문 배점 표시','','checkbox');points.checked=!!draft.showOriginalPoints;
  const sizing=node('div','','past-print-sizing'),font=field(sizing,'글자 크기 (pt)',draft.bodyFontSize??10,'number');font.min=bodyFontRange.min;font.max=bodyFontRange.max;font.step=.5;
  const figureLabel=node('label'),figureText=node('span','그림 크기'),figureValue=node('output',(draft.figureScalePercent??100)+'%'),figure=node('input');figure.type='range';figure.min=50;figure.max=150;figure.step=5;figure.value=draft.figureScalePercent??100;figure.setAttribute('aria-label','그림 크기');figure.oninput=()=>{figureValue.value=figure.value+'%';};figureText.append(document.createTextNode(' · '),figureValue);figureLabel.append(figureText,figure);sizing.append(figureLabel);panel.append(sizing,node('p','글자 7~15pt · 그림 50~150%. 적용한 설정은 저장과 PDF 출력에도 반영됩니다.','hint'));
  panel.append(action('미리보기에 적용',async()=>{const next={...structuredClone(draft),bodyFontSize:validateBodyFont(font.value),figureScalePercent:figureScalePercent(figure.value),showOriginalPoints:points.checked};await generate(next);}));section.append(panel);
 }
 async function save(){if(!draft)throw Error('먼저 기출프린트를 생성하세요.');if(draft.version&&!dirty)return true;const result=await rpc('bank_exam_save',{s:config.spaceId,e:draft.id,expected:draft.version||0,doc:draft});draft.version=result.version;dirty=false;if(summary.classList.contains('error')){summary.className='hint';summary.textContent='기출프린트 구성을 저장했습니다.';}message('기출프린트 구성을 저장했습니다. 내 시험지에서 다시 열 수 있습니다.');return true;}
 if(draft){controls.append(node('p','저장한 문항 버전·순서·시험지 폼을 그대로 불러옵니다. 최신 문제로 자동 교체하지 않습니다.','hint'));showOutput();summary.textContent='총 '+draft.items.length+'문항 · 저장된 프린트';return;}
 const title=field(controls,'프린트 제목','직전대비 기출프린트');title.maxLength=200;let automaticTitle=true;title.oninput=()=>{automaticTitle=!title.value.trim();};
 const step=(element,number)=>{const badge=node('span',String(number),'past-print-step');badge.setAttribute('aria-hidden','true');element.replaceChildren(badge,document.createTextNode(' '),node('span',element.textContent));return element;};
 const updateTitle=(picked=[])=>{if(!automaticTitle)return;const names=picked.length?picked.map(s=>s.source.school):[...schoolBox.querySelectorAll('input:checked')].map(x=>x.dataset.schoolName);title.value=model.title(names,Number(from.value),Number(to.value));};
 const form=node('select');form.setAttribute('aria-label','시험지폼 선택');const catalog=paperFormCatalog(config,user);for(const f of catalog){const o=node('option',f.name);o.value=f.id;form.append(o);}form.value=forms.builtin('standard').id;controls.append(node('label','시험지폼'),form);
 let selectedUnits=[],visible=[],selection=new Set(),rows=new Map(),generation=0,create;
 const list=node('div','','past-print-source-list'),count=node('p','','hint');
 const invalidate=()=>{generation++;visible=[];selection.clear();list.replaceChildren();count.textContent='조건을 선택하고 시험지 목록 조회를 눌러 주세요.';create.disabled=true;updateTitle();};
 const tree=scopeTree({node,selected:[],onChange:units=>{selectedUnits=units;if(controls.isConnected&&create)invalidate();}});
 const scope=node('details');scope.open=true;scope.append(step(node('summary','시험범위 선택'),1),tree.element);controls.append(scope);
 const schoolBox=node('fieldset','','past-print-schools');schoolBox.append(step(node('legend','학교 선택 · 1개'),2));controls.append(schoolBox);
 const from=field(controls,'시작 연도',new Date().getFullYear()-3,'number'),to=field(controls,'종료 연도',new Date().getFullYear(),'number');from.onchange=to.onchange=invalidate;
 const sources=[];await run('기출 시험지 목록 준비 중',async load=>{for(let start=0;;start+=50){const page=await load.wait(signal=>rpc('bank_source_exams',{s:config.spaceId,start_at:start},{signal}));sources.push(...page);if(page.length<50)break;}});
 const schools=new Map();for(const e of sources)if(e.source?.school)schools.set(model.schoolKey(e.source),e.source);
 appendSchoolGroups(schoolBox,[...schools],{node,source:([key,source])=>source,render:([key,source])=>{const label=node('label','','school-choice'),check=node('input');check.type='radio';check.name='past-print-school';check.value=key;check.dataset.schoolName=JSON.parse(key)[2];check.onchange=invalidate;label.append(check,node('span',schoolAlias.name(source.school,source.region)));return label;}});updateTitle();
 async function updateCount(){const picked=visible.filter(s=>selection.has(s.source_id)),result=model.collect(picked,rows,selectedUnits);updateTitle(picked);count.textContent=`선택 ${picked.length}개 시험지 · 총 ${result.items.length}문항 · 예상 문제지 ${model.estimate(result.items)}쪽(표지 포함, 2단·단당 2문항 기준). 긴 문항·그림에 따라 실제 쪽수는 늘어날 수 있습니다.`;create.disabled=!result.items.length;}
 const search=action('시험지 목록 조회',()=>run('조건에 맞는 시험지 확인 중',async load=>{
  if(!selectedUnits.length)throw Error('시험범위를 선택하세요.');const selectedSchools=[...schoolBox.querySelectorAll('input:checked')].map(x=>x.value);if(selectedSchools.length!==1)throw Error('학교를 1개 선택하세요.');
  const low=Number(from.value),high=Number(to.value);if(!Number.isInteger(low)||!Number.isInteger(high)||low>high)throw Error('연도 범위를 확인하세요.');const epoch=++generation;selection.clear();visible=[];list.replaceChildren();create.disabled=true;
  const matching=sources.filter(s=>model.matches(s,{schools:selectedSchools,from:low,to:high}));
  for(const [index,s]of matching.entries()){
   const all=[];for(let start=0;;start+=50){const page=await load.wait(signal=>rpc('bank_source_questions',{s:config.spaceId,source_key:s.source_id,start_at:start},{signal}));all.push(...page);if(page.length<50)break;}if(epoch!==generation)return;rows.set(s.source_id,all);
   const result=model.collect([s],rows,selectedUnits);load.stage('시험범위·문항 수 확인',index+1,matching.length);if(!result.items.length)continue;visible.push(s);
   const label=node('label','','past-print-source'),check=node('input');check.type='checkbox';check.onchange=()=>{check.checked?selection.add(s.source_id):selection.delete(s.source_id);updateCount();};label.append(check,node('span',`${s.source.school} · ${s.source.academicYear}년 · ${s.source.grade||''} · ${s.source.semester||''} · ${s.source.exam||''} · 범위 내 ${result.items.length}문항 / 등록 ${all.length}문항`));list.append(label);
  }
  if(!visible.length)list.append(node('p','조건에 맞는 등록 시험지가 없습니다.','empty'));await updateCount();
 }));
 create=action('선택한 시험지로 생성',async()=>{const picked=visible.filter(s=>selection.has(s.source_id)),{items}=model.collect(picked,rows,selectedUnits);if(!items.length)throw Error('시험지를 선택하세요.');updateTitle(picked);const next={id:crypto.randomUUID(),version:0,kind:model.KIND,status:'completed',title:title.value.trim()||'직전대비 기출프린트',answerMode:'quick',paperForm:structuredClone(catalog.find(x=>x.id===form.value)),rules:{units:selectedUnits.slice()},items,pastPrint:{from:Number(from.value),to:Number(to.value),schoolNames:[...new Set(picked.map(s=>[s.source.region,s.source.school].filter(Boolean).join(' · ')))],sourceIds:picked.map(s=>s.source_id)}};if(await generate(next))controls.hidden=true;},true);
 create.disabled=true;controls.append(step(search,3),node('p','조회한 목록에서 포함할 시험지를 체크한 뒤, ④ 선택한 시험지로 생성을 눌러 주세요.','hint'),list,count,step(create,4));
}
