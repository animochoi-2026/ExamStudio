export function chooseQueueUploads(rows){
 const completed=rows.filter(r=>r.state==='complete');
 if(!completed.length)return Promise.resolve({});
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.className='modal';dialog.setAttribute('aria-label','기존 업로드 완료 시험지');
  const body=document.createElement('div');body.className='modal-body';dialog.append(body);
  const text=(tag,value)=>{const node=document.createElement(tag);node.textContent=value;body.append(node);return node;};
  text('h2','이미 업로드가 완료된 시험지가 있습니다.');text('p','시험지별로 다시 올리거나 이번 업로드에서 제외할 수 있습니다. 기존 자료는 삭제하지 않습니다.');
  const choices=new Map();
  for(const row of completed){const m=row.metadata;const label=text('label',(m.school||row.name)+' · '+[m.academicYear,m.grade,m.semester,m.exam].filter(Boolean).join(' · ')+' · 기존 업로드 '+row.count+'문항 완료');
   label.style.display='block';label.style.marginBlock='1rem';const select=document.createElement('select');select.setAttribute('aria-label',(m.school||row.name)+' 업로드 선택');
   for(const [value,title]of [['exclude','이번 업로드에서 제외'],['reupload','다시 올리기']]){const option=document.createElement('option');option.value=value;option.textContent=title;select.append(option);}label.append(select);choices.set(row.id,select);
  }
  const actions=text('div','');actions.className='exam-queue-actions';let settled=false;
  const finish=value=>{if(settled)return;settled=true;dialog.close();dialog.remove();resolve(value);};
  const button=(label,click)=>{const b=document.createElement('button');b.type='button';b.className='button outline';b.textContent=label;b.onclick=click;actions.append(b);};
  button('전체 제외',()=>{for(const select of choices.values())select.value='exclude';});
  button('전체 다시 올리기',()=>{if(window.confirm('목록의 모든 시험지를 다시 올리겠습니까?'))for(const select of choices.values())select.value='reupload';});
  button('취소',()=>finish(null));button('선택대로 진행',()=>finish(Object.fromEntries([...choices].map(([id,select])=>[id,select.value]))));
  dialog.addEventListener('cancel',event=>{event.preventDefault();finish(null);});
  document.body.append(dialog);dialog.showModal();
 });
}
