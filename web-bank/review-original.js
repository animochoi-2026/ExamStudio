// Original crops are read through the same verified, permission-checked reader.
// A narrow viewport keeps the existing recognized-question view unchanged.
export function reviewOriginal({root,reader,id,node,action,isCurrent}){
 const row=node('div','','review-comparison'),original=node('section','','review-original'),recognized=node('section','','review-recognized');
 original.append(node('h3','원본 시험지'));recognized.append(node('h3','인식된 문항'));
 const status=node('p','원본 스캔을 불러오는 중입니다.','hint'),images=node('div','','review-original-images');status.setAttribute('role','status');original.append(status,images);row.append(original,recognized);root.append(row);
 const media=matchMedia('(min-width: 761px)');let started=false;
 async function load(){
  if(started||!media.matches||!isCurrent())return;started=true;
  try{const data=await reader.original(id);if(!isCurrent())return;
   if(!data.length){status.textContent='원본 스캔을 찾을 수 없습니다.';return;}
   status.textContent='현재 문항의 원본 영역 · 이미지를 누르면 확대됩니다.';
   for(const item of data){const figure=node('figure'),image=item.image;image.alt=`원본 ${item.page}쪽 · 문항 영역 ${item.index+1}`;const button=action('',()=>{const dialog=node('dialog','','preview-dialog original-scan-dialog'),close=action('닫기',()=>dialog.close()),large=image.cloneNode();dialog.append(close,large);document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();});button.setAttribute('aria-label',image.alt+' 확대');button.append(image);figure.append(node('figcaption',`원본 ${item.page}쪽`),button);images.append(figure);}
  }catch(error){if(isCurrent()){status.textContent='원본 스캔 조회 실패: '+error.message;const retry=action('원본 다시 불러오기',()=>{retry.remove();started=false;return load();});original.append(retry);}}
 }
 const observer=new MutationObserver(()=>{if(!row.isConnected){media.removeEventListener('change',load);observer.disconnect();}});observer.observe(root.parentNode,{childList:true,subtree:true});media.addEventListener('change',load);void load();
 return recognized;
}
