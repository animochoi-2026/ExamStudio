import {CHUNK_SIZE} from './file-store.mjs';
export function gateway({env, store, fetchImpl=fetch}) {
  const origins=(env('BANK_FILE_ORIGINS')||'https://examstudio-shared-bank.pages.dev').split(',').map(s=>s.trim());
  return async request=>{
    const origin=request.headers.get('origin');
    const cors={'Vary':'Origin','Cache-Control':'no-store','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info, x-bank-object','Access-Control-Allow-Methods':'POST, OPTIONS'};
    if(origin && !origins.includes(origin)) return new Response(null,{status:403});
    if(origin) cors['Access-Control-Allow-Origin']=origin;
    const reply=(status,data)=>Response.json(data,{status,headers:cors});
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
    if(request.method!=='POST') return reply(405,{error:'POST required'});
    try {
      const authorization=request.headers.get('authorization')||'';
      if(!authorization.startsWith('Bearer ')) return reply(401,{error:'Sign in required'});
      const identity=await fetchImpl(env('SUPABASE_URL')+'/auth/v1/user',{headers:{apikey:env('SUPABASE_ANON_KEY'),authorization}});
      if(!identity.ok) return reply(401,{error:'Sign in required'});
      const user=await identity.json();
      if(!user.id||!user.email_confirmed_at||user.is_anonymous) return reply(403,{error:'Verified account required'});
      const key=request.headers.get('x-bank-object');
      if(key) {
        const reader=request.body?.getReader(); if(!reader) return reply(400,{error:'Empty upload'});
        const chunks=[];let size=0;
        for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>CHUNK_SIZE){await reader.cancel();return reply(413,{error:'Chunk limit'});}chunks.push(value);}
        const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
        const r=await store.put(key,bytes,authorization);
        return reply(r.ok?200:r.status,{stored:r.ok,...(!r.ok?{error:r.status===409?'Duplicate':'Storage upload failed'}:{})});
      }
      const body=await request.text();if(body.length>4096) return reply(413,{error:'Request limit'});
      const data=JSON.parse(body);
      if(data.operation==='usage')return reply(200,await store.usage(data.spaceId,authorization));
      if(data.operation==='delete') {if(!Array.isArray(data.keys)||data.keys.length>10) return reply(400,{error:'Exact keys required'});await store.remove(data.keys,authorization);return reply(200,{complete:true});}
      if(data.operation!=='read') return reply(400,{error:'Unknown operation'});
      return reply(200,await store.access(data.key,authorization));
    } catch {return reply(403,{error:'File access or storage configuration denied'});}
  };
}
