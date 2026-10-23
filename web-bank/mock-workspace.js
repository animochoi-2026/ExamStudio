import curriculum from '../app/curriculum.js';
import model from './mock-exam-model.cjs';
import scopes from './exam-form-model.cjs';

export const scopeLabel = units => scopes.scopeLabel(units) || '시험범위를 선택하세요';
export const plannedCount = (doc,v) => model.formats.reduce((n,[key])=>n+Number(doc.counts[v.kind]?.[key]||0),0);
export function commonScope(variants){
 const sets=variants.map(v=>new Set(v.units.flatMap(id=>curriculum.descendants(id))));
 return sets.length>1?curriculum.leaves.filter(u=>sets.every(s=>s.has(u.id))).map(u=>u.id):[];
}
export function paperSummary(doc,v){
 const actual=v.paper?.items.length,planned=v.paper?.autoComposition?.planned?.total??plannedCount(doc,v);
 return {actual,planned,missing:actual==null?0:Math.max(0,planned-actual)};
}
export function commonCount(doc,v){
 const others=new Set(doc.variants.filter(x=>x.id!==v.id).flatMap(x=>x.paper?.items.map(i=>i.questionId)||[]));
 return v.paper?.items.filter(i=>others.has(i.questionId)).length||0;
}
export function settingCard({node,action,title,value,detail,edit}){
 const section=node('section','','mock-setting-summary'),heading=node('div','','mock-setting-heading');
 heading.append(node('strong',title),action('변경',edit));heading.lastChild.setAttribute('aria-label',title+' 변경');
 section.append(heading,node('div',value,'mock-setting-value'));if(detail)section.append(node('p',detail,'hint'));return section;
}
export function paperPicker({node,action,doc,selected,onSelect,outputSelection,onOutput}){
 const aside=node('aside','','mock-result-sidebar'),list=node('div','','mock-result-picker');list.setAttribute('aria-label','미리볼 시험지');
 for(const v of doc.variants.filter(v=>v.paper)){
  const {actual,planned,missing}=paperSummary(doc,v),row=node('div','','mock-result-option'+(v.id===selected.id?' active':''));
  const select=action('',()=>onSelect(v.id));select.setAttribute('aria-label',v.label+' 미리보기');select.setAttribute('aria-pressed',String(v.id===selected.id));
  const top=node('span','','mock-option-heading');top.append(node('strong',v.label),node('span',missing?missing+'문항 부족':'구성 완료','mock-result-state'+(missing?' shortage':'')));
  select.append(top,node('span',scopeLabel(v.units),'mock-option-scope'),node('small',`${actual} / ${planned}문항 · ${model.countSummary(v.paper.rules?.counts||doc.counts[v.kind])}`));
  const label=node('label','','mock-output-check'),check=node('input');check.type='checkbox';check.checked=outputSelection.has(v.id);check.setAttribute('aria-label',v.label+' 출력 선택');check.onchange=()=>{check.checked?outputSelection.add(v.id):outputSelection.delete(v.id);onOutput();};label.append(check,document.createTextNode('출력에 포함'));row.append(select,label);list.append(row);
 }
 const common=commonCount(doc,selected),sharing=node('section','','mock-result-sharing');sharing.append(node('h4',selected.label+' 문항 구성'));
 for(const [label,n]of [['다른 시험지와 공통',common],[selected.label+'에만 출제',selected.paper.items.length-common],['전체',selected.paper.items.length]]){const line=node('div');line.append(node('span',label),node('strong',n+'문항'));sharing.append(line);}
 sharing.append(node('p','공통문항을 교체하면 함께 사용한 시험지에도 반영됩니다.','hint'));aside.append(list,sharing);return aside;
}
