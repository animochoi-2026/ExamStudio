const labels={prepare:'시험지 자료 확인 중',layout:'페이지 구성 중',resources:'이미지와 수식 준비 중',pages:'PDF 페이지 생성 중',assemble:'PDF 파일 조립 중',upload:'R2에 저장 중',verify:'파일 확인 중'};
const seconds=n=>n<60?`약 ${Math.max(5,Math.ceil(n/5)*5)}초`:`약 ${Math.ceil(n/60)}분`;
const historyKey=mode=>'image-pdf-times-v1:'+mode;
function samples(mode){try{return JSON.parse(localStorage.getItem(historyKey(mode))||'[]').filter(n=>n>0&&n<60000).slice(-7);}catch{return [];}}
export function imagePdfProgress(status,mode,externalSignal){
 const start=performance.now(),controller=new AbortController(),signal=externalSignal?AbortSignal.any([externalSignal,controller.signal]):controller.signal;
 const dialog=document.createElement('dialog');dialog.className='image-pdf-progress';dialog.setAttribute('aria-label','PDF 생성 진행');
 const heading=document.createElement('h2'),detail=document.createElement('p'),estimate=document.createElement('p'),meter=document.createElement('progress'),count=document.createElement('p'),actions=document.createElement('div');
 heading.textContent='PDF 생성';detail.setAttribute('role','status');meter.max=100;meter.removeAttribute('value');estimate.textContent='페이지를 계산하고 있습니다.';actions.className='actions';
 const button=(name,fn)=>{const b=document.createElement('button');b.textContent=name;b.onclick=fn;actions.append(b);return b;};
 let confirming=false,finished=false;
 const cancel=button('취소',()=>{confirming=true;confirmation.hidden=false;cancel.hidden=true;});
 const confirmation=document.createElement('div');confirmation.className='image-pdf-cancel-confirm';confirmation.hidden=true;
 const cancelText=document.createElement('p');cancelText.textContent='PDF 생성을 취소할까요? 기존 저장 파일은 유지됩니다.';
 const yes=document.createElement('button');yes.textContent='생성 취소 확인';yes.onclick=()=>{confirmation.hidden=true;detail.textContent='현재 페이지 작업을 정리하고 취소하는 중';controller.abort();};
 const no=document.createElement('button');no.textContent='계속 생성';no.onclick=()=>{confirming=false;confirmation.hidden=true;cancel.hidden=false;};confirmation.append(cancelText,yes,no);
 const toggle=button('최소화',()=>{dialog.close();show.hidden=false;});
 const show=document.createElement('button');show.className='image-pdf-show';show.textContent='PDF 생성 상태 보기';show.hidden=true;show.onclick=()=>{show.hidden=true;dialog.showModal();};
 dialog.append(heading,detail,estimate,meter,count,actions,confirmation);document.body.append(dialog,show);
 dialog.addEventListener('cancel',event=>{event.preventDefault();if(finished){dialog.close();dialog.remove();show.remove();}else if(!confirming)cancel.click();});dialog.showModal();
 let pages=0,pageStart=null,lastDone=0,renderElapsed=0;
 const report=event=>{
  const {stage,done=0,total=0}=event;pages=total||pages;detail.textContent=labels[stage]||stage;
  if(stage==='pages'||stage==='resources'){
   count.textContent=`${mode==='questions'?'문제지':mode==='quick'?'빠른 정답':mode==='detailed'?'상세풀이':'출력물'} ${done}/${total}페이지`;
   meter.value=10+70*done/Math.max(1,total);
   if(pageStart===null)pageStart=performance.now();
   const times=samples(mode),perPage=done>0?(performance.now()-pageStart)/done:times.length?times.sort((a,b)=>a-b)[Math.floor(times.length/2)]:null;
   estimate.textContent=perPage?`예상 남은 시간: ${seconds(Math.max(0,total-done)*perPage/1000+5)}~${seconds(Math.max(0,total-done)*perPage/1000*1.6+20)}`:'이 기기의 처리 시간을 측정 중입니다. 첫 페이지가 끝나면 예상 시간을 표시합니다.';
   lastDone=done;
   if(done)renderElapsed=performance.now()-pageStart;
  }else if(stage==='assemble'){meter.value=82;estimate.textContent='PDF 파일을 조립하고 있습니다.';}
  else if(stage==='upload'){meter.value=event.percent?85+event.percent*.08:85;estimate.textContent='업로드 중 · 연결 속도에 따라 시간이 달라집니다.';}
  else if(stage==='verify'){meter.value=95;estimate.textContent='업로드한 파일의 SHA256과 저장 결과를 확인하고 있습니다.';}
  status.textContent=detail.textContent+(count.textContent?' · '+count.textContent:'');
 };
 status.pdfProgress=report;status.pdfSignal=signal;report({stage:'prepare'});
 const finish=(file,error,{retry,previous}={})=>{
  finished=true;confirmation.hidden=true;
  delete status.pdfProgress;delete status.pdfSignal;cancel.hidden=true;toggle.hidden=true;show.hidden=true;
  heading.textContent=error?(signal.aborted?'PDF 생성 취소':'PDF 생성 실패'):'PDF 생성 완료';
  if(error){detail.textContent=signal.aborted?'취소했습니다. 기존 정상 PDF는 유지됩니다.':error.message;estimate.textContent='기존 정상 파일은 유지됩니다.';
   if(retry)button('다시 시도',async()=>{dialog.close();dialog.remove();show.remove();try{await retry();}catch(e){status.textContent='PDF 재시도 실패: '+e.message;}});
   if(previous)button('이전 저장본 다운로드',async()=>{try{await previous();estimate.textContent='이전 저장본을 다운로드했습니다. 현재 수정 내용은 포함되지 않습니다.';}catch(e){estimate.textContent=e.message;}});
  }
  else{
   const elapsed=performance.now()-start;detail.textContent=`실제 소요 시간 ${Math.ceil(elapsed/1000)}초 · ${file.pageCount||pages}쪽 · ${(file.blob.size/1048576).toFixed(2)}MB`;
   estimate.textContent=`삭제 예정일: ${new Date(file.expiresAt).toLocaleDateString('ko-KR')} · 시험지 최초 생성일부터 최대 6개월`;count.textContent='';meter.value=100;
   if(lastDone&&renderElapsed){try{localStorage.setItem(historyKey(mode),JSON.stringify([...samples(mode),renderElapsed/lastDone].slice(-7)));}catch{}}
   const url=URL.createObjectURL(file.blob);
   button('다운로드',()=>{const a=document.createElement('a');a.href=url;a.download=file.name;a.click();});
   button('열기',()=>window.open(url,'_blank','noopener'));
   button('인쇄',()=>window.open(url,'_blank','noopener'));
   dialog.addEventListener('close',()=>URL.revokeObjectURL(url),{once:true});
  }
  button('닫기',()=>{dialog.close();dialog.remove();show.remove();});if(!dialog.open)dialog.showModal();
 };
 return {signal,report,finish};
}
