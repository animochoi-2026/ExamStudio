'use strict';
const D=require('./difficulty-assessment.cjs'),T=require('./question-types.cjs');
const difficultyLabels={...D.compositionLabels,killer:'킬러'};
const isKiller=c=>{const n=D.effective(c).number;return n!==null&&n>=require('./difficulty-policy.cjs').boundaries.killerMin;};
const fields=[['grade','학년'],['school','학교'],['academicYear','출제 학년도'],['semester','학기'],['unit','단원'],['type','유형']];
function values(c){const s=c.metadata?.source||{},f=c.confirmed||{},cl=c.metadata?.classification||{},u=f.primaryUnit||cl.confirmed?.primaryUnit||cl.primaryUnit;return {grade:s.grade,school:s.school,academicYear:s.academicYear,semester:s.semester,unit:typeof u==='object'?u?.name:u,type:T.effective(c).map(t=>t.name)};}
const list=x=>(Array.isArray(x)?x:[x]).filter(v=>v!=null&&String(v).trim()).map(String);
function clean(input={}){const out=Object.fromEntries(Object.entries(input).filter(([k,v])=>[...fields.map(x=>x[0]),'text','status','compositionBand'].includes(k)&&v!==''&&v!=null));if(out.compositionBand==='deferred')out.compositionBand='unknown';if(out.compositionBand&&!Object.hasOwn(difficultyLabels,out.compositionBand))delete out.compositionBand;return out;}
function options(rows){return Object.fromEntries(fields.map(([key])=>[key,[...new Set(rows.flatMap(c=>list(values(c)[key])))].sort((a,b)=>a.localeCompare(b,'ko',{numeric:true}))]));}
function matches(c,filters){const v=values(c);return fields.every(([key])=>!filters[key]||list(v[key]).includes(String(filters[key])))&&(!filters.compositionBand||(filters.compositionBand==='killer'?isKiller(c):D.compositionBand(c)===filters.compositionBand))&&(!filters.status||c.visibility===filters.status)&&(!filters.owner||c.owner_email===filters.owner);}
function recentSchools(rows){return [...new Set([...rows].sort((a,b)=>String(b.updated_at||b.created_at||'').localeCompare(String(a.updated_at||a.created_at||''))).map(c=>c.source?.school||c.metadata?.source?.school).filter(Boolean))];}
module.exports={difficultyLabels,isKiller,fields,values,clean,options,matches,recentSchools};
