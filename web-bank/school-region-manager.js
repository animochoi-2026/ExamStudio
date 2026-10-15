import {setSchoolRegions,schoolMatches} from './school-regions.js';
export async function schoolRegionManager({root,client,rpc,config,node,action,field}){
 const status=node('p','학교 등록 정보를 확인하는 중입니다.','hint'),list=node('div');root.append(status,list);
 let rows=await rpc('bank_school_regions_sync',{s:config.spaceId});setSchoolRegions(rows);
 const search=field(root,'학교·지역 검색');root.append(list);
 async function lookup(row,force=false){const {data,error}=await client.functions.invoke('bank-school-location',{body:{spaceId:config.spaceId,schoolKey:row.school_key,force}});if(error){let detail;try{detail=await error.context?.json();}catch{}throw Error(detail?.error||error.message);}if(data?.error)throw Error(data.error);return data.school;}
 function replace(row){rows=rows.map(r=>r.id===row.id?row:r);setSchoolRegions(rows);}
 const batch=action('미확인 학교 지역 자동 확인',async()=>{let completed=0;try{for(const row of rows.filter(r=>!r.checked_at)){status.textContent=`지역 확인 중 · ${row.name}`;replace(await lookup(row));completed++;}render();status.textContent=`자동 확인 작업 종료 · ${completed}개 처리`;}catch(error){render();status.textContent=`${completed}개 처리 후 중지 · ${error.message}`;}});root.insertBefore(batch,list);
 function render(){list.replaceChildren();status.textContent=`학교 ${rows.length}개 · 확인 ${rows.filter(r=>r.status==='verified').length} · 확인 필요 ${rows.filter(r=>['unverified','ambiguous'].includes(r.status)).length} · 조회 실패 ${rows.filter(r=>r.status==='failed').length}`;
  for(const row of rows.filter(r=>schoolMatches(r.name,search.value)).sort((a,b)=>a.name.localeCompare(b.name,'ko'))){const card=node('details','','panel');card.append(node('summary',`${row.name} · ${row.status==='verified'?row.province+' '+row.district:'지역 확인 필요'}`));
   const province=field(card,'시·도',row.province),district=field(card,'시·군·구',row.district),address=field(card,'확인한 전체 주소',row.address);card.append(node('p','학교 이름과 기존 문항 연결은 유지됩니다. 실제 학교 주소를 확인한 뒤 저장하세요.','hint'));
   for(const c of row.candidates||[])card.append(node('p',[c.name,c.address].join(' · '),'hint'));
   card.append(action('확인한 지역 저장',async()=>{replace(await rpc('bank_school_region_save',{s:config.spaceId,k:row.school_key,expected:row.version,value:{province:province.value.trim(),district:district.value.trim(),address:address.value.trim(),status:'verified',source:'manual',candidates:[]}}));render();}),action('Google에서 다시 확인',async()=>{replace(await lookup(row,true));render();}));list.append(card);
  }
 }
 search.oninput=render;render();
}
