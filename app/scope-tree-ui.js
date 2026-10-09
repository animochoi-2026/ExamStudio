import './curriculum.js';
const curriculum=globalThis.ExamCurriculum;

// The import dialog and settings dialog share this editor; changing a draft never writes settings.
export function scopeTreeEditor({host,scope,element,button,onChange=()=>{}}){
 let base=structuredClone(scope),ids=[],extra={},dirty=false;
 const intro=element('p','editor-hint','체크한 단원에서 출제합니다. 선택 과정의 이전 단원과 선수 과정은 풀이에 사용할 수 있고, 이후 과정과 금지 개념은 사용할 수 없습니다. 상위 체크박스는 하위 단원 전체를 선택합니다.');
 const note=element('p','editor-hint','2022 개정 교육과정 · 중3·고3 적용은 2027학년도부터입니다. 고등학교 과목은 학교의 편성에 맞춰 선택하며, 선택하지 않은 다른 선택과목을 배운 것으로 가정하지 않습니다.');
 const tools=element('div','scope-tree-tools'),search=element('input');search.type='search';search.placeholder='단원·개념 검색';search.setAttribute('aria-label','단원·개념 검색');
 const tree=element('div','scope-tree');tree.id='scopeTree';tree.setAttribute('aria-label','초5·초6·중학교·고등학교 전체 단원');
 const summary=element('p','scope-selection-summary');summary.id='scopeSelectionSummary';summary.setAttribute('aria-live','polite');
 const warning=element('p','review-notice');
 const advanced=element('details','scope-advanced');advanced.append(element('summary','','추가 조건 · 기존 설정'));
 const fields={};for(const [key,title] of [['restrictions','추가 요청·제한'],['extraForbidden','추가 금지 개념'],['extraPrerequisites','추가 허용 선수 개념']]){const label=element('label','',title),input=element('textarea');input.id=key==='restrictions'?'scope-restrictions':'scope-'+key;input.rows=2;label.htmlFor=input.id;input.maxLength=5000;input.addEventListener('input',()=>{dirty=true;onChange();});fields[key]=input;advanced.append(label,input);}
 const checks=new Map(),branches=[];
 function update(){
  for(const [id,input] of checks){const status=curriculum.state(ids,id);input.checked=status.checked;input.indeterminate=status.partial;}
  const last=curriculum.leaves.filter(n=>ids.includes(n.id)).at(-1);
  summary.textContent=last?`출제: ${ids.length}개 소단원 · 풀이 허용: ${last.course?'선택한 과목의 이전 단원과 선수 과정':last.grade+' '+last.semester+' '+last.title+'까지의 이전 과정'}`:'출제할 소단원을 한 개 이상 선택하세요.';
 }
 function row(node,parent,parents=[]){
  const wrap=element(node.children?'details':'div',node.children?'scope-branch':'scope-leaf');wrap.dataset.scopeNode=node.id;
  const line=element(node.children?'summary':'div','scope-node-line'),label=element('label'),input=element('input');input.type='checkbox';input.dataset.curriculumId=node.id;input.setAttribute('aria-label',[...parents,node.title].join(' > '));
  input.addEventListener('click',e=>e.stopPropagation());label.addEventListener('click',e=>e.stopPropagation());
  input.addEventListener('change',()=>{ids=curriculum.toggle(ids,node.id,input.checked);dirty=true;update();onChange();});
  checks.set(node.id,input);label.append(input,document.createTextNode(node.title+(node.category?' · '+node.category:'')));line.append(label);wrap.append(line);
  if(node.children){branches.push(wrap);for(const child of node.children)row(child,wrap,[...parents,node.title]);}
  else wrap.append(element('p','scope-concepts',node.concepts.join(' · ')));
  parent.append(wrap);
 }
 curriculum.tree.forEach(n=>row(n,tree));
 function filter(){const term=search.value.trim().toLocaleLowerCase();function walk(node){const el=tree.querySelector(`[data-scope-node="${node.id}"]`);let match=([node.title,...(node.concepts||[])].join(' ')).toLocaleLowerCase().includes(term);if(node.children){const childResults=node.children.map(walk);match=childResults.some(Boolean)||match;if(term&&match)el.open=true;if(term&&node.title.toLocaleLowerCase().includes(term))el.querySelectorAll('[data-scope-node]').forEach(n=>{n.hidden=false;});}el.hidden=!!term&&!match;return match;}curriculum.tree.forEach(walk);}
 search.addEventListener('input',filter);
 tools.append(search,button('모두 펼치기','button compact quiet',()=>branches.forEach(n=>{n.open=true;})),button('모두 접기','button compact quiet',()=>branches.forEach(n=>{n.open=false;})),button('선택 해제','button compact outline',()=>{ids=[];dirty=true;update();onChange();}));
 host.append(intro,note,warning,tools,tree,summary,advanced);
 function load(value){base=structuredClone(value);const inferred=curriculum.infer(base);ids=inferred.ids;extra=curriculum.extras(base,ids);dirty=false;search.value='';filter();warning.hidden=!inferred.unmatched.length;warning.textContent='기존 사용자 단원: '+inferred.unmatched.join(' · ')+'. 기존 설정은 보존되어 있습니다. 변경하려면 목차에서 해당 단원을 선택한 뒤 저장하세요.';for(const [key,input]of Object.entries(fields))input.value=Array.isArray(extra[key])?extra[key].join('\n'):extra[key]||'';for(const branch of branches)branch.open=curriculum.state(ids,branch.dataset.scopeNode).checked||curriculum.state(ids,branch.dataset.scopeNode).partial;update();}
 function read(){if(!dirty&&!base.curriculum&&curriculum.infer(base).unmatched.length)return structuredClone(base);return curriculum.build(ids,{restrictions:fields.restrictions.value,extraForbidden:fields.extraForbidden.value.split('\n').map(s=>s.trim()).filter(Boolean),extraPrerequisites:fields.extraPrerequisites.value.split('\n').map(s=>s.trim()).filter(Boolean)});}
 load(scope);
 return {load,read,isDirty:()=>dirty};
}
