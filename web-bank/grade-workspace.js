export const grades=[['m1','중1'],['m2','중2'],['m3','중3'],['h1','고1'],['h2','고2'],['h3','고3']];
export const gradeLabel=id=>grades.find(g=>g[0]===id)?.[1]||'';
let active='',epoch=0;
export function currentGrade(){return active;}
export function setGrade(id){if(id&&!gradeLabel(id))throw Error('학년을 선택하세요.');if(active!==id){active=id;epoch++;}return epoch;}
export const gradeEpoch=()=>epoch;
export const workspaceKey=(key,grade=active)=>key+(grade?':grade:'+grade:'');
export function workspaceStored(storage,key){
 const scoped=workspaceKey(key),value=storage.getItem(scoped);if(value!==null||!active)return value;
 const legacy=storage.getItem(key);if(!legacy)return null;
 try{const doc=JSON.parse(legacy),units=[...(doc.rules?.units||[]),...(doc.variants||[]).flatMap(v=>v.units||[])],inferred=new Set(units.map(id=>id.split('-')[0]));
  if(doc.workspaceGrade===active||!doc.workspaceGrade&&inferred.size===1&&inferred.has(active)){storage.setItem(scoped,legacy);return legacy;}
 }catch{}
 return null;
}
// Snapshot the context before dispatch; discard a response from a workspace
// which was left while its network request was in flight.
export function gradeFetch(fetcher=globalThis.fetch.bind(globalThis)){
 return async(input,init={})=>{const version=epoch,headers=new Headers(init.headers||(input instanceof Request?input.headers:undefined));
  const url=new URL(input instanceof Request?input.url:String(input),globalThis.location?.href||'https://localhost');
  // Only PostgREST consumes this context. Auth, storage and Edge Functions
  // retain their existing CORS header contracts.
  if(active&&url.pathname.startsWith('/rest/v1/'))headers.set('x-exam-grade',active);else headers.delete('x-exam-grade');
  const response=await fetcher(input,{...init,headers});
  if(version!==epoch)throw new DOMException('학년이 변경되어 이전 조회를 취소했습니다.','AbortError');
  return response;
 };
}
export function gradePicker({node,action,current='',onSelect,cancel}){
 const box=node('section','','grade-picker'),heading=node('h2','어느 학년으로 들어갈까요?');
 box.append(heading,node('p','선택한 학년의 문항, 검수함, 시험지와 시험범위를 보여드립니다.','hint'));
 const options=node('div','','grade-options');
 for(const [id,label] of grades){const b=action(label,()=>onSelect(id));b.setAttribute('aria-pressed',String(id===current));options.append(b);}
 box.append(options);if(cancel)box.append(action('현재 학년 유지',cancel));return box;
}
