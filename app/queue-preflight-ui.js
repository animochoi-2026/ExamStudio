// One modal owns lookup, failure, and the final choice. Closing invalidates late replies.
export function checkQueueUploads({check,cancel,prepare=async()=>{}}){
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.className='modal';dialog.setAttribute('aria-label','기존 시험지 등록 여부');
  const body=document.createElement('div');body.className='modal-body';dialog.append(body);let settled=false,epoch=0;
  const text=(tag,value)=>{const el=document.createElement(tag);el.textContent=value;body.append(el);return el;};
  const button=(title,click)=>{const el=text('button',title);el.type='button';el.className='button outline';el.onclick=click;return el;};
  const finish=value=>{if(settled)return;settled=true;epoch++;if(value===null)void cancel().catch(()=>{});dialog.close();dialog.remove();resolve(value);};
  async function lookup(){const current=++epoch;body.replaceChildren();text('h2','기존 시험지 등록 여부 확인 중');text('p','서버에 이미 등록된 시험지를 확인하고 있습니다. 잠시 기다려 주세요.');const progress=text('progress','');progress.setAttribute('aria-label','등록 여부 조회 중');button('취소',()=>finish(null));
   try{await prepare();if(settled||current!==epoch)return;const plan=await check();if(settled||current!==epoch)return;
    const completed=plan.rows.filter(r=>r.state==='complete');if(!completed.length){finish({plan,choices:{}});return;}
    body.replaceChildren();text('h2','이미 등록된 시험지가 있습니다.');text('p','다시 인식하거나 이번 대기열에서 제외할 시험지를 선택해 주세요. 기존 서버 자료와 원본 파일은 유지됩니다.');const choices=new Map();
    for(const row of completed){const m=row.metadata||{},label=text('label',(m.school||row.name)+' · '+[m.academicYear,m.grade,m.semester,m.exam].filter(Boolean).join(' · ')+' · '+row.count+'/'+(row.expected??'?')+'문항 · '+row.registration);label.style.display='block';label.style.marginBlock='1rem';const select=document.createElement('select');select.setAttribute('aria-label',(m.school||row.name)+' 처리 선택');for(const [value,title]of [['exclude','대기열에서 제외'],['rerecognize','다시 인식']]){const option=document.createElement('option');option.value=value;option.textContent=title;select.append(option);}label.append(select);choices.set(row.id,select);}
    button('전체 제외',()=>{for(const s of choices.values())s.value='exclude';});
    button('전체 다시 인식',()=>{if(window.confirm('목록의 모든 시험지를 다시 인식하시겠습니까?'))for(const s of choices.values())s.value='rerecognize';});
    button('취소',()=>finish(null));button('선택대로 진행',()=>finish({plan,choices:Object.fromEntries([...choices].map(([id,s])=>[id,s.value]))}));
   }catch(error){if(settled||current!==epoch)return;body.replaceChildren();text('h2','등록 여부 조회 실패');text('p','기존 업로드 여부를 확인하지 못했습니다. 서버 연결을 확인한 뒤 다시 시도해 주세요.');text('p',error.message);button('재시도',lookup);button('취소',()=>finish(null));}
  }
  dialog.addEventListener('cancel',event=>{event.preventDefault();finish(null);});document.body.append(dialog);dialog.showModal();void lookup();
 });
}
