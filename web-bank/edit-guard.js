// One active page guard, plus a native close/reload warning. Cancel keeps both
// the page and its local form values intact; failed saves also prevent movement.
let guard=null;
export function setEditGuard(value){guard=value;}
export async function leaveEdits(){
 if(!guard?.dirty())return true;
 const current=guard;
 const choice=await new Promise(resolve=>{
  const d=document.createElement('dialog'),p=document.createElement('p');p.textContent='저장하지 않은 변경이 있습니다.';d.append(p);
  for(const [text,value]of [['저장 후 이동','save'],['변경 버리고 이동','discard'],['계속 편집','cancel']]){const b=document.createElement('button');b.textContent=text;b.onclick=()=>{d.close();d.remove();resolve(value);};d.append(b);}
  d.oncancel=e=>{e.preventDefault();d.close();d.remove();resolve('cancel');};document.body.append(d);d.showModal();
 });
 if(choice==='cancel')return false;
 if(choice==='save'){if(!await current.save())return false;if(current.dirty())throw Error('저장 중 새 변경이 생겨 이동을 멈췄습니다. 변경 내용을 다시 확인하세요.');}else current.discard?.();
 if(guard===current)guard=null;return true;
}
addEventListener('beforeunload',event=>{if(guard?.dirty()){event.preventDefault();event.returnValue='';}});
