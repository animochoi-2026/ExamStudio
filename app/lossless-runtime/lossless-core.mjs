export const POLICY='lossless-storage-v1';
export const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export const bytes=v=>new TextEncoder().encode(JSON.stringify(canonical(v)));
export const sha=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('');
export const hash=v=>sha(bytes(v));
export const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
export function hold(reason,status=409){throw Object.assign(Error(reason),{status});}
export function pngSafe(b){
 if(b.length<33||!same([...b.slice(0,8)],[137,80,78,71,13,10,26,10]))return false;
 const d=new DataView(b.buffer,b.byteOffset,b.byteLength);let ihdr=0,end=false;
 for(let p=8;p<b.length;){if(p+12>b.length)return false;const n=d.getUint32(p),type=new TextDecoder().decode(b.slice(p+4,p+8));if(p+12+n>b.length||!['IHDR','IDAT','IEND','PLTE','tRNS','sRGB'].includes(type))return false;if(type==='IHDR'){if(++ihdr!==1||p!==8||n!==13||b[p+16]!==8||b[p+20]!==0)return false;}p+=n+12;if(type==='IEND'){if(n!==0||p!==b.length)return false;end=true;}}
 return ihdr===1&&end;
}
// Portable PNG contract: filter 0 + zlib stored blocks. No implementation-
// dependent encoder output, profile rewrite, resize or metadata carryover.
function crc(b){let c=0xffffffff;for(const x of b){c^=x;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function u32(n){return Uint8Array.of(n>>>24,n>>>16,n>>>8,n);}
function cat(...a){const b=new Uint8Array(a.reduce((n,x)=>n+x.length,0));let p=0;for(const x of a){b.set(x,p);p+=x.length;}return b;}
function chunk(type,b){const body=cat(new TextEncoder().encode(type),b);return cat(u32(b.length),body,u32(crc(body)));}
export function canonicalPng({width,height,rgba}){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>6100000||rgba.length!==width*height*4)hold('Pixel limit');
 const scan=new Uint8Array((width*4+1)*height);for(let y=0;y<height;y++)scan.set(rgba.subarray(y*width*4,(y+1)*width*4),y*(width*4+1)+1);
 const blocks=[Uint8Array.of(0x78,0x01)];for(let p=0;p<scan.length;p+=65535){const n=Math.min(65535,scan.length-p);blocks.push(Uint8Array.of(p+n===scan.length?1:0,n&255,n>>>8,(~n)&255,((~n)>>>8)&255),scan.subarray(p,p+n));}
 let a=1,b=0;for(const x of scan){a=(a+x)%65521;b=(b+a)%65521;}blocks.push(u32((b<<16)|a));
 return cat(Uint8Array.of(137,80,78,71,13,10,26,10),chunk('IHDR',cat(u32(width),u32(height),Uint8Array.of(8,6,0,0,0))),chunk('IDAT',cat(...blocks)),chunk('IEND',new Uint8Array()));
}
export function confirmedCrop(native,descriptor){
 const token='bank-asset:'+descriptor.key,project=native.project;let crops=0,unsafe=false;
 function active(x){if(Array.isArray(x))return x.some(active);if(!x||typeof x!=='object')return false;for(const [k,v]of Object.entries(x)){if(['runs','jobs','tasks'].includes(k)&&Array.isArray(v)&&v.some(t=>['running','queued','uploading','pending'].includes(t.status)))return true;if(active(v))return true;}return false;}
 if(active(project))return false;
 const sources=project.sources||[{...project.source,id:'primary'}];if(sources.some(s=>s.path===token)||project.source?.path===token)return false;
 function walk(x,path=[]){if(x===token){const allowed=path.at(-2)==='cropPaths'||path.at(-1)==='path'&&(path.includes('sourceFigure')||path.includes('sourceFigures'));if(!allowed)unsafe=true;}else if(Array.isArray(x))x.forEach((v,i)=>walk(v,[...path,i]));else if(x&&typeof x==='object')for(const[k,v]of Object.entries(x))walk(v,[...path,k]);}walk(native);
 for(const p of project.problems||[])for(const [i,x]of(p.cropPaths||[]).entries())if(x===token){const r=p.regions?.[i];if(!r||!Number.isInteger(r.page)||r.page<1||!['x','y','width','height'].every(k=>Number.isFinite(r[k])&&r[k]>=0)||r.width<=0||r.height<=0||r.x+r.width>1.001||r.y+r.height>1.001||!sources.some(s=>s.id===(r.sourceId||'primary')))return false;crops++;}
 return descriptor.role==='asset'&&crops>0&&!unsafe;
}
export const plan=({approval,oldDescriptor,newDescriptor,nativeSha256,codec})=>hash({policy:POLICY,space:approval.space_id,actor:approval.actor_id,question:approval.question_id,base:approval.base_revision_id,target:approval.target_revision_id,review:approval.review_version,oldDescriptor,newDescriptor,nativeSha256,codec,bindingPolicy:'approved-source-identity-v1'});
export async function verifyPixels({original,derived,oldDescriptor,newDescriptor,native,approval,codec}){
 if(!codec?.supported)hold('LOSSLESS_CODEC_UNSUPPORTED',501);
 if(original.length>6291456||derived.length>6291456||derived.length>=original.length||!pngSafe(original)||!confirmedCrop(native,oldDescriptor))hold('Unsupported original/crop/size');
 if(await sha(original)!==oldDescriptor.sha256||original.length!==oldDescriptor.size||await sha(derived)!==newDescriptor.sha256||derived.length!==newDescriptor.size)hold('Byte integrity mismatch');
 const a=await codec.decode(original),b=await codec.decode(derived);
 if(a.format!=='png'||b.format!=='webp'||a.width!==b.width||a.height!==b.height||a.rgba.length!==b.rgba.length||!a.rgba.every((v,i)=>v===b.rgba[i]))hold('Pixel identity mismatch');
 const restored=canonicalPng(b),nativeSha256=await hash(native),planSha256=await plan({approval,oldDescriptor,newDescriptor,nativeSha256,codec:codec.id});
 if(planSha256!==approval.plan_sha256)hold('Explicit approval plan changed');
 return {policy:POLICY,planSha256,nativeSha256,oldDescriptor,newDescriptor,codec:codec.id,bindingPolicy:'approved-source-identity-v1',width:a.width,height:a.height,pixelSha256:await sha(a.rgba),canonicalPngSha256:await sha(restored),canonicalPngBytes:restored.length,pngContract:'rgba8-stored-deflate-v1',color:'srgb',orientation:'unchanged',originalLegacyDigest:await sha(new TextEncoder().encode(JSON.stringify(base64(original)))),restoredLegacyDigest:await sha(new TextEncoder().encode(JSON.stringify(base64(restored))))};
}
function base64(b){let s='';for(let p=0;p<b.length;p+=8192)s+=String.fromCharCode(...b.subarray(p,p+8192));return btoa(s);}
