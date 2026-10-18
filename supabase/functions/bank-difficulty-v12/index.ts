import engine from './engine.mjs';
import {fileStore} from '../_shared/file-store-runtime.mjs';
const store=fileStore();
const readFile=async(f:any,space:string,authorization:string)=>{
 const headers={apikey:Deno.env.get('SUPABASE_ANON_KEY')!,authorization};
 const response=await fetch(Deno.env.get('SUPABASE_URL')+'/rest/v1/bank_entries?id=eq.'+encodeURIComponent(f.id),{headers});
 if(!response.ok)throw Error('원문 조회 권한 오류');const [entry]=await response.json();
 if(!entry?.verified||entry.space_id!==space||entry.size!==f.size||entry.sha256!==f.sha256)throw Error('원문 파일 검증 실패');
 if(entry.size>25*1024*1024)throw Error('문항 단위 원문 파일 크기를 확인하세요.');
 const chunks:Uint8Array[]=[];let size=0;
 for(let i=0;i<entry.chunks;i++){const r=await store.read(space+'/'+entry.id+'/'+String(i).padStart(3,'0'),authorization);if(!r.ok)throw Error('원문 다운로드 실패');const b=new Uint8Array(await r.arrayBuffer());size+=b.length;chunks.push(b);}
 if(size!==f.size)throw Error('원문 파일 크기 불일치');const all=new Uint8Array(size);let offset=0;for(const part of chunks){all.set(part,offset);offset+=part.length;}return all;
};
Deno.serve(engine.handler({env:(key:string)=>Deno.env.get(key),readFile,waitUntil:(work:Promise<unknown>)=>EdgeRuntime.waitUntil(work)}));
