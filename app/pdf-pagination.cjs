'use strict';
// Runs inside the isolated print window, after fonts and source images load.
// No estimated Word heights are used by Chromium pagination.
async function paginatePdf({mode='auto',space=0,snapshot={}},paginateQuestions){
 const form=await globalThis.ExamPaperForm?.prepare(snapshot);
 const mm=96/25.4,width=(form?form.width:182)*mm,gap=(form?9:10)*mm,columnWidth=(width-gap)/2;
 document.body.style.width=(form?210*mm:width)+'px';
 const nodes=[...document.querySelectorAll('.question')].sort((a,b)=>Number(a.dataset.questionIndex)-Number(b.dataset.questionIndex));
 const title=document.querySelector('h1')?.cloneNode(true)||document.createElement('h1');
 const notes=document.querySelector('.notes'),rule=document.querySelector('.page-column-rule');
 const measure=document.createElement('div');measure.style.width=columnWidth+'px';document.body.append(measure);
 const heights=nodes.map(node=>{measure.append(node);node.style.minHeight='0';globalThis.ExamPaperForm?.scaleFigures?.(node,snapshot.settings);return node.getBoundingClientRect().height+Number(node.dataset.workspacePx||0);});
 measure.append(title);const titleHeight=title.getBoundingClientRect().height+parseFloat(getComputedStyle(title).marginBottom);
 // A4 minus 14 mm margins and a rounding reserve. Oversized questions flow,
 // never get clipped or squeezed into a fixed-height flex column.
 const available=form?form.geometry.height:Math.floor(269*mm-titleHeight-2*mm),half=Math.floor(available/2);
 document.body.replaceChildren(measure);if(rule&&!form)document.body.append(rule);
 const pages=[];
 const fragmenters=[];
 const items=nodes.map((node,index)=>{
  const item={questionId:index,height:heights[index],layout:node.dataset.layout,breakBefore:node.dataset.breakBefore,element:node};
  if(heights[index]-Number(node.dataset.workspacePx||0)>available){item.fragmenter=globalThis.ExamPaperForm.fragmenter(snapshot.questions[index],index,snapshot.settings,node,measure);fragmenters.push(item.fragmenter);}
  return item;
 });
 let measured;
 try{measured=paginateQuestions(items,{...(form?form.geometry:{height:available}),slots:mode==='2'?1:2},18);}
 finally{fragmenters.forEach(f=>f.dispose());measure.remove();}
 if(measured.overflows.length)throw Error('문항의 내용 또는 풀이 공간이 한 단을 넘습니다. 표시된 문항을 확인하세요.');
  for(const page of measured.pages){
   const section=document.createElement('section');section.className='question-page'+(form?' exam-page '+form.className:'');section.append(form?form.header(pages.length):title.cloneNode(true));
   const columns=document.createElement('div');columns.className='planned-columns'+(form?' exam-columns':'');if(form)columns.style.height=(pages.length?form.geometry.height:form.geometry.firstHeight)+'px';
   for(const [ci,items]of page.columns.entries()){const column=document.createElement('div');column.className='planned-column'+(form?' exam-column':'');if(form&&form.geometry.introHeight>0&&pages.length===0&&ci===0){const intro=document.createElement('div');intro.style.height=form.geometry.introHeight+'px';intro.append(form.intro());column.append(intro);}
    for(const [slot,item]of items.entries()){const wrapper=document.createElement('div');wrapper.className='planned-slot';wrapper.dataset.top=item.top;wrapper.append(item.element);if(slot<items.length-1)wrapper.style.minHeight=(items[slot+1].top-item.top)+'px';column.append(wrapper);}
    columns.append(column);
   }
   section.append(columns);document.body.append(section);if(form)globalThis.ExamPaperForm.fit(section);pages.push({indices:page.columns.flat().map(q=>q.questionId),columns:page.columns.map(c=>c.map(q=>q.questionId)),positions:page.columns.map(c=>c.map(q=>({top:q.top,questionId:q.questionId,...(q.fragment?{fragmentIndex:q.fragmentIndex,fragment:q.fragment}:{})}))),overflow:false});
  }
 if(form){document.querySelectorAll('.question-page.exam-page').forEach((section,i)=>section.append(form.footer(i,pages.length)));}
 if(notes)document.body.append(notes);
 const clipped=[...document.querySelectorAll('.planned-column')].filter(c=>c.scrollHeight>(form?c.parentElement.clientHeight:available)+1);
 if(clipped.length)throw Error('PDF 페이지 높이를 초과했습니다. 글자 크기 또는 풀이 공간을 줄여 주세요.');
 return {pages,heights,available,columnWidth,formGeometry:form?.geometry||null};
}
module.exports={paginatePdf};
