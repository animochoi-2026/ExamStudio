export function schoolCountLabel(count){
 if(!Number.isInteger(count)||count<0)throw Error('전체 학교 수를 확인하지 못했습니다.');
 return `조건에 맞는 학교 ${count}개`;
}
export function schoolRangeLabel(name,count){
 if(!Number.isInteger(count)||count<0)throw Error('관련 문항 수를 확인하지 못했습니다.');
 return `${name} 관련범위 ${count}개`;
}
export function hasMoreBelow({scrollHeight,clientHeight,scrollTop}){return clientHeight>0&&scrollHeight-clientHeight-Math.max(0,scrollTop)>2;}
export function schoolScrollHint(list,node){
 const hint=node('p','↓ 아래로 더 많은 학교가 있습니다','school-scroll-hint');hint.hidden=true;
 list.after(hint);list.setAttribute('tabindex','0');list.setAttribute('aria-label','학교 목록');
 const update=()=>{hint.hidden=!hasMoreBelow(list);};list.addEventListener('scroll',update,{passive:true});
 const resize=typeof ResizeObserver==='function'?new ResizeObserver(update):null;
 const watch=()=>{resize?.disconnect();resize?.observe(list);for(const child of list.children)resize?.observe(child);update();};
 const mutation=typeof MutationObserver==='function'?new MutationObserver(watch):null;
 mutation?.observe(list,{childList:true,subtree:true,characterData:true});watch();
 return {hint,update,dispose(){mutation?.disconnect();resize?.disconnect();list.removeEventListener('scroll',update);hint.remove();}};
}
