// The same A4 preview scale and +/- controls as the exam editor.
// Only the preview container is scaled; PDF export clones unscaled pages.
export function pastPrintPreview({section,pages,node,action,label}){
 const tools=node('div','','exam-layout-zoom'),value=node('output','','exam-layout-zoom-value'),viewport=node('div','','past-print-viewport'),surface=node('div','','past-print-surface');
 tools.setAttribute('aria-label',label+' 확대·축소');viewport.setAttribute('aria-label',label);viewport.tabIndex=0;
 surface.append(pages);viewport.append(surface);
 let percent=100,chosen=false;
 const apply=()=>{
  if(!viewport.clientWidth)return;
  const css=getComputedStyle(viewport),width=viewport.clientWidth-parseFloat(css.paddingLeft)-parseFloat(css.paddingRight),height=viewport.clientHeight-parseFloat(css.paddingTop)-parseFloat(css.paddingBottom);
  if(!chosen)percent=Math.max(10,Math.min(100,Math.floor(100*Math.min(width/(210*96/25.4),matchMedia('(min-width:761px)').matches?height/(297*96/25.4):1))));
  const scale=percent/100;pages.style.transform=`scale(${scale})`;surface.style.width=(210*96/25.4*scale)+'px';surface.style.height=(pages.scrollHeight*scale)+'px';value.value=percent+'%';out.disabled=percent<=10;inside.disabled=percent>=150;
 };
 const change=delta=>{chosen=true;percent=Math.max(10,Math.min(150,percent+delta));apply();};
 const out=action('−',()=>change(-10)),inside=action('+',()=>change(10));out.setAttribute('aria-label',label+' 축소');inside.setAttribute('aria-label',label+' 확대');tools.append(out,value,inside);section.append(tools,viewport);
 const resize=new ResizeObserver(apply);resize.observe(viewport);section.addEventListener('toggle',apply);apply();
 const lifecycle=new MutationObserver(()=>{if(!viewport.isConnected){resize.disconnect();section.removeEventListener('toggle',apply);lifecycle.disconnect();}});lifecycle.observe(document.body,{childList:true,subtree:true});
}
