export async function readyForExport(page){
 // Flush new page styles before fonts.ready: otherwise the promise can refer
 // to the preceding page and the first math glyph changes after measurement.
 page.getBoundingClientRect();
 let timer;
 try{await Promise.race([
  Promise.all([document.fonts.ready,...[...page.querySelectorAll('img')].map(async image=>{try{await image.decode();}catch{throw Error('출력할 그림 또는 폼 이미지를 읽지 못했습니다.');}})]),
  new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('출력에 필요한 글꼴·그림을 준비하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도하세요.')),30000);})
 ]);}finally{clearTimeout(timer);}
}
export function exportContainer(){
 const container=document.createElement('div');container.className='exam-pages export-pages';container.style.cssText='position:fixed;left:-10000px;top:0;transform:none;zoom:1';document.body.append(container);return container;
}
// html2canvas otherwise clones every preview page (and the rest of the app)
// for every output page. Keep only this immutable page in the render clone.
export const canvasOptions=container=>({scale:3,backgroundColor:'#ffffff',logging:false,ignoreElements:element=>element.parentElement===document.body&&element!==container&&element.tagName!=='STYLE'&&element.tagName!=='LINK'});
export async function pngBytes(canvas){
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
 if(!blob)throw Error('출력 페이지 이미지를 만들지 못했습니다.');
 return new Uint8Array(await blob.arrayBuffer());
}
