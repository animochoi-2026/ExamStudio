import {randomUUID,createHash} from 'node:crypto';
import {s3Store} from './adapters.mjs';
if(!process.env.R2_RUNTIME_ACCESS_KEY_ID||!process.env.R2_RUNTIME_SECRET_ACCESS_KEY)throw Error('RUNTIME_KEYS_NOT_SAVED');
const target=s3Store({endpoint:process.env.R2_ENDPOINT,region:'auto',bucket:process.env.R2_BUCKET,accessKeyId:process.env.R2_RUNTIME_ACCESS_KEY_ID,secretAccessKey:process.env.R2_RUNTIME_SECRET_ACCESS_KEY});
const key=`__migration-test/runtime-key-${randomUUID()}/tiny.txt`,body=Buffer.from('Artificial runtime-key connection test');let created=false;
try{
 await target.put(key,body,{ContentType:'text/plain'},{absent:true});created=true;
 const got=await target.get(key);if(createHash('sha256').update(got.body).digest('hex')!==createHash('sha256').update(body).digest('hex'))throw Error('RUNTIME_CONTENT_MISMATCH');
 console.log(JSON.stringify({runtimeKey:'read/write verified with artificial bytes',productionSecretsChanged:false}));
}finally{if(created){await target.remove(key);if(await target.get(key,{missing:true}))throw Error('RUNTIME_TEST_CLEANUP_FAILED');console.log(JSON.stringify({runtimeTestCleanup:'exact created object verified absent'}));}}
