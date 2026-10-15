// Keep the historical Worker URL and Durable Object class as explicit tombstones.
// No browser binding, Puppeteer import, session, queue or renderer is reachable.
const gone=()=>Response.json({error:'서버 PDF 생성은 종료됐습니다. 웹 화면을 새로고침해 이미지 PDF로 생성하세요.'},{status:410,headers:{'cache-control':'no-store'}});
export default {fetch(request,env){
 if(request.method!=='POST'||!env.RENDER_SECRET||request.headers.get('authorization')!=='Bearer '+env.RENDER_SECRET)return new Response('Forbidden',{status:403});
 return gone();
}};
export class PdfRenderer {fetch(){return gone();}}
