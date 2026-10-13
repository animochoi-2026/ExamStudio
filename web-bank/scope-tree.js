import {currentGrade} from './grade-workspace.js';
import curriculum from '../app/curriculum.js';

// The same curriculum IDs and parent/child rules are used by the desktop editor.
export function scopeTree({node,selected,label='시험범위',gradeFilter=null,onChange=()=>{}}){
 if(currentGrade())gradeFilter=[currentGrade()];
 const root=node('div','','scope-tree'),checks=new Map(),branches=[];
 root.setAttribute('aria-label',label);
 const selectedSet=selected instanceof Set?selected:new Set(selected||[]);
 const refresh=()=>{for(const [id,check] of checks){const state=curriculum.state([...selectedSet],id);check.checked=state.checked;check.indeterminate=state.partial;}onChange([...selectedSet]);};
 function row(part,parent,depth=0){const branch=!!part.children,wrap=node(branch?'details':'div','','scope-node '+(branch?'scope-branch':'scope-leaf'));
  const line=node(branch?'summary':'div','','scope-node-line'),check=node('input');check.type='checkbox';check.setAttribute('aria-label',part.title);checks.set(part.id,check);
  check.onclick=e=>e.stopPropagation();check.onchange=()=>{const next=curriculum.toggle([...selectedSet],part.id,check.checked);selectedSet.clear();for(const id of next)selectedSet.add(id);refresh();};
  const caption=node('span',part.title+(part.category?' · '+part.category:''),'scope-node-title');line.append(check,caption);wrap.append(line);
  if(branch){wrap.open=depth<2||curriculum.state([...selectedSet],part.id).partial||curriculum.state([...selectedSet],part.id).checked;wrap.dataset.scopeId=part.id;branches.push(wrap);for(const child of part.children)row(child,wrap,depth+1);}else if(part.concepts?.length)wrap.append(node('small',part.concepts.join(' · '),'scope-concepts'));
  parent.append(wrap);
 }
 for(const grade of curriculum.tree)if(!gradeFilter||gradeFilter.includes(grade.id))row(grade,root);
 refresh();return {element:root,selected:selectedSet,refresh,branches};
}
