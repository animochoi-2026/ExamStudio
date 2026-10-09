'use strict';
const curriculum = require('../app/curriculum.js');

// Collapse complete chapters, but never imply coverage of unselected lessons.
function scopeLabel(ids = []) {
 const selected = new Set(ids), tokens = [];
 let order = 0;
 for (const grade of curriculum.tree) for (const term of grade.children) for (const chapter of term.children) {
  const start = order, leaves = chapter.children;
  const course=term.course?term.title:'',semester=grade.id.startsWith('e')?term.title:'';
  const chosen = leaves.filter(leaf => selected.has(leaf.id) || selected.has(chapter.id) || selected.has(term.id) || selected.has(grade.id));
  if (chosen.length === leaves.length) tokens.push({title:chapter.title,start,end:start+leaves.length-1,grade:grade.title,course,semester,full:true});
  else for (const leaf of chosen) {const at=start+leaves.indexOf(leaf);tokens.push({title:leaf.title,start:at,end:at,grade:grade.title,course,semester,full:false});}
  order += leaves.length;
 }
 const groups=[];
 for (const token of tokens) {
  const last=groups.at(-1), prior=last?.at(-1);
  if(prior && prior.end+1===token.start && prior.grade===token.grade && prior.course===token.course && prior.semester===token.semester && prior.full===token.full) last.push(token);
  else groups.push([token]);
 }
 const multipleGrades=new Set(tokens.map(t=>t.grade)).size>1;
 return groups.map(g=>(multipleGrades?g[0].grade+' ':'')+(g[0].course||g[0].semester?(g[0].course||g[0].semester)+' · ':'')+g[0].title+(g.length>1?'~'+g.at(-1).title:'')).join(', ');
}

// First-page instructions occupy only the left column. Subsequent pages have
// their own measured header height; keep all questions whole and in order.
function paginateForm(items, geometry, gap=18) {
 return require('../app/exam-layout.js').paginateQuestionAreas(items,geometry,gap);
}
function profileKey(space,user){return 'bank-exam-form:'+encodeURIComponent(space)+':'+encodeURIComponent(user);}
module.exports={scopeLabel,paginateForm,profileKey};
