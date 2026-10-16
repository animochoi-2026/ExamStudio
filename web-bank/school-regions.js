let registry=[];
const text=v=>String(v||'').trim(),collator=new Intl.Collator('ko-KR',{numeric:true,sensitivity:'base'}),compare=(a,b)=>collator.compare(text(a),text(b));
export function setSchoolRegions(rows){registry=Array.isArray(rows)?rows:[];}
export function schoolRegion(source){
 const s=typeof source==='string'?{school:source}:{...source,school:source?.school||source?.name,schoolId:source?.schoolId||source?.school_key||source?.id};
 const key=s.schoolId||[s.region||'',text(s.school)].join('|');
 const exact=registry.find(r=>r.school_key===key||(s.schoolId&&r.id===s.schoolId));
 if(exact)return exact;
 const matches=registry.filter(r=>r.name===s.school);return matches.length===1?matches[0]:null;
}
export function regionLabel(source){
 const r=schoolRegion(source);if(r?.status!=='verified')return '지역 확인 필요';
 const duplicate=registry.some(x=>x.status==='verified'&&x.district===r.district&&x.province!==r.province);
 return duplicate?[r.province.replace(/특별시|광역시|특별자치시|특별자치도|도$/g,''),r.district].join(' '):r.district;
}
export function schoolLabel(source){const name=typeof source==='string'?source:source?.school||'';return `[${regionLabel(source)}] ${name}`;}
export function compareSchools(a,b){const x=regionLabel(a),y=regionLabel(b);return Number(x==='지역 확인 필요')-Number(y==='지역 확인 필요')||compare(x,y)||compare(typeof a==='string'?a:a.school,typeof b==='string'?b:b.school)||compare(schoolRegion(a)?.school_key,schoolRegion(b)?.school_key);}
export function schoolMatches(source,query){const r=schoolRegion(source),name=typeof source==='string'?source:source?.school,haystack=[name,r?.province,r?.district,r?.address].filter(Boolean).join(' ').toLocaleLowerCase();return text(query).toLocaleLowerCase().split(/\s+/).every(token=>haystack.includes(token));}
export function appendSchoolGroups(parent,items,{node,source=x=>x,render}){
 parent.classList.add('school-region-groups');
 let previous,itemsRoot;for(const item of [...items].sort((a,b)=>compareSchools(source(a),source(b)))){
  const region=regionLabel(source(item));if(region!==previous){const group=node('section','','school-region-group'),heading=node('h4',`[${region}]`,'school-region-heading');itemsRoot=node('div','','school-region-items');group.append(heading,itemsRoot);parent.append(group);previous=region;}itemsRoot.append(render(item));
 }
}
export function schoolOptions(select,items,node,{source=x=>x,value=x=>x,label=x=>x}={}){
 let group,previous;for(const item of [...items].sort((a,b)=>compareSchools(source(a),source(b)))){const region=regionLabel(source(item));if(region!==previous){group=node('optgroup');group.label=`[${region}]`;select.append(group);previous=region;}const option=node('option',label(item));option.value=value(item);group.append(option);}
}
