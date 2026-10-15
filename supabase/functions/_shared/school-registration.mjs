import {classifySchoolPlaces} from './school-places.mjs';
// Called only after bank_finish has authenticated and committed an upload.
// Region failures never roll back or reclassify the uploaded question.
export async function registerSchoolRegion({revision,actor,url,service,key,fetchImpl=fetch}){
 if(!key||!revision)return {pending:true};
 const call=async args=>{const r=await fetchImpl(url+'/rest/v1/rpc/bank_school_region_registration',{method:'POST',headers:{apikey:service,authorization:'Bearer '+service,'content-type':'application/json'},body:JSON.stringify({revision,actor,...args}),signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('School registration metadata unavailable');return r.json();};
 const claim=await call({});if(!claim.claimed)return claim;const school=claim.school;let value;
 try{const r=await fetchImpl('https://places.googleapis.com/v1/places:searchText',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':'places.id,places.displayName,places.formattedAddress,places.addressComponents,places.types'},body:JSON.stringify({textQuery:[school.name,school.address].filter(Boolean).join(' '),languageCode:'ko',regionCode:'KR',pageSize:10}),signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Places unavailable');value=classifySchoolPlaces(school.name,(await r.json()).places,school.address);}
 catch{value={status:'failed',candidates:[]};}
 return call({expected:school.version,value});
}
