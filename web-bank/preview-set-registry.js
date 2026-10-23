// A single editor may reflow the same paper many times. Keep only a successful
// registry for that exact question/revision membership, never across screens.
export function previewSetRegistry(){
 let key=null,value=null,version=0;
 return {
  clear(){key=null;value=null;version++;},
  async get(items,load){
   const requested=JSON.stringify(items.map(i=>[i.questionId,i.revisionId]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
   if(key===requested)return structuredClone(value);
   const token=++version,result=await load();
   if(!Array.isArray(result))throw Error('세트 정보 응답 형식이 올바르지 않습니다.');
   if(token===version){key=requested;value=structuredClone(result);}
   return result;
  }
 };
}
