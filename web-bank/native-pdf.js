import security from '../app/download-security.cjs';
import {readyForExport,exportContainer} from './export-resources.js';

export const PDF_ENGINE='chromium-vector-v2-noto-1';
const printCss=`@page{size:A4;margin:0}html,body{margin:0!important;padding:0!important;min-height:0!important;background:white!important}body::before,body::after{display:none!important}.exam-pages{position:static!important;transform:none!important;zoom:1!important}.exam-page{margin:0!important;border:0!important;box-shadow:none!important;break-after:page!important;break-inside:avoid!important}.exam-page:last-child{break-after:auto!important}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}`;
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const resourceCache=new Map();
async function dataUrl(url){
 if(url.startsWith('data:'))return url;
 if(!resourceCache.has(url)){if(resourceCache.size>=256)resourceCache.delete(resourceCache.keys().next().value);resourceCache.set(url,(async()=>{
  const parsed=new URL(url,location.href);if(parsed.origin!==location.origin&&parsed.protocol!=='blob:')throw Error('출력 자산 주소를 확인하세요.');
  const response=await fetch(parsed,{credentials:'same-origin',signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('출력 자산을 불러오지 못했습니다.');
  const blob=await response.blob();return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('출력 자산 변환 실패'));reader.readAsDataURL(blob);});
 })().catch(error=>{resourceCache.delete(url);throw error;}));}
 return resourceCache.get(url);
}
function matchesRange(range,chars){
 if(!range)return true;
 return range.split(',').some(value=>{const m=value.trim().match(/^U\+([0-9a-f?]+)(?:-([0-9a-f]+))?$/i);if(!m)return false;const low=parseInt(m[1].replaceAll('?','0'),16),high=parseInt(m[2]||m[1].replaceAll('?','f'),16);return [...chars].some(code=>code>=low&&code<=high);});
}
async function stylesFor(root){
 const chars=new Set([...root.textContent].map(c=>c.codePointAt(0))),chunks=[];
 const inline=async(text,base)=>{
  const urls=[...text.matchAll(/url\(\s*['"]?([^'"\)]+)['"]?\s*\)/g)];
  for(const match of urls){if(match[1].startsWith('#'))continue;text=text.replaceAll(match[0],'url("'+await dataUrl(new URL(match[1],base).href)+'")');}return text;
 };
 async function visit(sheet){
  for(const rule of sheet.cssRules){
   if(rule.type===CSSRule.IMPORT_RULE){await visit(rule.styleSheet);continue;}
   if(rule.type===CSSRule.FONT_FACE_RULE&&!matchesRange(rule.style.getPropertyValue('unicode-range'),chars))continue;
   chunks.push(await inline(rule.cssText,sheet.href||location.href));
  }
 }
 for(const sheet of document.styleSheets)await visit(sheet);
 return chunks.join('\n')+'\n'+printCss;
}

// Snapshot the already paginated DOM once. Only original image elements remain
// images; text, KaTeX spans, SVG paths and page forms are never rasterized.
export async function prepareNativePdf(pages,title,status,{securityWatermark,questionCount,answerWatermarks=false,section='all'}={}){
 const started=performance.now(),container=exportContainer();
 try{
  const sheets=[...pages.querySelectorAll('.exam-page')].filter(p=>section==='all'||p.classList.contains('answer-page')===(section==='answers')).map(p=>p.cloneNode(true));
  if(!sheets.length)throw Error('출력할 페이지가 없습니다.');container.append(...sheets);
  status.textContent='준비 중 · 글꼴·수식·그림 확인';await readyForExport(container);
  if(container.querySelector('.katex-error,[data-incomplete]'))throw Error('출력할 수식 또는 그림을 확인하세요.');
  const ends=new Map(),answers=new Map();
  for(const page of sheets){
   if(page.scrollHeight>page.clientHeight+2)throw Error('페이지 넘침이 있습니다. 배치를 조정하세요.');
   for(const q of page.querySelectorAll('.print-question[data-index]'))ends.set(q.dataset.index,{page,node:q});
   for(const marker of page.querySelectorAll('.answer-watermark[data-index]')){
    const r=marker.getBoundingClientRect(),frame=(marker.closest('.solution-flow-frame')||page).getBoundingClientRect();
    if(r.left<frame.left-1||r.right>frame.right+1||r.top<frame.top-1||r.bottom>frame.bottom+1)continue;
    if(answers.has(marker.dataset.index))throw Error('정답지 문항 위치가 중복되었습니다.');answers.set(marker.dataset.index,{page,node:marker});
   }
  }
  if(securityWatermark!==undefined){
   security.identifier(securityWatermark);
   if((answerWatermarks?answers:ends).size!==questionCount)throw Error('출력 문항 수를 확인하지 못했습니다.');
   for(const [kind,marks]of [['question',ends],['answer',answers]])for(const [index,{page,node}]of marks){
    const r=node.getBoundingClientRect(),bounds=page.getBoundingClientRect(),mark=document.createElement('span');
    mark.dataset.nativeWatermark=kind;mark.dataset.index=index;
    mark.style.cssText=`position:absolute;left:${r.left-bounds.left+1}px;top:${r.bottom-bounds.top-2}px;color:white!important;font:1pt/1 Arial!important;white-space:nowrap;pointer-events:none`;
    page.append(mark);
   }
  }
  // Inline each resource once in the request. The renderer has no network access.
  await Promise.all([...container.querySelectorAll('img')].map(async img=>{img.src=await dataUrl(img.currentSrc||img.src);img.removeAttribute('srcset');img.loading='eager';}));
  const css=await stylesFor(container);
  for(const node of container.querySelectorAll('script,iframe,object,embed,link,meta,form,button,input,textarea,select'))node.remove();
  for(const node of container.querySelectorAll('*'))for(const attr of [...node.attributes])if(/^on/i.test(attr.name)||['href','action','formaction','contenteditable'].includes(attr.name))node.removeAttribute(attr.name);
  const geometry=sheets.map(p=>({width:p.getBoundingClientRect().width,height:p.getBoundingClientRect().height}));
  const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline';"><title>${escape(title)}</title><style>${css.replaceAll('</style','<\\/style')}</style></head><body><div class="exam-pages export-pages">${sheets.map(p=>p.outerHTML).join('')}</div></body></html>`;
  return {engine:PDF_ENGINE,html,title,pageCount:sheets.length,questionCount,answerWatermarks,section,geometry,preparedMs:performance.now()-started};
 }finally{container.remove();}
}
