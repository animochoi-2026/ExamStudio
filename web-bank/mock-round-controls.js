import M from './mock-exam-model.cjs';
import B from '../app/bank-exam-model.cjs';
export function kindControls({node,field,doc,onChange}){
 const box=node('div','','mock-kind-configs');
 for(const kind of Object.keys(doc.counts)){
  const count=doc.counts[kind],detail=node('details','','mock-kind-config'),heading=node('summary'),grid=node('div','','mock-kind-grid');detail.open=kind==='A';
  const update=()=>{heading.textContent=kind+'형 · '+M.countSummary(count)+' · 총 '+M.totalPoints(count)+'점';};
  detail.append(heading,grid);box.append(detail);
  for(const [key,label]of M.formats){
   const n=field(grid,kind+'형 '+label+' 문항 수',count[key]??0,'number'),p=field(grid,kind+'형 '+label+' 문항당 배점',count[key+'Points'],'number');
   n.min=0;n.max=100;n.step=1;p.min=0;p.max=100;p.step=.5;
   for(const [input,name]of [[n,key],[p,key+'Points']])input.onchange=()=>{const value=Number(input.value);if(!input.value||!Number.isFinite(value)||value<0||value>100||(name===key&&!Number.isInteger(value))){input.value=count[name];input.setCustomValidity('0~100 범위의 올바른 값을 입력하세요.');input.reportValidity();return;}input.setCustomValidity('');count[name]=value;if(key==='written')delete count.writtenPointGroups;update();onChange();};
  }update();
 }return box;
}
export function difficultyControls({node,field,profile,onChange}){
 const box=node('div','','mock-difficulty-controls'),target=field(box,'목표 난이도 (점)',profile.targetAverage??'','number'),bar=node('div','','ratio-bar'),low=node('span','','ratio-low'),mid=node('span','','ratio-middle'),high=node('span','','ratio-high'),handles=[node('input'),node('input')],ratios=node('div','','mock-ratios'),inputs={},estimate=node('p','','hint');
 target.min=0;target.max=10;target.step=.01;target.placeholder='비율에 따라 자동 계산';
 for(const [i,h]of handles.entries()){h.type='range';h.min=0;h.max=100;h.step=1;h.className='ratio-handle';h.setAttribute('aria-label',i?'중과 상의 경계':'하와 중의 경계');}
 bar.append(low,mid,high,...handles);box.append(node('p','목표 점수를 입력하면 실제 문항 평균을 맞춥니다. 비율을 직접 조절하면 비율 기준으로 출제합니다.','hint'),bar,ratios,estimate);estimate.setAttribute('role','status');
 const sync=()=>{const p=profile;low.textContent=`하 ${p.low}%`;mid.textContent=`중 ${p.middle}%`;high.textContent=`상 ${p.high}%`;bar.style.setProperty('--low-end',p.low+'%');bar.style.setProperty('--middle-end',(p.low+p.middle)+'%');handles[0].value=p.low;handles[1].value=p.low+p.middle;for(const [k,input]of Object.entries(inputs))input.value=p[k];target.value=p.targetAverage??'';estimate.textContent=p.driver==='target'?`목표 ${p.targetAverage}점에 실제 문항 평균을 맞춥니다. 상·중·하 비율은 참고용 자동 표시이며 출제 개수를 제한하지 않습니다.`:`비율 합계 ${p.low+p.middle+p.high}% · 예상 난이도 ${B.profileAverage(p).toFixed(2)}점 · 실제 문항 평균은 출제 후 표시합니다.`;};
 const change=()=>{sync();onChange();};
 const set=(l,m)=>{profile.low=l;profile.middle=m;profile.high=100-l-m;profile.targetAverage=null;profile.driver='ratio';change();};
 handles[0].oninput=()=>{const l=Math.min(Number(handles[0].value),profile.low+profile.middle);set(l,profile.low+profile.middle-l);};
 handles[1].oninput=()=>set(profile.low,Math.max(profile.low,Number(handles[1].value))-profile.low);
 for(const [k,label]of [['high','상'],['middle','중'],['low','하']]){const input=field(ratios,label+' 비중 (%)',profile[k],'number');input.min=0;input.max=100;input.step=1;input.classList.add('mock-ratio-'+k);inputs[k]=input;input.onchange=()=>{const value=Math.max(0,Math.min(100,Math.round(Number(input.value)||0))),other=k==='low'?'high':'low',remaining=k==='middle'?'high':'middle';profile[k]=value;profile[other]=Math.min(profile[other],100-value);profile[remaining]=100-value-profile[other];profile.targetAverage=null;profile.driver='ratio';change();};}
 target.onchange=()=>{if(target.value===''){profile.targetAverage=null;profile.driver='ratio';change();return;}const v=Number(target.value);if(!Number.isFinite(v)||v<0||v>10){target.value=profile.targetAverage??'';return;}Object.assign(profile,B.profileForTarget(v),{targetAverage:v,driver:'target'});change();};sync();return box;
}
