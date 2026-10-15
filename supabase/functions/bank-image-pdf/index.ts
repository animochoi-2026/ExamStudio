import {imagePdfGateway} from '../_shared/image-pdf.mjs';
Deno.serve(imagePdfGateway({env:(key:string)=>Deno.env.get(key)}));
