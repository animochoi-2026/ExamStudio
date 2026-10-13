// The document scrolls; fixed bars share one measured clearance, including safe areas.
export function installBottomClearance(){
 const root=document.documentElement, observed=new Set();
 const height=e=>e?.getClientRects().length?Math.ceil(e.getBoundingClientRect().height):0;
 const measure=()=>{
  const nav=document.getElementById('nav'), pager=document.querySelector('.question-navigation-fixed');
  root.style.setProperty('--bottom-nav-space',height(nav)+'px');
  root.style.setProperty('--question-nav-space',height(pager)+'px');
  for(const e of [nav,pager])if(e&&!observed.has(e)){observed.add(e);resize.observe(e);}
  for(const e of observed)if(!e.isConnected){resize.unobserve(e);observed.delete(e);}
 };
 const resize=new ResizeObserver(measure),mutation=new MutationObserver(measure);
 mutation.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','class']});
 addEventListener('resize',measure);measure();
 return ()=>{resize.disconnect();mutation.disconnect();removeEventListener('resize',measure);};
}
