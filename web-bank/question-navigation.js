let sequence=[],pending=null,generation=0;
export function setQuestionSequence(first,loadMore){
 const version=++generation;sequence=[...first];pending=loadMore?(async()=>{const rest=await loadMore();if(generation===version)sequence=[...first,...rest];return sequence;})():null;
 if(pending)pending.catch(()=>{});
}
export async function questionNeighbors(id){
 if(pending)await pending;
 const index=sequence.findIndex(c=>c.revision_id===id);
 return {previous:index>0?sequence[index-1]:null,next:index>=0?sequence[index+1]||null:null,index,count:sequence.length};
}
export async function navigationButtons({id,parent,node,action,open,isCurrent=()=>true}){
 const n=await questionNeighbors(id);if(!isCurrent()||n.index<0)return;
 const row=node('div','','actions question-navigation');
 for(const [text,c]of [['이전 문항',n.previous],['다음 문항',n.next]]){const button=action(text,()=>open(c));button.disabled=!c;row.append(button);}
 row.append(node('span',`${n.index+1} / ${n.count}`,'hint'));parent.append(row);return row;
}
