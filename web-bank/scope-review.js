import curriculum from '../app/curriculum.js';
import {mathText} from './question-renderer.js';
import {scopeTree} from './scope-tree.js';

export function scopeReview({catalog,content,root,node,field,action,rpc,onSaved}){
 const box=node('details','','panel');box.append(node('summary','시험범위·풀이 검수'));
 const cls=catalog.metadata.classification||{},saved=catalog.confirmed?.scopeEvidence;
 const data=structuredClone(saved||{taxonomyVersion:curriculum.version,conditionUnitIds:cls.conditionUnitIds||[],solutions:(cls.solutions||[]).map((s,i)=>({...s,id:s.id||'solution-'+i,dependencyUnitIds:[],text:i===0?content.solution||'':'',verified:false,complete:false}))});
 if(!data.solutions?.length)data.solutions=[{id:'solution-1',label:'기존 풀이',unitIds:[],dependencyUnitIds:[],text:content.solution||'',verified:false,complete:false}];
 box.append(node('p','원문 파일 유무와 별개로 실제 문제 조건과 풀이에 사용한 개념을 확인합니다. AI 추천은 수학적 검수 완료가 아닙니다.','hint'));
 const conditions=new Set(data.conditionUnitIds||[]),conditionTree=scopeTree({node,selected:conditions,label:'문제 조건을 이해하는 데 필요한 개념'});
 const conditionBox=node('details');conditionBox.append(node('summary','문제 조건을 이해하는 데 필요한 개념'),conditionTree.element);box.append(conditionBox);
 const solutions=[];
 for(const [i,s]of data.solutions.entries()){
  const panel=node('div','','panel');panel.append(node('h4',s.label||`풀이 ${i+1}`));
  const direct=new Set(s.unitIds||[]),dependency=new Set(s.dependencyUnitIds||[]);
  const directTree=scopeTree({node,selected:direct,label:'풀이에 직접 사용하는 개념'}),dependencyTree=scopeTree({node,selected:dependency,label:'간접적으로 필요한 개념'});
  for(const [title,tree]of [['이 풀이에서 직접 사용하는 개념',directTree],['간접적으로 필요한 개념',dependencyTree]]){const details=node('details');details.append(node('summary',title),tree.element);panel.append(details);}
  panel.append(node('p','출력할 상세 풀이 · 수식 표시','hint'),mathText(s.text||''));
  const editor=node('details');editor.append(node('summary','원문 수식·문구 확인'));const source=field(editor,'저장된 상세 풀이 원문',s.text||'','textarea');source.readOnly=true;editor.append(node('p','풀이 내용 수정은 현재 앱에서 새 문항 버전으로 저장해야 출력 파일과 일치합니다.','hint'));panel.append(editor);
  const verified=field(panel,'이 풀이가 완전하고 선택한 개념만 사용함을 확인','','checkbox');verified.checked=s.verified===true&&s.complete===true;
  solutions.push(()=>({...s,unitIds:[...direct],dependencyUnitIds:[...dependency],text:s.text||'',verified:verified.checked,complete:verified.checked}));box.append(panel);
 }
 const confirmed=field(box,'문제 조건과 풀이의 개념을 실제로 확인했습니다','','checkbox');confirmed.checked=data.confirmed===true||data.status==='confirmed';
 let changed=0,savedChange=0;box.addEventListener('input',()=>changed++);box.addEventListener('change',()=>changed++);
 const save=async()=>{
  if(!confirmed.checked)throw Error('실제 확인 후 체크하세요.');
  const evidence={...data,taxonomyVersion:curriculum.version,conditionUnitIds:[...conditions],solutions:solutions.map(fn=>fn()),confirmed:true};
  if(!evidence.solutions.some(s=>s.verified&&s.complete&&s.text))throw Error('완성된 풀이를 하나 이상 확인하세요.');
  const snapshot=changed;await rpc('bank_scope_confirm',{r:catalog.revision_id,e:evidence});savedChange=snapshot;
 };box.append(action('확인한 개념·풀이 저장',async()=>{await save();await onSaved();}));root.append(box);return {dirty:()=>changed!==savedChange,save};
}
