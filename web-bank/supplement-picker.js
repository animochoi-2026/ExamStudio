import curriculum from '../app/curriculum.js';
import model from '../app/bank-exam-model.cjs';
import {sourceLabel} from './presentation.js';
// Shortage recovery has no original target question: ask for an exact leaf
// before expanding to other schools. The normal replacement popup is separate.
export async function supplementPicker({node,action,reader,rpc,config,rules,selectedIds=[],mockExamId=null,onApply}){
 const d=node('dialog','','question-replacement'),base=node('section','','replacement-preferred'),other=node('section','','replacement-other'),status=node('p','','hint'),footer=node('div','','actions');
 const queryRules={...rules,grade:config.grade,purpose:'supplement',originalsOnly:!!mockExamId,...(mockExamId?{mockExamId}:{})};
 let closed=false,busy=false,expanded=false,page=0,version=null,epoch=0;
 const selected=new Map(),checks=new Map();
 const close=()=>{if(!busy)d.close();};
 const apply=action('선택한 후보로 다시 구성',async()=>{
  if(busy||!selected.size)return;busy=true;refresh();status.textContent='선택한 후보와 최신 중복 기록을 확인하고 있습니다.';
  try{
   const rows=[];for(const {c,stage,unitId}of selected.values()){
    const result=await query(stage,{candidate:c.question_id,page:0,expected_version:null},unitId);
    if(result.items[0]?.revision_id!==c.revision_id)throw Error('선택한 후보가 변경되거나 다른 회차에 사용됐습니다. 다시 선택하세요.');
    const full=await reader.render(c.revision_id,{answers:true});if(full.element.dataset.incomplete)throw Error('그림을 확인할 수 없는 후보입니다.');rows.push(full.catalog);
   }
   await onApply(rows);busy=false;d.close();
  }catch(e){status.textContent=e.message;}finally{busy=false;refresh();}
 },true);
 function refresh(){apply.disabled=busy||!selected.size;apply.textContent=`선택 ${selected.size}문항으로 다시 구성`;for(const [id,input]of checks){input.checked=selected.has(id);input.disabled=busy;}}
 const query=(stage,extra={},unitId=unit.value)=>rpc('bank_replacement_candidates',{s:config.spaceId,current_revision:null,rules:{...queryRules,unitId},selected:selectedIds,stage,page:stage==='other_schools'?page:0,expected_version:stage==='other_schools'?version:null,candidate:null,...extra});
 const unit=node('select');unit.setAttribute('aria-label','타학교에서 보충할 세부 단원');unit.append(new Option('보충할 세부 단원을 선택하세요',''));
 for(const leaf of curriculum.leaves.filter(x=>rules.units.includes(x.id)))unit.append(new Option(leaf.title,leaf.id));
 unit.onchange=()=>{page=0;version=null;if(expanded)void load('other_schools');};
 const expand=action('타학교 문제까지 확대',async()=>{if(expanded)return;expanded=true;expand.hidden=true;other.before(unit);other.replaceChildren(node('p','출제 전에는 교체 대상 문항이 없으므로, 위에서 보충할 세부 단원을 선택하세요.','hint'));});
 d.setAttribute('aria-label','출제 후보 선택');d.append(node('h2','출제 후보 선택'),action('닫기',close),node('p','지정 학교의 시험범위 전체 후보입니다. 후보를 선택해도 저장하거나 출제하지 않습니다. 다시 구성할 때 기존 문항 수·난이도·범위 조건을 유지합니다.','hint'),status,base,expand,other,footer);footer.append(apply,action('취소',close));
 d.addEventListener('cancel',e=>{if(busy)e.preventDefault();});d.addEventListener('close',()=>{closed=true;epoch++;observer?.disconnect();d.remove();},{once:true});document.body.append(d);d.showModal();
 const observer=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){observer.unobserve(e.target);void e.target.loadPreview?.();}},{root:d,rootMargin:'150px'});
 function card(c,stage){
  const box=node('article','','replacement-candidate'),check=node('input'),label=node('label'),body=node('div','문제 미리보기 준비 중…'),preview=node('div');box.dataset.questionId=c.question_id;check.type='checkbox';check.setAttribute('aria-label','후보 '+c.question_id+' 선택');checks.set(c.question_id,check);check.checked=selected.has(c.question_id);
  check.onchange=()=>{if(check.checked)selected.set(c.question_id,{c,stage,unitId:unit.value});else selected.delete(c.question_id);refresh();};
  label.append(check,node('strong',`${model.responseType(c.metadata)==='선택형'?'객관식':'서술형'} · 난이도 ${model.numericScore(c)??'미확인'}`));box.append(label,node('p',sourceLabel(c),'hint'),body,action('문제·정답·풀이 확인',async()=>{try{const r=await reader.render(c.revision_id,{answers:true});if(!closed)preview.replaceChildren(r.element);}catch(e){preview.textContent=e.message;}}),preview);
  body.loadPreview=async()=>{try{const r=await reader.render(c.revision_id,{answers:false});if(!closed&&body.isConnected)body.replaceChildren(r.element);}catch(e){body.textContent='미리보기 실패: '+e.message;}};observer.observe(body);return box;
 }
 async function load(stage){
  const box=stage==='preferred_school'?base:other,e=++epoch;box.replaceChildren(node('p','후보 조회 중…','hint'));
  if(stage==='other_schools'&&!unit.value){box.textContent='보충할 세부 단원을 선택하세요.';return;}
  try{let r=await query(stage);if(closed||e!==epoch)return;if(r.changed){page=0;version=null;r=await query(stage);if(closed||e!==epoch)return;}if(stage==='other_schools')version=r.version;
   box.replaceChildren(node('h3',`${stage==='preferred_school'?'지정 학교':'타학교 같은 단원'} · ${r.total}문항`));
   if(!r.items.length)box.append(node('p',r.needsSchool?'설정에서 학교를 먼저 선택하세요.':'사용 가능한 후보가 없습니다.','empty'));
   for(const c of r.items)box.append(card(c,stage));
   if(stage==='other_schools'){const prev=action('이전 20문제',()=>{page--;return load(stage);}),next=action('다음 20문제',()=>{page++;return load(stage);});prev.disabled=page===0;next.disabled=!r.hasMore;box.append(prev,node('span',`${page+1} / ${Math.max(1,Math.ceil(r.total/20))} 페이지${r.hasMore?'':' · 마지막 목록'}`),next);}
  }catch(err){if(!closed&&e===epoch)box.replaceChildren(node('p','후보 조회 실패: '+err.message,'error'),action('다시 조회',()=>load(stage)));}
 }
 refresh();expand.disabled=true;await load('preferred_school');expand.disabled=false;
}
