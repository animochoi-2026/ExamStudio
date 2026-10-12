'use strict';
const curriculum=require('../app/curriculum.js');
function rangeTitle(units=[]){
 const selected=new Set(units.flatMap(id=>curriculum.descendants(id))),groups=[];
 for(const leaf of curriculum.leaves){
  const key=[leaf.gradeId,leaf.course||'',leaf.chapter].join('/');
  if(groups.at(-1)?.key!==key)groups.push({key,title:leaf.chapter,selected:false});
  if(selected.has(leaf.id))groups.at(-1).selected=true;
 }
 const runs=[];
 for(let i=0;i<groups.length;i++)if(groups[i].selected){let end=i;while(groups[end+1]?.selected)end++;runs.push(i===end?groups[i].title:groups[i].title+'~'+groups[end].title);i=end;}
 return runs.join('·');
}
function automaticTitle(catalogs=[],{schools,units=[]}={}){
 const names=[...new Set((schools??catalogs.map(c=>(c?.metadata?.source||c?.source||{}).school)).map(s=>String(s||'').trim()).filter(Boolean))];
 const name=names.length>2?names.slice(0,2).join('·')+` 외 ${names.length-2}교`:names.join('·');
 return [name,rangeTitle(units),'시험지'].filter(Boolean).join(' ');
}
function applyAutomaticTitle(draft,catalogs,options){
 if(draft.autoTitle===false&&draft.title?.trim())return draft.title;
 if(draft.autoTitle!==true&&draft.title?.trim())return draft.title;
 draft.autoTitle=true;draft.title=automaticTitle(catalogs,options);return draft.title;
}
module.exports={automaticTitle,applyAutomaticTitle,rangeTitle};
