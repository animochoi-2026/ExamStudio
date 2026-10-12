const fs=require('fs'),C=require('../app/curriculum.js');
const path='supabase/migrations/20261012054328_question_replacement.sql';
const ordinal=new Map(C.leaves.map((u,i)=>[u.id,i]));
const ranges=ids=>{const values=[...new Set(ids.map(id=>ordinal.get(id)).filter(Number.isInteger))].sort((a,b)=>a-b),parts=[];for(let i=0;i<values.length;){let lo=values[i],hi=lo+1;i++;while(i<values.length&&values[i]===hi){hi++;i++;}parts.push(`[${lo},${hi})`);}return '{'+parts.join(',')+'}';};
const values=C.leaves.map((u,i)=>({id:u.id,title:u.title,grade:u.grade,parent:[u.gradeId,u.semester,u.chapter].join('|'),concept:u.conceptKey||null,ordinal:i,allowed:ranges(C.allowedUnitIds([u.id]))}));
const sql="insert into bank_query.units select * from jsonb_to_recordset($taxonomy$"+JSON.stringify(values)+"$taxonomy$::jsonb) as x(id text,title text,grade text,parent text,concept text,ordinal integer,allowed int4multirange);";
const source=fs.readFileSync(path,'utf8');fs.writeFileSync(path,source.replace(/-- CURRICULUM_ROWS[^\n]*\n(?:insert into bank_query.units[^\n]*\n)?/,'-- CURRICULUM_ROWS (generated from the application curriculum)\n'+sql+'\n'));console.log('Generated private taxonomy:',values.length,'units');
