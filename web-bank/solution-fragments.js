// Read the browser's native column breaks once, then keep only the content
// belonging to each printed column. Never clone the whole answer book per page.
export function solutionFragments(stream, frame, columnWidth, gap) {
 const origin=frame.getBoundingClientRect(),pitch=columnWidth+gap;
 const column=r=>Math.max(0,Math.floor((r.left-origin.left+.5)/pitch));
 const result=[];
 for(const child of stream.children){
  const parts=new Map();let previous=0;
  const record=(col,start,end)=>{let p=parts.get(col);if(!p){p={start,end};parts.set(col,p);}else p.end=end;previous=col;};
  const text=(n,start,end)=>{
   if(start===end)return;
   const range=document.createRange();range.setStart(n,start);range.setEnd(n,end);
   const rects=[...range.getClientRects()].filter(r=>r.height>0),cols=rects.map(column);
   if(!cols.length||cols.every(c=>c===cols[0])||end-start===1){record(cols[0]??previous,[n,start],[n,end]);return;}
   let mid=Math.floor((start+end)/2);
   // Keep a Unicode surrogate pair together when bisecting a text run.
   if(mid>start&&/[\uD800-\uDBFF]/.test(n.data[mid-1]))mid++;
   if(mid===end){record(cols[0],[n,start],[n,end]);return;}
   text(n,start,mid);text(n,mid,end);
  };
  const visit=n=>{
   if(n.nodeType===Node.TEXT_NODE){text(n,0,n.length);return;}
   if(n.nodeType!==Node.ELEMENT_NODE)return;
   if(n.matches('.katex-display,.katex,img,.answer-watermark,br')){
    const rect=n.getBoundingClientRect(),index=Array.prototype.indexOf.call(n.parentNode.childNodes,n);
    record(column(rect),[n.parentNode,index],[n.parentNode,index+1]);return;
   }
   for(const item of n.childNodes)visit(item);
  };
  visit(child);
  const rects=[...child.getClientRects()];
  for(const [col,part]of parts){
   const range=document.createRange();range.setStart(...part.start);range.setEnd(...part.end);
   let fragment=range.cloneContents(),ancestor=range.commonAncestorContainer;
   if(ancestor.nodeType===Node.TEXT_NODE)ancestor=ancestor.parentNode;
   while(ancestor!==child){const wrapper=ancestor.cloneNode(false);wrapper.append(fragment);fragment=wrapper;ancestor=ancestor.parentNode;}
   const copy=child.cloneNode(false);copy.append(fragment);copy.style.margin='0';
   const rect=rects.find(r=>column(r)===col);
   if(!rect)throw Error('상세 풀이의 단 위치를 확인하지 못했습니다.');
   result.push({column:col,left:rect.left-origin.left,width:rect.width,top:rect.top-origin.top,element:copy});
  }
 }
 return result;
}
