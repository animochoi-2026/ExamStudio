import {schoolRegistrationHandler} from '../_shared/school-registration-handler.mjs';
Deno.serve(schoolRegistrationHandler(key=>Deno.env.get(key),fetch,job=>EdgeRuntime.waitUntil(job)));
