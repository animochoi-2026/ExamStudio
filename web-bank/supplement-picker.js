import model from '../app/bank-exam-model.cjs';
import {schoolOptions as appendSchoolOptions} from './school-regions.js';
import {gradeLabel} from './grade-workspace.js';
import {sourceLabel} from './presentation.js';
// Shortage recovery uses the whole configured scope, independently of replacement.
export async function supplementPicker({node,action,reader,rpc,config,rules,selectedIds=[],mockExamId=null,shortages=[],onApply}){
 const d=node('dialog','','question-replacement'),base=node('section','','replacement-preferred'),other=node('section','','replacement-other'),status=node('p','','hint'),footer=node('div','','actions');
 const queryRules={...rules,grade:gradeLabel(config.grade)||config.grade,purpose:'supplement',originalsOnly:!!mockExamId,...(mockExamId?{mockExamId}:{})};
 let closed=false,busy=false,loading=false,expanded=false,page=0,version=null,epoch=0,schoolOptions=[],activeFilters=null;
 const bands=[['low','하'],['middle','중'],['high','상'],['killer','킬러']],missing=bands.filter(([,label])=>shortages.some(s=>s.label===label&&s.missing>0)).map(([key])=>key);
 let preferredBands=missing.length?bands.map(([k])=>k).filter(k=>!missing.includes(k)):bands.map(([k])=>k);if(!preferredBands.length)preferredBands=bands.map(([k])=>k);
 const selected=new Map(),checks=new Map();
 const close=()=>{if(!busy)d.close();};
 const apply=action('선택한 후보로 다시 구성',async()=>{
  if(busy||loading||!selected.size)return;busy=true;refresh();status.textContent='선택한 후보와 최신 중복 기록을 확인하고 있습니다.';
  try{
   const rows=[];for(const {c,stage,filters}of selected.values()){
    const result=await query(stage,{candidate:c.question_id,page:0,expected_version:null},filters);
    if(result.items[0]?.revision_id!==c.revision_id)throw Error('선택한 후보가 변경되거나 다른 회차에 사용됐습니다. 다시 선택하세요.');
    const full=await reader.render(c.revision_id,{answers:true});if(full.element.dataset.incomplete)throw Error('그림을 확인할 수 없는 후보입니다.');rows.push(full.catalog);
   }
   const result=await onApply(rows);if(result===false)throw Error('출제를 완료하지 못했습니다. 오류를 확인한 뒤 다시 시도하세요.');busy=false;d.close();
  }catch(e){status.textContent=e.message;}finally{busy=false;refresh();}
 },true);
 function refresh(){apply.disabled=busy||loading||!selected.size;apply.textContent=`선택 ${selected.size}문항으로 다시 구성`;school.disabled=busy;difficulty.disabled=busy;confirm.disabled=busy||loading;expand.disabled=busy||loading;for(const [id,input]of checks){input.checked=selected.has(id);input.disabled=busy||loading;}}
 const query=(stage,extra={},filters=stage==='preferred_school'?{bands:preferredBands}:activeFilters)=>rpc('bank_replacement_candidates',{s:config.spaceId,current_revision:null,rules:{...queryRules,supplementBands:filters?.bands,otherSchoolKeys:filters?.schools||[]},selected:selectedIds,stage,page:stage==='other_schools'?page:0,expected_version:stage==='other_schools'?version:null,candidate:null,...extra});
 const filters=node('section','','supplement-filters'),school=node('select'),difficulty=node('fieldset'),filterMessage=node('p','','hint');school.setAttribute('aria-label','보충할 타학교');
 difficulty.append(node('legend','난이도'));const bandChecks=new Map();
 const edited=()=>{epoch++;loading=false;refresh();activeFilters=null;other.replaceChildren(node('p','필터를 확정하면 선택한 학교·난이도의 문제를 20개씩 보여줍니다.','hint'));};
 for(const [key,label]of bands){const l=node('label'),i=node('input');i.type='checkbox';i.checked=missing.length?missing.includes(key):true;i.setAttribute('aria-label','타학교 난이도 '+label);i.onchange=edited;l.append(i,node('span',label));difficulty.append(l);bandChecks.set(key,i);}
 school.onchange=edited;
 const confirm=action('필터 확정 · 20문제 보기',async()=>{const chosen=[...bandChecks].filter(([,i])=>i.checked).map(([k])=>k);if(!chosen.length){filterMessage.textContent='난이도를 하나 이상 선택하세요.';return;}filterMessage.textContent='';activeFilters={bands:chosen,schools:school.value?[school.value]:[]};page=0;version=null;await load('other_schools');});
 const expand=action('타학교 문제까지 확대',async()=>{if(expanded)return;expanded=true;expand.hidden=true;school.replaceChildren(new Option('타학교 전체',''));appendSchoolOptions(school,schoolOptions,node,{source:s=>({school:s.name,schoolId:s.key}),value:s=>s.key,label:s=>s.name});const label=node('label','학교');label.append(school);filters.append(node('h3','타학교 문제 필터'),node('p','현재 시험범위 전체에서 조회합니다. 학교와 난이도를 고른 뒤 확정하세요.','hint'),label,difficulty,filterMessage,confirm);other.before(filters);edited();});
 d.setAttribute('aria-label','출제 후보 선택');d.append(node('h2','출제 후보 선택'),action('닫기',close),node('p','지정 학교의 시험범위 전체 후보입니다. 후보를 선택해도 저장하거나 출제하지 않습니다. 문항 수·객관식/서술형 수·시험범위는 유지합니다. 부족한 난이도는 직접 선택한 다른 난이도 문항으로 보충하며, 적용 결과에 변경된 구성을 표시합니다.','hint'),status,base,expand,other,footer);footer.append(apply,action('취소',close));
 d.addEventListener('cancel',e=>{if(busy)e.preventDefault();});d.addEventListener('close',()=>{closed=true;epoch++;observer?.disconnect();d.remove();},{once:true});document.body.append(d);d.showModal();
 const observer=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){observer.unobserve(e.target);void e.target.loadPreview?.();}},{root:d,rootMargin:'150px'});
 function card(c,stage){
  const box=node('article','','replacement-candidate'),check=node('input'),label=node('label'),body=node('div','문제 미리보기 준비 중…'),preview=node('div');box.dataset.questionId=c.question_id;check.type='checkbox';check.setAttribute('aria-label','후보 '+c.question_id+' 선택');checks.set(c.question_id,check);check.checked=selected.has(c.question_id);
  check.onchange=()=>{if(check.checked)selected.set(c.question_id,{c,stage,filters:structuredClone(stage==='preferred_school'?{bands:preferredBands}:activeFilters)});else selected.delete(c.question_id);refresh();};
  label.append(check,node('strong',`${model.responseType(c.metadata)==='선택형'?'객관식':'서술형'} · ${bands.find(([k])=>k===model.compositionBand(c))?.[1]||'미확인'} 난이도 ${model.numericScore(c)??''}`));box.append(label,node('p',sourceLabel(c),'hint'),body,action('문제·정답·풀이 확인',async()=>{try{const r=await reader.render(c.revision_id,{answers:true});if(!closed)preview.replaceChildren(r.element);}catch(e){preview.textContent=e.message;}}),preview);
  body.loadPreview=async()=>{try{const r=await reader.render(c.revision_id,{answers:false});if(!closed&&body.isConnected)body.replaceChildren(r.element);}catch(e){body.textContent='미리보기 실패: '+e.message;}};observer.observe(body);return box;
 }
 async function load(stage){
  const box=stage==='preferred_school'?base:other,e=++epoch;loading=true;refresh();box.replaceChildren(node('p','후보 조회 중…','hint'));
  if(stage==='other_schools'&&!activeFilters){loading=false;refresh();return;}
  try{let r=await query(stage);if(closed||e!==epoch)return;if(r.changed){page=0;version=null;r=await query(stage);if(closed||e!==epoch)return;}if(stage==='other_schools')version=r.version;else schoolOptions=r.filterSchools||[];
   box.replaceChildren(node('h3',`${stage==='preferred_school'?'지정 학교':'타학교 · 선택한 시험범위'} · ${r.total}문항`));
   if(stage==='preferred_school'&&preferredBands.length<bands.length){box.append(node('p','부족한 난이도 대신 사용할 수 있는 '+bands.filter(([k])=>preferredBands.includes(k)).map(([,v])=>v).join('·')+' 난이도 후보입니다.','hint'),action('지정 학교 전체 난이도 보기',()=>{preferredBands=bands.map(([k])=>k);return load(stage);}));}
   if(!r.items.length)box.append(node('p',r.needsSchool?'설정에서 학교를 먼저 선택하세요.':'사용 가능한 후보가 없습니다.','empty'));
   for(const c of r.items)box.append(card(c,stage));
   if(stage==='other_schools'){const prev=action('이전 20문제',()=>{page--;return load(stage);}),next=action('다음 20문제',()=>{page++;return load(stage);});prev.disabled=page===0;next.disabled=!r.hasMore;box.append(prev,node('span',`${page+1} / ${Math.max(1,Math.ceil(r.total/20))} 페이지${r.hasMore?'':' · 마지막 목록'}`),next);}
  }catch(err){if(!closed&&e===epoch)box.replaceChildren(node('p','후보 조회 실패: '+err.message,'error'),action('다시 조회',()=>load(stage)));}finally{if(e===epoch){loading=false;refresh();}}
 }
 refresh();expand.disabled=true;await load('preferred_school');expand.disabled=false;
}
