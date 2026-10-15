import {schoolPlacesHandler} from '../_shared/school-places.mjs';
Deno.serve(schoolPlacesHandler({env:(key:string)=>Deno.env.get(key)}));
