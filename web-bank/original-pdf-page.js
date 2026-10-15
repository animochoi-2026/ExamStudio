import {readChunkRange} from './file-storage.js';
const CHUNK=6291456;
export function originalPageReferences(data){
 const project=data.bundle.native.project,sources=project.sources?.length?project.sources:[{...project.source,id:'primary'}],result=[];
 for(const [index,region] of (data.problem.regions||[]).entries()){
  if(!Number.isInteger(region.page)||region.page<1)continue;
  const source=sources.find(s=>s.id===(region.sourceId||'primary')),key=source?.path?.startsWith('bank-asset:')?source.path.slice(11):null;
  const file=data.bundle.files.find(f=>f.key===key&&f.role==='source');
  if(!file||!/^.+\.pdf$/i.test(file.name||source?.name||''))continue;
  const same=result.find(r=>r.file.id===file.id&&r.page===region.page);if(same){same.regions.push(region);continue;}
  result.push({file,page:region.page,index,regions:[region]});
 }
 return result;
}
export async function originalPdfPage({client,config,file,page,signal}){
 let query=client.from('bank_entries').select('*').eq('id',file.id).single();if(signal)query=query.abortSignal(signal);const {data:entry,error}=await query;if(error)throw Error(error.message);
 if(!entry.verified||entry.space_id!==config.spaceId||entry.props?.role!=='source'||entry.size!==file.size||entry.sha256!==file.sha256||entry.chunks!==Math.ceil(entry.size/CHUNK))throw Error('원본 PDF 참조를 확인할 수 없습니다.');
 // Loaded only for a wide-screen review whose original crop is absent.
 const runtime=new URL('./runtime/pdfjs/',document.baseURI).href;
 const pdfjs=await import(runtime+'pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc=runtime+'pdf.worker.mjs';
 const controller=new AbortController(),transport=new pdfjs.PDFDataRangeTransport(entry.size,null,false);let task,failure;
 const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});
 transport.abort=abort;
 transport.requestDataRange=(begin,end)=>{void(async()=>{
  const bytes=new Uint8Array(end-begin);let cursor=begin;
  while(cursor<end){const index=Math.floor(cursor/CHUNK),offset=cursor%CHUNK,stop=Math.min(end,(index+1)*CHUNK),key=`${config.spaceId}/${file.id}/${String(index).padStart(3,'0')}`;
   bytes.set(await readChunkRange(client,config,key,offset,offset+stop-cursor,{signal:controller.signal}),cursor-begin);cursor=stop;}
  transport.onDataRange(begin,bytes);
 })().catch(error=>{failure=error;void task?.destroy();});};
 try{
  signal?.throwIfAborted();task=pdfjs.getDocument({range:transport,disableStream:true,disableAutoFetch:true,rangeChunkSize:65536,isEvalSupported:false,cMapUrl:runtime+'cmaps/',cMapPacked:true,standardFontDataUrl:runtime+'standard_fonts/',wasmUrl:runtime+'wasm/'});
  const pdf=await task.promise;if(page>pdf.numPages)throw Error('원본 PDF 페이지 번호가 잘못되었습니다.');const source=await pdf.getPage(page),base=source.getViewport({scale:1}),viewport=source.getViewport({scale:Math.min(2,1200/base.width)}),canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
  const render=source.render({canvasContext:canvas.getContext('2d'),viewport});const cancel=()=>render.cancel();controller.signal.addEventListener('abort',cancel,{once:true});try{await render.promise;}finally{controller.signal.removeEventListener('abort',cancel);}
  signal?.throwIfAborted();const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('원본 PDF 페이지 표시 실패');return blob;
 }catch(error){throw failure||error;}finally{signal?.removeEventListener('abort',abort);controller.abort();await task?.destroy();}
}
