const compare=(a,b)=>String(a||'').localeCompare(String(b||''),'ko',{numeric:true})||String(a||'').localeCompare(String(b||''));
const time=value=>{const n=Date.parse(value);return Number.isFinite(n)?n:-Infinity;};
const recent=(a,b)=>{const x=time(a),y=time(b);return x===y?0:x>y?-1:1;};

// Group the complete visible metadata set before sorting or taking a school page.
// No question bodies, original PDFs or image resources are requested here.
export function groupSchoolSources(sources,order='name'){
 const groups=new Map();
 for(const entry of sources){const s=entry.source||{},key=s.schoolId||[s.region,s.school||entry.source_id].join('|');
  if(!groups.has(key))groups.set(key,{key,name:s.school||s.materialTitle||'출처 미입력',region:s.region||'',lastRegisteredAt:null,exams:[]});
  const group=groups.get(key);group.exams.push(entry);
  if(time(entry.last_registered_at)>time(group.lastRegisteredAt))group.lastRegisteredAt=entry.last_registered_at;
 }
 const all=[...groups.values()];
 if(order==='recent')for(const g of all)g.exams.sort((a,b)=>recent(a.last_registered_at,b.last_registered_at)||compare(a.source_id,b.source_id));
 // Alphabetic view intentionally retains the RPC's existing exam order.
 all.sort((a,b)=>(order==='recent'?recent(a.lastRegisteredAt,b.lastRegisteredAt):0)||compare(a.name,b.name)||compare(a.region,b.region)||compare(a.key,b.key));
 return all;
}
export async function schoolSources({root,rpc,config,node,action,sourceCard,order='name',isCurrent=()=>root.isConnected}){
 const status=node('p','학교 목록을 불러오는 중입니다.','hint'),list=node('div','','recent-list school-source-list'),pager=node('div','','actions');root.append(status,list,pager);
 const entries=await rpc('bank_school_sources',{s:config.spaceId});if(!isCurrent())return;
 const groups=groupSchoolSources(entries,order),pages=Math.max(1,Math.ceil(groups.length/10));let page=0;
 function render(){if(!isCurrent())return;list.replaceChildren();pager.replaceChildren();
  status.textContent=`${order==='recent'?'최근 기출 등록순':'학교명 가나다순'} · 학교 ${groups.length}개 · ${page+1}/${pages}페이지`;
  for(const group of groups.slice(page*10,(page+1)*10)){const details=node('details');details.open=true;details.dataset.schoolKey=group.key;details.append(node('summary',[group.region,group.name].filter(Boolean).join(' ')));
   for(const entry of group.exams)details.append(sourceCard(entry,{registration:order==='recent'}));list.append(details);
  }
  if(!groups.length)list.append(node('p','등록된 원본 시험지가 없습니다.'));
  const previous=action('이전 페이지',()=>{page--;render();}),next=action('다음 페이지',()=>{page++;render();});previous.disabled=page===0;next.disabled=page+1>=pages;pager.append(previous,node('span',`${page+1} / ${pages}`),next);
 }
 render();
}
