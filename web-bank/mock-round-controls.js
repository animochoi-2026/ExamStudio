import {ratioControls} from './difficulty-ratios.js';
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
 const box=node('div','','mock-difficulty-controls'),target=field(box,'목표 난이도 (점)',profile.targetAverage??'','number'),estimate=node('p','','hint');
 target.min=0;target.max=10;target.step=.01;target.placeholder='비율에 따라 자동 계산';
 const update=()=>{estimate.textContent=`비율 합계 ${Object.values(control.get()).reduce((a,b)=>a+b,0)}% · 예상 난이도 ${B.profileAverage(profile).toFixed(2)}점 · 실제 문항 평균은 출제 후 표시합니다.`;onChange();};
 const control=ratioControls({node,field,profile,onChange:p=>{Object.assign(profile,p,{targetAverage:null});target.value='';update();}});
 target.onchange=()=>{if(target.value===''){profile.targetAverage=null;update();return;}const v=Number(target.value);if(!Number.isFinite(v)||v<0||v>10){target.value=profile.targetAverage??'';return;}Object.assign(profile,B.profileForTarget(v),{targetAverage:v});control.set(profile);update();};
 box.append(control.box,estimate);estimate.setAttribute('role','status');estimate.textContent=`예상 난이도 ${B.profileAverage(profile).toFixed(2)}점`;return box;
}
