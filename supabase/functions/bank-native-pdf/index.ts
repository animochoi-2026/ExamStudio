import {nativePdfGateway} from '../_shared/native-pdf.mjs';
Deno.serve(nativePdfGateway({env:(key:string)=>Deno.env.get(key)}));
