'use strict';
function automaticTitle(catalogs,{grade='',schools=[]}={}){
 const sources=catalogs.map(c=>c?.metadata?.source||c?.source||{}),values=key=>[...new Set(sources.map(s=>String(s[key]||'').trim()).filter(Boolean))];
 const school=values('school'),years=values('academicYear'),grades=values('grade'),terms=values('semester'),exams=values('exam');
 const names=school.length?school:schools;
 const name=names.length>2?names.slice(0,2).join('·')+` 외 ${names.length-2}교`:names.join('·');
 return [name,years.length===1?years[0]+'학년도':years.length>1?'여러 학년도':'',grades.join('·')||grade,terms.join('·'),exams.join('·'),sources.length?'수학':'수학 시험지'].filter(Boolean).join(' ');
}
function applyAutomaticTitle(draft,catalogs,options){
 if(draft.autoTitle===false&&draft.title?.trim())return draft.title;
 if(draft.autoTitle!==true&&draft.title?.trim())return draft.title;
 draft.autoTitle=true;draft.title=automaticTitle(catalogs,options);return draft.title;
}
module.exports={automaticTitle,applyAutomaticTitle};
