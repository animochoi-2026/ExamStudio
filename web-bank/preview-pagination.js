// Preview-only navigation. Neither the paper snapshot nor print layout changes.
export function previewPagination({node,pages,viewport,surface,before,state={}}){
 const nav=node('nav','','preview-page-navigation'),value=node('output');nav.setAttribute('aria-label','시험지 페이지 이동');value.setAttribute('aria-live','polite');
 const sheets=()=>[...pages.children],top=e=>e.getBoundingClientRect().top-pages.getBoundingClientRect().top;
 const paint=()=>{const count=sheets().length;if(count)state.page=Math.max(0,Math.min(count-1,state.page||0));value.textContent=`${count?state.page+1:0} / ${count}쪽`;previous.disabled=!count||state.page===0;next.disabled=!count||state.page===count-1;};
 const move=index=>{state.page=index;paint();const sheet=sheets()[state.page];if(sheet)viewport.scrollTop=top(sheet);};
 const previous=node('button','이전 페이지'),next=node('button','다음 페이지');previous.type=next.type='button';previous.onclick=()=>move((state.page||0)-1);next.onclick=()=>move((state.page||0)+1);nav.append(previous,value,next);before.before(nav);paint();
 const scroll=()=>{const all=sheets();if(!all.length||!viewport.clientHeight)return;state.page=all.reduce((best,e,i)=>Math.abs(top(e)-viewport.scrollTop)<Math.abs(top(all[best])-viewport.scrollTop)?i:best,0);paint();};viewport.addEventListener('scroll',scroll,{passive:true});
 return {update(){const all=sheets();if(!all.length||!viewport.clientHeight){paint();return;}const css=getComputedStyle(viewport),height=viewport.clientHeight-parseFloat(css.paddingTop)-parseFloat(css.paddingBottom);surface.style.height=Math.max(parseFloat(surface.style.height)||0,top(all.at(-1))+height)+'px';move(state.page||0);},destroy(){viewport.removeEventListener('scroll',scroll);}};
}
