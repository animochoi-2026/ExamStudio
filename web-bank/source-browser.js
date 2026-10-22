import {appendSchoolGroups} from './school-regions.js';
import {loadSourceDifficulty} from './source-difficulty.js';
import {registrationLabel} from './source-list-state.js';
import {schoolCountLabel} from './school-list-ui.js';
export async function sourceBrowser({root,rpc,config,node,action,sourceCard,navigate,mode='schools',order='name',state={page:0,filters:{}},isCurrent=()=>root.isConnected}){
 state.filters||={};let sequence=0,countKey,countValue;
 const controls=node('div','','source-list-filters'),status=node('p','목록을 불러오는 중입니다.','hint'),list=node('div','','recent-list school-source-list'),pager=node('div','','actions');const schoolCount=node('p','학교 수 확인 중…','hint source-school-count');schoolCount.setAttribute('role','status');root.append(controls,schoolCount,status,list,pager);
 const fields={};for(const [key,label,values]of [['year','연도',[]],['semester','학기',['1학기','2학기']],['exam','시험 종류',['중간고사','기말고사']],['district','지역',[]]]){
  const wrap=node('label',label),select=node('select');select.setAttribute('aria-label',label);wrap.append(select);controls.append(wrap);fields[key]=select;fill(select,values.map(v=>({value:v,label:v})),state.filters[key]);select.onchange=()=>{state.filters[key]=select.value;state.page=0;void load();};
 }
 const search=node('input');search.type='search';search.placeholder='지역명 · 학교명 검색';search.setAttribute('aria-label','학교·지역 검색');search.value=state.filters.query||'';controls.append(search);let timer;search.oninput=()=>{state.filters.query=search.value;state.page=0;clearTimeout(timer);sequence++;schoolCount.textContent='학교 수 확인 중…';status.textContent='검색 조건을 적용하는 중입니다.';list.replaceChildren();pager.replaceChildren();timer=setTimeout(load,250);};
 const back=action('전체 학교',()=>{delete state.filters.school;state.page=0;void load();});controls.append(back);
 function fill(select,values,value){select.replaceChildren();const all=node('option','전체');all.value='';select.append(all);for(const v of values){const o=node('option',v.label);o.value=v.value;select.append(o);}select.value=value||'';}
 async function load(){clearTimeout(timer);const epoch=++sequence,filters={...state.filters},key=JSON.stringify(filters);schoolCount.textContent='학교 수 확인 중…';list.scrollTop=0;status.textContent='목록을 불러오는 중입니다.';list.replaceChildren();pager.replaceChildren();back.hidden=!state.filters.school;
  try{const request={s:config.spaceId,f:filters,p:state.page||0,mode,ordering:order};const [data,counts]=await Promise.all([rpc('bank_source_list_page',request),mode==='papers'&&key!==countKey?rpc('bank_source_list_page',{...request,p:0,mode:'schools'}):null]);if(!isCurrent()||epoch!==sequence)return;const total=mode==='schools'?data.total:counts?counts.total:countValue;schoolCount.textContent=schoolCountLabel(total);countKey=key;countValue=total;state.page=data.page;
   fill(fields.year,data.options.years.map(v=>({value:v,label:v})),state.filters.year);fill(fields.district,data.options.districts,state.filters.district);
   status.textContent=`시험지 ${data.exam_count}개 · ${data.page+1}/${data.pages}페이지`;
   appendSchoolGroups(list,data.items,{node,source:entry=>mode==='schools'?entry:entry.source,render:entry=>{
    if(mode==='schools'){const section=node('section','','school-source-entry');for(const e of entry.exams)section.append(sourceCard(e,{registration:order==='recent',grouped:true}));return section;}
    if(sourceCard)return sourceCard(entry,{grouped:true});const s=entry.source||{},section=node('section','','school-source-entry');section.append(action([s.school,s.academicYear,s.grade,s.semester,s.exam].filter(Boolean).join(' · '),()=>navigate('exam-source/'+encodeURIComponent(entry.source_id))),node('p',`등록 ${entry.question_count}/${entry.progress?.expected_count??'?'}문항 · ${registrationLabel(entry)}`,'hint'));const difficulty=node('small','난이도 확인 중…','source-difficulty');section.append(difficulty);loadSourceDifficulty(rpc,config.spaceId,entry.source_id,entry.difficulty).then(value=>{if(isCurrent()&&epoch===sequence)difficulty.textContent=value;}).catch(()=>{difficulty.textContent='난이도 조회 실패';});return section;
   }});
   if(!data.items.length)list.append(node('p','선택한 조건에 맞는 시험지가 없습니다.'));
   const previous=action('이전 페이지',()=>{state.page--;void load();}),next=action('다음 페이지',()=>{state.page++;void load();});previous.disabled=data.page===0;next.disabled=data.page+1>=data.pages;pager.append(previous,node('span',`${data.page+1} / ${data.pages}`),next);
  }catch(error){if(!isCurrent()||epoch!==sequence)return;list.replaceChildren();schoolCount.textContent='학교 수 조회 실패';status.textContent='목록 조회 실패: '+error.message;pager.replaceChildren(action('다시 조회',load));}
 }
 await load();
}
