import Display from '../app/difficulty-display.cjs';
// Shared four-way ratio control; adding killer never includes it in high.
export function ratioControls({node,field,profile,onChange}){
 const box=node('div','','ratio-control'),bar=node('div','','ratio-bar ratio-four'),fields=node('div','','mock-ratios'),inputs={},segments={},handles=[node('input'),node('input'),node('input')];
 const value=Object.fromEntries(Display.keys.map(k=>[k,Number(profile[k]||0)]));
 const sync=()=>{let end=0;for(const [i,k]of Display.keys.entries()){inputs[k].value=value[k];segments[k].textContent=Display.labels[k]+' '+value[k]+'%';segments[k].style.width=value[k]+'%';end+=value[k];if(i<3){handles[i].value=end;bar.style.setProperty('--end-'+i,end+'%');}}};
 const set=p=>{for(const k of Display.keys)value[k]=Number(p[k]||0);sync();};
 for(const k of Display.keys){const part=node('span','','ratio-'+k);segments[k]=part;bar.append(part);const input=field(fields,Display.labels[k]+' 비율 (%)',value[k],'number');input.min=0;input.max=100;input.step=1;inputs[k]=input;
  input.onchange=()=>{const n=Math.max(0,Math.min(100,Math.round(Number(input.value)||0))),others=Display.keys.filter(x=>x!==k),sum=others.reduce((a,x)=>a+value[x],0);let used=0;value[k]=n;for(const [i,x]of others.entries()){value[x]=i===others.length-1?100-n-used:Math.floor((100-n)*(sum?value[x]/sum:1/others.length));used+=value[x];}sync();onChange?.({...value});};
 }
 handles.forEach((h,i)=>{h.type='range';h.min=0;h.max=100;h.step=1;h.className='ratio-handle';h.setAttribute('aria-label',Display.labels[Display.keys[i]]+'와 '+Display.labels[Display.keys[i+1]]+'의 경계');h.oninput=()=>{const before=Display.keys.slice(0,i).reduce((n,k)=>n+value[k],0),after=before+value[Display.keys[i]]+value[Display.keys[i+1]],end=Math.max(before,Math.min(after,Number(h.value)));value[Display.keys[i]]=end-before;value[Display.keys[i+1]]=after-end;sync();onChange?.({...value});};bar.append(h);});
 box.append(node('p','하·중·상·킬러는 서로 겹치지 않습니다. 비율 합계는 100%입니다.','hint'),bar,fields);sync();
 return {box,inputs,handles,set,get:()=>({...value})};
}
