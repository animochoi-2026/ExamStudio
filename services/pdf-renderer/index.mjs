import puppeteer from '@cloudflare/puppeteer';
import {renderVectorPdf} from './render.mjs';
import {openRenderSession,releaseRenderSession} from './session.mjs';
export default {async fetch(request,env){
 // Private service; only the authenticated Supabase gateway calls this endpoint.
 if(request.method!=='POST'||!env.RENDER_SECRET||request.headers.get('authorization')!=='Bearer '+env.RENDER_SECRET)return new Response('Forbidden',{status:403});
 return env.PDF_RENDERER.get(env.PDF_RENDERER.idFromName('shared-renderer')).fetch(request);
}};
export class PdfRenderer {
 constructor(ctx,env){this.ctx=ctx;this.env=env;this.tail=Promise.resolve();}
 async fetch(request){
  const work=this.tail.catch(()=>{}).then(()=>this.render(request));this.tail=work.then(()=>{},()=>{});return work;
 }
 async render(request){
 const env=this.env;
 if(Number(request.headers.get('content-length'))>32*1024*1024)return new Response('Too large',{status:413});
 let browser,context;try{
  const reader=request.body?.getReader();if(!reader)throw Error('Empty request');const chunks=[];let size=0;try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>32*1024*1024){await reader.cancel();throw Error('Too large');}chunks.push(value);}}finally{reader.releaseLock();}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}const {input,identity}=JSON.parse(new TextDecoder().decode(bytes));
  ({browser,context}=await openRenderSession(puppeteer,env.BROWSER,this.ctx.storage));
  const {data,timings,report}=await renderVectorPdf(context,input,identity);
  return new Response(data,{headers:{'content-type':'application/pdf','cache-control':'no-store','x-pdf-timings':JSON.stringify(timings),'x-pdf-report':JSON.stringify(report)}});
 }catch(error){return Response.json({error:error.message},{status:422});}finally{await releaseRenderSession({context,browser},this.ctx.storage);}
 }
}
