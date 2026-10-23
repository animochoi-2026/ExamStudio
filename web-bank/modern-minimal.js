import model from '../app/modern-minimal.cjs';
import curriculum from '../app/curriculum.js';
import scopes from './exam-form-model.cjs';
import {gradeLabel} from './grade-workspace.js';
export const {isModern,bodySize}=model;
export function modernInfo(draft){
 const f=draft.paperForm||{},units=draft.rules?.units||[];
 const selected=new Set(units.flatMap(id=>curriculum.descendants(id)));
 const grades=[...new Set(curriculum.leaves.filter(x=>selected.has(x.id)).map(x=>x.grade))];
 const grade=f.grade||gradeLabel(draft.workspaceGrade)||draft.workspaceGrade||grades.join('·');
 return {academy:f.academyName||'',title:draft.examTitle??draft.title??'',type:draft.variantLabel??f.typeLabel??'',round:draft.roundLabel??f.roundLabel??'',grade,subject:f.subject||'수학',scope:scopes.scopeLabel(units),minutes:f.minutes,count:draft.items?.length??draft.questions?.length??0};
}
export function modernHeader(node,draft){
 const info=modernInfo(draft),f=draft.paperForm,header=node('header','','modern-header');
 const brand=node('div','','modern-brand');
 if(f.logo&&f.logoVisible!==false){const img=node('img','','modern-logo');img.src=f.logo;img.alt='학원 로고';brand.append(img);}
 brand.append(node('span',info.academy,'modern-academy'));header.append(brand);
 header.append(node('div',info.title,'modern-title'),node('div',info.type,'modern-type'));
 const row=node('div','','modern-info');row.append(node('span',[[info.grade,info.subject].filter(Boolean).join(' '),info.scope].filter(Boolean).join(' · ')),node('span',[info.minutes!==''&&info.minutes!=null?info.minutes+'분':'',info.count+'문항'].filter(Boolean).join(' / ')));header.append(row);
 const fields=node('div','','modern-students');for(const name of ['반명','이름']){const field=node('div');field.append(node('span',name),node('span','','modern-blank'));fields.append(field);}header.append(fields);return header;
}
export function modernFooter(node,draft,index,total){
 const info=modernInfo(draft),footer=node('div','','modern-footer'),number=node('span',String(index+1),'page-number');number.setAttribute('aria-label',`문제 ${total}쪽 중 ${index+1}쪽`);
 footer.append(node('span',info.academy),number,node('span',[[info.grade,info.subject].filter(Boolean).join(' '),info.round].filter(Boolean).join(' / ')));return footer;
}
export function modernQuestion(article,{number,points,section=false,workspaceMm=0,written=false}={}){
 for(const e of article.querySelectorAll('.question-number,.source-points,.modern-question-head,.modern-section,.modern-workspace'))e.remove();
 article.classList.add('modern-question');
 const head=document.createElement('div');head.className='modern-question-head';
 const label=document.createElement('span');label.className='question-number';label.textContent=/^\d+$/.test(String(number))?String(number).padStart(2,'0'):String(number);head.append(label);
 const score=document.createElement('span');score.className=points==null?'modern-number-rule':'source-points';score.textContent=points==null?'':'['+String(points).replace(/점$/,'')+'점]';head.append(score);article.prepend(head);
 if(section){const heading=document.createElement('div');heading.className='modern-section';heading.textContent='[서술형]';article.prepend(heading);}
 if(workspaceMm>0){const space=document.createElement('div');space.className='modern-workspace'+(written?' modern-ruled':'');space.style.height=workspaceMm+'mm';if(written)for(let y=24;y<workspaceMm*72/25.4;y+=24){const line=document.createElement('span');line.className='modern-writing-line';line.style.top=y+'pt';space.append(line);}article.append(space);}
 return article;
}

// html2canvas's Noto text baseline differs from Chromium's line box. Draw the
// form's short labels with browser font metrics in the export clone only.
// Body/math remain on the existing image-PDF and editable-document paths.
export async function rasterizeModernLabels(page){
 if(!page.classList.contains('exam-form-modern'))return;
 const selectors='.modern-academy,.modern-title,.modern-type,.modern-info>span,.modern-students>div>span:first-child,.modern-footer>span,.modern-question-head>span:not(.modern-number-rule),.modern-section';
 for(const el of page.querySelectorAll(selectors)){
  if(el.dataset.modernRaster||!el.textContent)continue;
  const text=el.textContent,s=getComputedStyle(el),box=el.getBoundingClientRect(),fontSize=parseFloat(s.fontSize),lineHeight=parseFloat(s.lineHeight)||fontSize*1.2;
  const range=document.createRange();range.selectNodeContents(el);const textRect=range.getBoundingClientRect();
  // The section also has a flex decoration, so restrict its label to the text.
  const width=el.matches('.modern-section')?textRect.width:box.width;
  const canvas=document.createElement('canvas');canvas.width=Math.ceil(width*3);canvas.height=Math.ceil(Math.max(box.height,lineHeight)*3);
  const ctx=canvas.getContext('2d');ctx.scale(3,3);ctx.font=`${s.fontStyle} ${s.fontWeight} ${fontSize}px ${s.fontFamily}`;ctx.fillStyle=s.color;
  const metrics=ctx.measureText(text),ascent=metrics.fontBoundingBoxAscent??metrics.actualBoundingBoxAscent,descent=metrics.fontBoundingBoxDescent??metrics.actualBoundingBoxDescent;
  ctx.textAlign=s.textAlign==='center'?'center':s.textAlign==='right'?'right':'left';
  const x=ctx.textAlign==='center'?width/2:ctx.textAlign==='right'?width:0;
  // Long scope text may wrap; retain its original DOM painting in that case.
  if(metrics.width>width+.5&&!el.matches('.modern-title,.modern-type'))continue;
  ctx.fillText(text,x,(lineHeight-ascent-descent)/2+ascent);
  const img=document.createElement('img');img.src=canvas.toDataURL();img.alt='';img.setAttribute('aria-hidden','true');img.style.cssText=`position:absolute;left:0;top:0;width:${width}px;height:${Math.max(box.height,lineHeight)}px;max-width:none;pointer-events:none`;
  if(s.position==='static'){el.style.position='relative';el.style.inset='auto';}el.style.color='transparent';el.dataset.modernRaster='true';el.append(img);await img.decode();
 }
}
