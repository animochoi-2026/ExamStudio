(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ExamRegionGeometry=api;})(globalThis,()=>{
 'use strict';
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 function normalizeRegions(items){
  if(!Array.isArray(items)||items.length>100)throw Error('문제 영역 응답을 확인할 수 없습니다. 다시 시도해 주세요.');
  return items.map((r,index)=>{
   if(!r||!['x','y','width','height'].every(k=>Number.isFinite(r[k]))||r.x<0||r.y<0||r.width<=0||r.height<=0||r.x+r.width>1.001||r.y+r.height>1.001)throw Error('페이지 밖의 문제 영역이 반환되었습니다. 다시 시도하거나 직접 영역을 지정해 주세요.');
   return {x:r.x,y:r.y,width:Math.min(r.width,1-r.x),height:Math.min(r.height,1-r.y),order:Number.isFinite(r.order)?r.order:index+1};
  }).sort((a,b)=>a.order-b.order);
 }
 function sameRegion(a,b){
  const intersection=Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
  const smaller=Math.min(a.width*a.height,b.width*b.height),larger=Math.max(a.width*a.height,b.width*b.height);
  return intersection/(a.width*a.height+b.width*b.height-intersection)>.9||(intersection/smaller>.985&&smaller/larger>.9);
 }
 function uniqueRegions(items,existing){const accepted=[];for(const r of items)if(![...existing,...accepted].some(e=>sameRegion(r,e)||(e.detectedBounds&&sameRegion(r,e.detectedBounds))))accepted.push(r);return accepted;}
 function transformRegion(r,handle,dx,dy,minWidth=.01,minHeight=.01){
  if(handle==='move')return {...r,x:clamp(r.x+dx,0,1-r.width),y:clamp(r.y+dy,0,1-r.height)};
  let left=r.x,right=r.x+r.width,top=r.y,bottom=r.y+r.height;
  if(handle.includes('w'))left=clamp(left+dx,0,right-Math.min(minWidth,r.width));
  if(handle.includes('e'))right=clamp(right+dx,left+Math.min(minWidth,r.width),1);
  if(handle.includes('n'))top=clamp(top+dy,0,bottom-Math.min(minHeight,r.height));
  if(handle.includes('s'))bottom=clamp(bottom+dy,top+Math.min(minHeight,r.height),1);
  return {...r,x:left,y:top,width:right-left,height:bottom-top};
 }
 return {normalizeRegions,sameRegion,uniqueRegions,transformRegion};
});
