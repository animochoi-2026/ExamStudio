import {AwsClient} from './vendor/aws4fetch-1.0.20/aws4fetch.mjs';
import {createFileStore} from './file-store.mjs';
export function fileStore(fetchImpl=fetch, env=key=>Deno.env.get(key)) {
  const signer=env('BANK_STORAGE_PROVIDER')==='r2' ? new AwsClient({accessKeyId:env('R2_ACCESS_KEY_ID')||'',secretAccessKey:env('R2_SECRET_ACCESS_KEY')||'',service:'s3',region:'auto'}) : undefined;
  return createFileStore({env,fetchImpl,signer});
}
