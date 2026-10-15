const normalize=s=>String(s||'').replace(/\s/g,'').replace(/중학교$/,'중').replace(/고등학교$/,'고').replace(/초등학교$/,'초');
export function classifySchoolPlaces(name,places,knownAddress=''){
 const candidates=(places||[]).filter(p=>normalize(p.displayName?.text)===normalize(name)&&p.types?.some(t=>['school','primary_school','secondary_school'].includes(t))).map(p=>{
  const parts=p.addressComponents||[],province=parts.find(c=>c.types?.includes('administrative_area_level_1'))?.longText||'';
  const districts=parts.filter(c=>!c.types?.includes('administrative_area_level_1')&&/[시군구]$/.test(c.longText||''));
  const district=districts.find(c=>/구$/.test(c.longText))?.longText||districts.find(c=>/군$/.test(c.longText))?.longText||districts.find(c=>/시$/.test(c.longText))?.longText||'';
  return {place_id:p.id,name:p.displayName.text,address:p.formattedAddress||'',province,district};
 }).slice(0,10);
 const matches=knownAddress?candidates.filter(c=>normalize(c.address).includes(normalize(knownAddress))):candidates;
 const chosen=matches.length===1&&matches[0].province&&matches[0].district?matches[0]:null;
 return chosen?{...chosen,status:'verified',source:'google_places',candidates}: {status:candidates.length?'ambiguous':'unverified',source:'google_places',candidates};
}

export function schoolPlacesHandler({env,fetchImpl=fetch}){
 const origins=(env('BANK_FILE_ORIGINS')||'https://examstudio-shared-bank.pages.dev').split(',').map(x=>x.trim());
 return async request=>{
  const origin=request.headers.get('origin'),headers={'content-type':'application/json','cache-control':'no-store','vary':'Origin','access-control-allow-headers':'authorization, apikey, content-type, x-client-info, x-exam-grade','access-control-allow-methods':'POST, OPTIONS'};
  if(origin&&!origins.includes(origin))return new Response(null,{status:403});if(origin)headers['access-control-allow-origin']=origin;
  const reply=(status,value)=>Response.json(value,{status,headers});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});if(request.method!=='POST')return reply(405,{error:'POST required'});
  try{
   const authorization=request.headers.get('authorization');if(!authorization?.startsWith('Bearer '))return reply(401,{error:'로그인이 필요합니다.'});
   const authHeaders={apikey:env('SUPABASE_ANON_KEY'),authorization,'content-type':'application/json'};
   const call=async(name,args)=>{const r=await fetchImpl(env('SUPABASE_URL')+'/rest/v1/rpc/'+name,{method:'POST',headers:authHeaders,body:JSON.stringify(args),signal:AbortSignal.timeout(45000)});const v=await r.json();if(!r.ok)throw Error(r.status===403?'학교 관리 권한이 필요합니다.':v.message||'학교 정보 조회 실패');return v;};
   const raw=await request.text();if(raw.length>2000)return reply(413,{error:'요청이 너무 큽니다.'});const {spaceId,schoolKey,force=false}=JSON.parse(raw);
   // This RPC checks the caller's live owner membership before Google is called.
   const rows=await call('bank_school_regions_sync',{s:spaceId}),school=rows.find(r=>r.school_key===schoolKey);if(!school)return reply(404,{error:'등록된 학교가 아닙니다.'});
   if(school.checked_at&&!force)return reply(200,{school,reused:true});
   const key=env('GOOGLE_MAPS_API_KEY');if(!key)return reply(503,{error:'서버 GOOGLE_MAPS_API_KEY 등록 후 지역 확인을 실행해 주세요.',code:'maps_key_missing'});
   const claim=await call('bank_school_region_claim',{s:spaceId,k:schoolKey,expected:school.version,force_lookup:!!force});if(claim.busy)return reply(409,{error:'이 학교의 지역을 확인 중입니다. 잠시 후 다시 확인하세요.'});if(claim.reused)return reply(200,claim);
   let value;try{const response=await fetchImpl('https://places.googleapis.com/v1/places:searchText',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':'places.id,places.displayName,places.formattedAddress,places.addressComponents,places.types'},body:JSON.stringify({textQuery:[school.name,school.address].filter(Boolean).join(' '),languageCode:'ko',regionCode:'KR',pageSize:10}),signal:AbortSignal.timeout(20000)});
   if(!response.ok)throw Error('Google Places response failed');value=classifySchoolPlaces(school.name,(await response.json()).places,school.address);
   }catch{value={province:school.province,district:school.district,address:school.address,place_id:school.place_id,status:'failed',source:'google_places',candidates:[]};}
   const saved=await call('bank_school_region_save',{s:spaceId,k:schoolKey,expected:school.version,value});return reply(200,{school:saved,reused:false});
  }catch(error){return reply(400,{error:error.name==='TimeoutError'?'학교 지역 조회 시간이 초과되었습니다.':error.message});}
 };
}
