// The same A4 preview scale and +/- controls as the exam editor.
// Only the preview container is scaled; PDF export clones unscaled pages.
export function pastPrintPreview({section,pages,node,action,label,state={}}){
 const tools=node('div','','exam-layout-zoom'),value=node('output','','exam-layout-zoom-value'),viewport=node('div','','past-print-viewport'),surface=node('div','','past-print-surface');
 const navigation=node('nav','','past-print-page-navigation'),pageValue=node('output');navigation.setAttribute('aria-label',label+' 페이지 이동');pageValue.setAttribute('aria-live','polite');
 const sheets=[...pages.children];let page=Math.max(0,Math.min(sheets.length-1,state.page||0));
 const updatePage=()=>{state.page=page;pageValue.textContent=`${page+1} / ${sheets.length}쪽`;previous.disabled=page===0;next.disabled=page===sheets.length-1;};
 const top=index=>sheets[index].getBoundingClientRect().top-pages.getBoundingClientRect().top;
 const move=index=>{page=Math.max(0,Math.min(sheets.length-1,index));viewport.scrollTop=top(page);updatePage();};
 const previous=action('이전 페이지',()=>move(page-1)),next=action('다음 페이지',()=>move(page+1));previous.setAttribute('aria-label',label+' 이전 페이지');next.setAttribute('aria-label',label+' 다음 페이지');navigation.append(previous,pageValue,next);updatePage();
 tools.setAttribute('aria-label',label+' 확대·축소');viewport.setAttribute('aria-label',label);viewport.tabIndex=0;
 surface.append(pages);viewport.append(surface);
 let percent=state.percent||100,chosen=!!state.percent;
 const apply=()=>{
  if(!viewport.clientWidth)return;
  const css=getComputedStyle(viewport),width=viewport.clientWidth-parseFloat(css.paddingLeft)-parseFloat(css.paddingRight),height=viewport.clientHeight-parseFloat(css.paddingTop)-parseFloat(css.paddingBottom);
  if(!chosen)percent=Math.max(10,Math.min(100,Math.floor(100*Math.min(width/(210*96/25.4),matchMedia('(min-width:761px)').matches?height/(297*96/25.4):1))));
  const scale=percent/100;pages.style.transform=`scale(${scale})`;surface.style.width=(210*96/25.4*scale)+'px';surface.style.height=Math.max(pages.scrollHeight*scale,top(sheets.length-1)+height)+'px';value.value=percent+'%';out.disabled=percent<=10;inside.disabled=percent>=150;move(page);
 };
 const change=delta=>{chosen=true;percent=Math.max(10,Math.min(150,percent+delta));state.percent=percent;apply();};
 const out=action('−',()=>change(-10)),inside=action('+',()=>change(10));out.setAttribute('aria-label',label+' 축소');inside.setAttribute('aria-label',label+' 확대');tools.append(out,value,inside);section.append(navigation,tools,viewport);
 viewport.addEventListener('scroll',()=>{if(!viewport.clientWidth||!viewport.clientHeight)return;page=sheets.reduce((best,_,i)=>Math.abs(top(i)-viewport.scrollTop)<Math.abs(top(best)-viewport.scrollTop)?i:best,0);updatePage();},{passive:true});
 const resize=new ResizeObserver(apply);resize.observe(viewport);section.addEventListener('toggle',apply);apply();
 const lifecycle=new MutationObserver(()=>{if(!viewport.isConnected){resize.disconnect();section.removeEventListener('toggle',apply);lifecycle.disconnect();}});lifecycle.observe(document.body,{childList:true,subtree:true});
}
