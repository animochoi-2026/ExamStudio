import {gateway} from '../_shared/file-gateway.mjs';
import {fileStore} from '../_shared/file-store-runtime.mjs';
Deno.serve(gateway({env:key=>Deno.env.get(key),store:fileStore()}));
