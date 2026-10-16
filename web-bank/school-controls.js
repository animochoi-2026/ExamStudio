import {schoolLabel} from './school-regions.js';
export function schoolControls({node,action,schools,mode,onChange}){
 const box=node('section','','school-policy'),label=node('label','학교별 출제 방식'),select=node('select');
 select.setAttribute('aria-label','학교별 출제 방식');
 for(const [value,text] of [['priority','우선순위 · 조건에 맞는 부족분만 다음 학교에서'],['equal','동일비율 · 정확히 같은 문항 수']]){const o=node('option',text);o.value=value;select.append(o);}
 select.value=mode;select.onchange=()=>onChange(select.value,[...schools]);label.append(select);box.append(label);
 const order=node('div','','school-order');schools.forEach((school,i)=>{const row=node('div');row.append(node('span',(i+1)+'순위 '+school));if(mode==='priority'&&i){row.append(action('위로',()=>{const next=[...schools];[next[i-1],next[i]]=[next[i],next[i-1]];onChange(mode,next);}));}order.append(row);});box.append(order,node('p',mode==='equal'?'학교 수로 나누어떨어지지 않거나 세트·범위·난이도 조건이 충돌하면 출제하지 않습니다.':'시험범위·난이도·세트를 유지하면서 앞 학교 문항 수를 먼저 최대화합니다.','hint'));return box;
}
