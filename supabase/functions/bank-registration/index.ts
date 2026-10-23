import {schoolRegistrationHandler} from '../_shared/school-registration-handler.mjs';
import {uploaderRegistration} from '../_shared/uploader-registration.mjs';
const env=(key:string)=>Deno.env.get(key);
Deno.serve(schoolRegistrationHandler(env,fetch,job=>EdgeRuntime.waitUntil(job),uploaderRegistration(env)));
