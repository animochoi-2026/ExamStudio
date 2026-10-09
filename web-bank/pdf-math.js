// html2canvas's text metrics clip KaTeX fraction baselines. Let the browser
// rasterize each indivisible KaTeX base with its existing local fonts instead.
// Only the PDF copy uses these images; native math and saved data stay intact.
let cssPromise;
const fontData=new Map();
async function mathResource(url,label){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
 try{const response=await fetch(url,{signal:controller.signal});if(!response.ok)throw Error(`${label}을 불러오지 못했습니다. (HTTP ${response.status})`);return await response.blob();}
 catch(error){if(controller.signal.aborted)throw Error(`${label} 응답이 없어 PDF 출력을 중단했습니다. 연결 상태를 확인하세요.`);throw error;}
 finally{clearTimeout(timer);}
}
const fileData=blob=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('수식 글꼴을 읽지 못했습니다.'));r.readAsDataURL(blob);});
async function mathCss(families){
 if(!cssPromise)cssPromise=mathResource(new URL('./katex.min.css',import.meta.url),'수식 스타일').then(blob=>blob.text()).catch(e=>{cssPromise=null;throw e;});
 const css=await cssPromise,faces=css.match(/@font-face\{[^}]*\}/g)||[],embedded=[];
 for(const face of faces){
  const family=/font-family:([^;]+)/.exec(face)?.[1];if(!families.has(family))continue;
  const relative=/url\(([^)]+\.woff2)\)/.exec(face)?.[1];if(!relative)throw Error('수식 글꼴 형식을 확인하지 못했습니다.');
  if(!fontData.has(relative))fontData.set(relative,mathResource(new URL(relative,import.meta.url),'수식 글꼴').then(fileData).catch(e=>{fontData.delete(relative);throw e;}));
  embedded.push(face.replace(/src:[^}]+/,`src:url("${await fontData.get(relative)}") format("woff2")`));
 }
 return embedded.join('')+css.replace(/@font-face\{[^}]*\}/g,'');
}
function bounds(element){
 const boxes=[element,...element.querySelectorAll('*')].flatMap(e=>Array.from(e.getClientRects())).filter(r=>r.width>0&&r.height>0);
 return {left:Math.min(...boxes.map(r=>r.left))-1,top:Math.min(...boxes.map(r=>r.top))-1,right:Math.max(...boxes.map(r=>r.right))+1,bottom:Math.max(...boxes.map(r=>r.bottom))+1};
}
function clipBounds(element,page){
 const p=page.getBoundingClientRect(),clip={left:p.left,top:p.top,right:p.right,bottom:p.bottom};
 for(let e=element.parentElement;e&&e!==page;e=e.parentElement){const style=getComputedStyle(e),r=e.getBoundingClientRect();
  if(/hidden|clip|auto|scroll/.test(style.overflowX)){clip.left=Math.max(clip.left,r.left);clip.right=Math.min(clip.right,r.right);}
  if(/hidden|clip|auto|scroll/.test(style.overflowY)){clip.top=Math.max(clip.top,r.top);clip.bottom=Math.min(clip.bottom,r.bottom);}
 }
 return clip;
}
async function islandImage(base){
 const math=base.closest('.katex'),families=new Set();
 for(const e of [base,...base.querySelectorAll('*')])for(const family of getComputedStyle(e).fontFamily.split(','))families.add(family.trim().replace(/["']/g,''));
 const css=await mathCss(families),wrapper=document.createElement('div'),clone=base.cloneNode(true),html=document.createElement('span');html.className='katex-html';html.append(clone);wrapper.className='katex';wrapper.append(html);
 wrapper.style.cssText=`position:fixed;left:-10000px;top:0;width:max-content;white-space:nowrap;font-size:${getComputedStyle(math).fontSize};line-height:${getComputedStyle(math).lineHeight};color:${getComputedStyle(math).color};`;
 document.body.append(wrapper);
 try{
  const box=bounds(clone),origin=wrapper.getBoundingClientRect(),width=box.right-box.left,height=box.bottom-box.top;
  wrapper.style.position='relative';wrapper.style.left='0';wrapper.style.top='0';wrapper.setAttribute('xmlns','http://www.w3.org/1999/xhtml');
  const xml=new XMLSerializer().serializeToString(wrapper);
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${box.left-origin.left} ${box.top-origin.top} ${width} ${height}"><style>${css}</style><foreignObject width="${Math.ceil(origin.width+4)}" height="${Math.ceil(Math.max(origin.height,box.bottom-origin.top)+4)}">${xml}</foreignObject></svg>`;
  const image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);await image.decode();return image;
 }finally{wrapper.remove();}
}
// Rasterize a mixed prose/math paragraph as one browser line box. html2canvas
// estimates the Korean font baseline separately from KaTeX's browser baseline;
// combining those two coordinate systems made ordinary variables look raised.
// Keep native inline layout (including real scripts/fractions), not a y offset.
export function pdfMathTargets(page){
 const blocks=[...page.querySelectorAll('.question-text,.structure-paragraph,.structure-proofStep')].filter(e=>e.querySelector('.katex')&&!e.parentElement.closest('.question-text,.structure-paragraph,.structure-proofStep'));
 const bases=[...page.querySelectorAll('.katex-html > .katex-base,.katex-html > .base,.katex-html > .tag')].filter(e=>!blocks.some(b=>b.contains(e)));
 return [...blocks,...bases];
}
async function paragraphImage(element){
 const rect=element.getBoundingClientRect(),families=new Set(),clone=element.cloneNode(true);
 const originals=[element,...element.querySelectorAll('*')],copies=[clone,...clone.querySelectorAll('*')];
 for(let i=0;i<originals.length;i++){
  const style=getComputedStyle(originals[i]);
  for(const family of style.fontFamily.split(','))families.add(family.trim().replace(/["']/g,''));
  // Freeze the styles actually used by this paragraph, including inherited
  // fonts and the KaTeX internal positions; no application CSS in the SVG.
  for(const prop of style)copies[i].style.setProperty(prop,style.getPropertyValue(prop));
 }
 clone.style.margin='0';clone.style.position='relative';clone.style.left='0';clone.style.top='0';clone.style.transform='none';clone.style.width=rect.width+'px';clone.style.height=rect.height+'px';clone.style.visibility='visible';
 clone.setAttribute('xmlns','http://www.w3.org/1999/xhtml');
 const css=await mathCss(families),svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${rect.width}" height="${rect.height}"><style>${css}</style><foreignObject width="${rect.width}" height="${rect.height}">${new XMLSerializer().serializeToString(clone)}</foreignObject></svg>`;
 const image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);await image.decode();return image;
}
export async function preparePdfMath(page){
 const images=[];
 for(const base of page.querySelectorAll('.katex-html > .katex-base,.katex-html > .base,.katex-html > .tag')){
  const box=bounds(base),clip=clipBounds(base,page);if(box.right<=clip.left||box.left>=clip.right||box.bottom<=clip.top||box.top>=clip.bottom)continue;
  images.push({box,clip,image:await islandImage(base)});
 }
 return images;
}
export function paintPdfMath(canvas,page,images){
 const rect=page.getBoundingClientRect(),scale=canvas.width/rect.width,context=canvas.getContext('2d');
 context.save();context.setTransform(1,0,0,1,0,0);
 for(const {box,clip,image} of images){context.save();context.beginPath();context.rect((clip.left-rect.left)*scale,(clip.top-rect.top)*scale,(clip.right-clip.left)*scale,(clip.bottom-clip.top)*scale);context.clip();context.drawImage(image,(box.left-rect.left)*scale,(box.top-rect.top)*scale,(box.right-box.left)*scale,(box.bottom-box.top)*scale);context.restore();}
 context.restore();
}
export async function renderPdfMath(canvas,page){
 let count=0;
 for(const base of pdfMathTargets(page)){
  const paragraph=base.matches('.question-text,.structure-paragraph,.structure-proofStep');
  const box=paragraph?base.getBoundingClientRect():bounds(base),clip=clipBounds(base,page);if(box.right<=clip.left||box.left>=clip.right||box.bottom<=clip.top||box.top>=clip.bottom)continue;
  const image=await (paragraph?paragraphImage(base):islandImage(base));
  try{paintPdfMath(canvas,page,[{box,clip,image}]);count++;}finally{image.removeAttribute('src');}
 }
 return count;
}
