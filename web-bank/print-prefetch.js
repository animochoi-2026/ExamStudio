// Keep request concurrency bounded. Results stay in source order and a failed
// batch waits for its in-flight readers before callers revoke their image URLs.
export async function preparePrintItems(items,prepare,{concurrency=4,current=()=>true,progress=()=>{}}={}){
 const result=new Array(items.length);let next=0,finished=0,failure;
 await Promise.all(Array.from({length:Math.min(concurrency,items.length)},async()=>{
  while(next<items.length&&!failure){const i=next++;try{if(!current())throw Error('출력 준비를 취소했습니다.');result[i]=await prepare(items[i],i);progress(++finished,items.length);}catch(error){failure=error;}}
 }));if(failure)throw failure;return result;
}
