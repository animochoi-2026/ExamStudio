import {AwsClient} from '../_shared/vendor/aws4fetch-1.0.20/aws4fetch.mjs';
import {paperPdfGateway} from '../_shared/paper-pdf.mjs';
const env=(key:string)=>Deno.env.get(key);
Deno.serve(paperPdfGateway({env,signer:new AwsClient({accessKeyId:env('R2_ACCESS_KEY_ID')||'',secretAccessKey:env('R2_SECRET_ACCESS_KEY')||'',service:'s3',region:'auto'})}));
