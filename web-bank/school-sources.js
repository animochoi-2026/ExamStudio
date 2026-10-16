import {sourceBrowser} from './source-browser.js';
import {compareSchools,regionLabel,schoolMatches,schoolLabel} from './school-regions.js';
const compare=(a,b)=>String(a||'').localeCompare(String(b||''),'ko',{numeric:true})||String(a||'').localeCompare(String(b||''));
const time=value=>{const n=Date.parse(value);return Number.isFinite(n)?n:-Infinity;};
const recent=(a,b)=>{const x=time(a),y=time(b);return x===y?0:x>y?-1:1;};

// Group the complete visible metadata set before sorting or taking a school page.
// No question bodies, original PDFs or image resources are requested here.
export function groupSchoolSources(sources,order='name'){
 const groups=new Map();
 for(const entry of sources){const s=entry.source||{},key=s.schoolId||[s.region,s.school||entry.source_id].join('|');
  if(!groups.has(key))groups.set(key,{key,name:s.school||s.materialTitle||'출처 미입력',region:s.region||'',school:s.school||'',schoolId:s.schoolId,lastRegisteredAt:null,exams:[]});
  const group=groups.get(key);group.exams.push(entry);
  if(time(entry.last_registered_at)>time(group.lastRegisteredAt))group.lastRegisteredAt=entry.last_registered_at;
 }
 const all=[...groups.values()];
 if(order==='recent')for(const g of all)g.exams.sort((a,b)=>recent(a.last_registered_at,b.last_registered_at)||compare(a.source_id,b.source_id));
 // Alphabetic view intentionally retains the RPC's existing exam order.
 all.sort((a,b)=>compareSchools(a,b)||compare(a.key,b.key));
 return all;
}
export async function schoolSources(options){return sourceBrowser({...options,mode:options.order==='name'?'papers':'schools'});}
