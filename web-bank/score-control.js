import {difficultyMapping} from './composition-summary.js';
export function attachScoreSlider(input,parent,node){
 const wrap=node('div','','score-control'),slider=node('input');slider.type='range';slider.min='0';slider.max='10';slider.step='0.1';slider.value=input.value||'5.0';slider.setAttribute('aria-label','난이도 점수 슬라이더');
 const output=node('strong','','score-current');
 const update=fromSlider=>{if(fromSlider)input.value=Number(slider.value).toFixed(1);else if(input.value!==''&&Number.isFinite(Number(input.value)))slider.value=String(Math.max(0,Math.min(10,Number(input.value))));output.textContent=input.value===''?'미평가':`${Number(input.value).toFixed(1)}점`;
  output.className='score-current '+(Number(input.value)>=9?'score-killer':Number(input.value)>=8?'score-high':input.value!==''&&Number(input.value)<=3?'score-low':'');};
 slider.addEventListener('input',()=>update(true));input.addEventListener('input',()=>update(false));
 wrap.append(slider,output,node('small',difficultyMapping,'hint'));parent.append(wrap);update(false);
 return slider;
}
