import {S3Client,ListObjectsV2Command,GetObjectCommand,PutObjectCommand,DeleteObjectCommand,HeadObjectCommand} from '@aws-sdk/client-s3';
import {retry} from './core.mjs';
import {AwsClient} from 'aws4fetch';
const metadataKeys=['ContentType','CacheControl','ContentDisposition','ContentEncoding','ContentLanguage','Metadata'];
const pick=r=>Object.fromEntries(metadataKeys.filter(k=>r[k]!=null&&(k!=='Metadata'||Object.keys(r[k]).length)).map(k=>[k,r[k]]));
function safeError(e){const x=Error('REMOTE_IO_FAILED');x.status=e.$metadata?.httpStatusCode||e.status;x.retryable=e.name==='TimeoutError'||e.name==='NetworkingError';return x;}
export function s3Store({endpoint,region,accessKeyId,secretAccessKey,bucket,readOnly=false}){
  if(!endpoint||!region||!accessKeyId||!secretAccessKey||!bucket)throw Error('S3_CONFIGURATION_MISSING');
  const u=new URL(endpoint);if(u.protocol!=='https:'||u.username||u.password||u.search)throw Error('INVALID_ENDPOINT');
  const client=new S3Client({endpoint,region,credentials:{accessKeyId,secretAccessKey},forcePathStyle:true,maxAttempts:1,requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED'});
  async function send(command){try{return await client.send(command);}catch(e){throw safeError(e);}}
  return {
    identity:`${u.origin}${u.pathname.replace(/\/$/,'')}/${bucket}`,
    async signedRead(key,{expires=60,date}={}){const signer=new AwsClient({accessKeyId,secretAccessKey,region,service:'s3'});const url=new URL(`${u.origin}/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`);url.searchParams.set('X-Amz-Expires',String(expires));if(date)url.searchParams.set('X-Amz-Date',date);return (await signer.sign(url,{method:'GET',aws:{signQuery:true}})).url;},
    async list(){const rows=[],tokens=new Set();let token;do{
      const page=await retry(()=>send(new ListObjectsV2Command({Bucket:bucket,MaxKeys:1000,ContinuationToken:token})));
      for(const x of page.Contents||[]){const h=await retry(()=>send(new HeadObjectCommand({Bucket:bucket,Key:x.Key})));rows.push({key:x.Key,size:Number(h.ContentLength),metadata:pick(h),modified:h.LastModified?.toISOString()});}
      if(!page.IsTruncated)break;token=page.NextContinuationToken;if(!token||tokens.has(token))throw Error('INCOMPLETE_PAGINATION');tokens.add(token);
    }while(true);return rows;},
    async get(key,{missing=false}={}){try{const r=await send(new GetObjectCommand({Bucket:bucket,Key:key}));return {body:Buffer.from(await r.Body.transformToByteArray()),metadata:pick(r)};}catch(e){if(missing&&e.status===404)return null;throw e;}},
    async put(key,body,metadata={},condition={}){if(readOnly)throw Error('READ_ONLY_SOURCE');return send(new PutObjectCommand({Bucket:bucket,Key:key,Body:body,...metadata,...(condition.absent?{IfNoneMatch:'*'}:{}),...(condition.etag?{IfMatch:condition.etag}:{})}));},
    async remove(key){if(readOnly)throw Error('READ_ONLY_SOURCE');return send(new DeleteObjectCommand({Bucket:bucket,Key:key}));}
  };
}
export function restSource({url,key,bucket='question-bank',fetchImpl=fetch,restoreKey}){
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url||'')||!key)throw Error('SOURCE_CONFIGURATION_MISSING');
  const headers={apikey:key,Authorization:`Bearer ${key}`};
  async function request(path,options={}){const r=await fetchImpl(url+'/storage/v1'+path,{...options,headers:{...headers,...options.headers},signal:AbortSignal.timeout(120000)});if(!r.ok){const e=Error('SOURCE_IO_FAILED');e.status=r.status;throw e;}return r;}
  const route=key=>'/object/authenticated/'+bucket+'/'+key.split('/').map(encodeURIComponent).join('/');
  return {
    identity:`${url}/${bucket}`,
    async list(){
      const buckets=await (await request('/bucket')).json();if(!Array.isArray(buckets)||buckets.some(x=>x.id!==bucket))throw Error('SOURCE_BUCKET_SCOPE_REVIEW_REQUIRED');
      const rows=[],folders=[''],seen=new Set(),objectKeys=new Set();
      while(folders.length){const prefix=folders.shift();if(seen.has(prefix))throw Error('DUPLICATE_FOLDER');seen.add(prefix);
        for(let offset=0;;){const page=await retry(async()=>await (await request('/object/list/'+bucket,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefix,limit:1000,offset,sortBy:{column:'name',order:'asc'}})})).json());
          if(!Array.isArray(page))throw Error('INVALID_SOURCE_LIST');
          for(const o of page){const name=prefix?prefix+'/'+o.name:o.name;if(o.id==null&&o.metadata==null){folders.push(name);continue;}
            if(objectKeys.has(name))throw Error('REPEATED_SOURCE_PAGE');objectKeys.add(name);
            if(o.metadata?.size==null)throw Error('UNKNOWN_SOURCE_SIZE');
            if(o.user_metadata&&Object.keys(o.user_metadata).length)throw Error('CUSTOM_METADATA_REQUIRES_S3');
            rows.push({key:name,size:Number(o.metadata.size),metadata:{ContentType:o.metadata.mimetype||'application/octet-stream'},modified:o.updated_at,createdAt:o.created_at,sourceMetadata:o.metadata});}
          if(page.length<1000)break;offset+=page.length;
        }
      }return rows;
    },
    async get(key,{missing=false}={}){try{const r=await request(route(key));const map={'content-type':'ContentType','cache-control':'CacheControl','content-disposition':'ContentDisposition','content-encoding':'ContentEncoding','content-language':'ContentLanguage'};const metadata={};for(const [header,field] of Object.entries(map)){if(r.headers.has(header))metadata[field]=r.headers.get(header);}if(metadata.ContentEncoding)throw Error('ENCODED_SOURCE_REQUIRES_S3');return {body:Buffer.from(await r.arrayBuffer()),metadata};}catch(e){if(missing&&e.status===404)return null;throw e;}},
    async put(name,body,metadata,condition){
      if(!restoreKey||!condition?.absent)throw Error('SOURCE_READ_ONLY');
      if(metadata.ContentEncoding||metadata.ContentLanguage||metadata.Metadata)throw Error('RESTORE_METADATA_REVIEW_REQUIRED');
      // Supabase standard upload refuses duplicates; no upsert, deletion or move.
      const r=await fetchImpl(url+'/storage/v1/object/'+bucket+'/'+name.split('/').map(encodeURIComponent).join('/'),{method:'POST',headers:{apikey:restoreKey,Authorization:`Bearer ${restoreKey}`,'Content-Type':metadata.ContentType||'application/octet-stream','Cache-Control':metadata.CacheControl||'no-cache','x-upsert':'false'},body,signal:AbortSignal.timeout(120000)});
      if(!r.ok){const e=Error('RESTORE_UPLOAD_FAILED');e.status=r.status;throw e;}
    }
  };
}
