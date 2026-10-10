(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ExamLayout=api;})(globalThis,function(){
 'use strict';
 // Geometry supplies usable column areas; the form never chooses pagination.
 // Units are pixels. Introductory text may leave different areas in each column.
 function paginateQuestionAreas(items,geometry,gap=18){
  const spec=typeof geometry==='number'?{height:geometry}:geometry;
  if(!(spec.height>0))throw Error('문제 영역의 높이를 확인하지 못했습니다.');
  const columns=spec.columns||2,slots=spec.slots||2,pages=[],overflows=[];
  let column=0,slot=0;
  const create=()=>{const first=pages.length===0,height=first?(spec.firstHeight??spec.height):spec.height,areas=Array.from({length:columns},(_,i)=>{const top=first&&i===0?(spec.introHeight||0):0;return {top,height:height-top};});if(areas.some(a=>a.height<=0))throw Error('제목·안내문이 문제 영역을 넘습니다.');pages.push({columns:Array.from({length:columns},()=>[]),areas});column=0;slot=0;};
  create();
  const current=()=>pages.at(-1),advance=()=>{if(++column>=columns)create();slot=0;};
  for(const item of items){
   const h=item.height+(item.workspaceMm||0)*96/25.4;
   if(!Number.isFinite(h)||h<0)throw Error('문항 크기를 측정하지 못했습니다.');
   if(item.breakBefore==='page'&&current().columns.some(c=>c.length))create();
   else if(item.breakBefore==='column'&&current().columns[column].length)advance();
   // Keep the two-question rhythm, but do not discard usable space merely
   // because a question crosses the half-column boundary.
   const occupied=current().columns[column],existing=occupied[0],room=current().areas[column];
   if(slots===2&&occupied.length===1&&existing.layout!=='full'&&item.layout!=='full'&&existing.fragmentIndex===undefined&&!item.breakBefore){
    const earliest=existing.top+existing.height+gap,latest=room.top+room.height-h;
    if(earliest<=latest){const top=Math.max(earliest,Math.min(room.top+room.height/2,latest));occupied.push({...item,top,height:h});slot=slots;continue;}
   }
   if(slot>=slots)advance();
   let area=current().areas[column];
   let whole=item.layout==='full'||h>area.height/slots-gap;
   if(whole&&slot){advance();area=current().areas[column];}
   // A first-page introduction may be the only obstruction. Try the next
   // column before declaring a whole question too large for the page.
   if(h>area.height&&area.top>0){advance();area=current().areas[column];}
   // A shorter first-page form does not turn a normal question into fragments.
   while(h>area.height&&h<=spec.height&&pages.length===1){advance();area=current().areas[column];}
   if(h>area.height&&item.fragmenter){
    if(slot){advance();area=current().areas[column];}
    let cursor=0,index=0;
    while(true){
     const part=item.fragmenter.next(cursor,area.height,index);
     current().columns[column].push({...item,element:part.element,fragmentIndex:index,fragment:part.fragment,top:area.top,height:part.height});
     slot=part.height>area.height/slots-gap?slots:1;
     if(part.done)break;
     cursor=part.next;index++;advance();area=current().areas[column];
    }
    continue;
   }
   whole=item.layout==='full'||h>area.height/slots-gap;
   if(h>area.height)overflows.push(item.questionId);
   const top=area.top+slot*area.height/slots;
   current().columns[column].push({...item,top,height:h});slot=whole?slots:slot+1;
  }
  return {pages,overflows};
 }
 return {paginateQuestionAreas};
});
