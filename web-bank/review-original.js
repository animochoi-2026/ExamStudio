// Original crops are read through the same verified, permission-checked reader.
// A narrow viewport keeps the existing recognized-question view unchanged.
export function reviewOriginal({root,reader,id,node,action,isCurrent}){
 const row=node('div','','review-comparison'),original=node('section','','review-original'),recognized=node('section','','review-recognized');
 original.append(node('h3','원본 시험지'));recognized.append(node('h3','인식된 문항'));
 const status=node('p','원본 스캔을 불러오는 중입니다.','hint'),images=node('div','','review-original-images');status.setAttribute('role','status');original.append(status,images);row.append(original,recognized);root.append(row);
 const media=matchMedia('(min-width: 761px)'),controller=new AbortController();let started=false;
 async function load(){
  if(started||!media.matches||!isCurrent())return;started=true;
  try{const data=await reader.original(id,{signal:controller.signal});if(!isCurrent())return;
   if(!data.length){status.textContent='원본 스캔을 찾을 수 없습니다.';return;}
   status.textContent=data.some(item=>item.kind==='page')?'문항 crop이 없어 해당 원본 PDF 페이지를 표시합니다. 문항 좌표가 있으면 테두리로 표시합니다.':'현재 문항의 원본 영역 · 이미지를 누르면 확대됩니다.';
   for(const item of data){const figure=node('figure'),image=item.image;image.alt=`원본 ${item.page}쪽 · ${item.kind==='page'?'전체 페이지':'문항 영역 '+(item.index+1)}`;const button=action('',()=>{const dialog=node('dialog','','preview-dialog original-scan-dialog'),close=action('닫기',()=>dialog.close()),large=image.cloneNode();dialog.append(close,large);document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();});button.setAttribute('aria-label',image.alt+' 확대');button.append(image);
    if(item.kind==='page'){button.classList.add('original-page-position');for(const r of item.regions||[]){if(![r.x,r.y,r.width,r.height].every(Number.isFinite)||r.x<0||r.y<0||r.width<=0||r.height<=0||r.x+r.width>1.001||r.y+r.height>1.001)continue;const mark=node('span','','original-page-region');mark.style.left=(100*r.x)+'%';mark.style.top=(100*r.y)+'%';mark.style.width=(100*r.width)+'%';mark.style.height=(100*r.height)+'%';mark.setAttribute('aria-label','현재 문항 영역');button.append(mark);}}
    figure.append(node('figcaption',`원본 ${item.page}쪽`),button);images.append(figure);}
  }catch(error){if(isCurrent()){status.textContent='원본 스캔 조회 실패: '+error.message;const retry=action('원본 다시 불러오기',()=>{retry.remove();started=false;return load();});original.append(retry);}}
 }
 const observer=new MutationObserver(()=>{if(!row.isConnected){controller.abort();media.removeEventListener('change',load);observer.disconnect();}});observer.observe(root.parentNode,{childList:true,subtree:true});media.addEventListener('change',load);void load();
 return recognized;
}
