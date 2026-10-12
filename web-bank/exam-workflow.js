// Navigation owns only editor controls. Printed pages and measuring nodes remain
// under the existing renderer; changing a step never changes paper settings.
export function examWorkflow({root,node,action,navigate,message,scope,condition,title,schoolPicker,controls,review,output,generate,validate,summary,ready,hasItems}){
 root.classList.add('exam-workflow');
 const intro=node('div','','workflow-intro');intro.append(node('p','모든 학생이 함께 풀 시험지 한 부를 만듭니다.','workflow-description'),action('저장된 시험지',()=>navigate('exam')));
 const nav=node('nav','','workflow-steps');nav.setAttribute('aria-label','시험지 제작 단계');
 const names=['시험범위','문항·난이도','미리보기','저장·인쇄'],sections=names.map((name,i)=>{const s=node('section','','workflow-stage');s.dataset.step=i;s.append(node('h3',name));s.firstChild.tabIndex=-1;return s;});
 const appearance=node('details','','workflow-appearance');appearance.append(node('summary','글자·그림 크기·시험지 폼'),controls);
 sections[0].append(title,scope,schoolPicker);sections[1].append(condition);sections[2].append(appearance,...review);sections[3].append(...output);
 const bar=node('div','','workflow-footer'),info=node('p','','workflow-summary'),back=action('이전 단계',()=>show(current-1)),next=action('다음',advance,true);bar.append(info,back,next);
 let current=hasItems?2:0;
 const tabs=names.map((name,i)=>{const b=action(`${i+1} ${name}`,()=>{if(i>0&&i<2&&!validate())return;if(i>=2&&!hasItemsNow()){message('문항을 구성한 뒤 미리보기를 확인하세요.',true);return;}show(i);});nav.append(b);return b;});
 const hasItemsNow=()=>ready()||hasItems;
 function refresh(){info.textContent=summary();}
 function show(i,{focus=true}={}){current=Math.max(0,Math.min(3,i));sections.forEach((s,k)=>s.hidden=k!==current);tabs.forEach((b,k)=>{b.setAttribute('aria-current',k===current?'step':'false');b.classList.toggle('is-active',k===current);});back.hidden=current===0;next.hidden=current===3;next.textContent=current===0?'다음 · 문항·난이도':current===1?'시험지 구성하기':'다음 · 저장·인쇄';refresh();if(focus){sections[current].firstChild.focus({preventScroll:true});nav.scrollIntoView({block:'start'});}dispatchEvent(new Event('resize'));}
 function advance(){if(current===0){if(validate())show(1);}else if(current===1)generate.click();else if(ready())show(3);else message('미리보기 준비를 마친 뒤 출력할 수 있습니다.',true);}
 root.append(intro,nav,...sections,bar);root.addEventListener('change',refresh);root.addEventListener('input',refresh);show(current,{focus:false});
 return {show,refresh,generated(){hasItems=true;show(2);}};
}
