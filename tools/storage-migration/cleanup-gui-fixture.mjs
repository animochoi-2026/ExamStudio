import fs from 'node:fs';
import assert from 'node:assert/strict';
import {s3Store} from './adapters.mjs';
const space='27cf96f9-90e5-4b70-ab62-b5e98054fe35',revision='36124a52-0ed6-4bc9-ae0f-694068504397';
const state=JSON.parse(fs.readFileSync('tests/artifacts/r2-freeze/electron-532f3661-9de2-4265-87b3-7439175e94a1/shared-banks/e3999f89b7c8db249a8abf27/question-bank/state.json'));
const job=state.jobs.find(j=>j.id===revision);assert.equal(job.committed,true);
const expected=['32e75d38-8ecf-44a4-a530-b12497af9c02','886160fa-5a10-45fd-abf0-1ed5c6b140e2','9f92dfb3-0de6-4a37-8c49-8494de3e046f','c72ddb72-7a9a-417f-bde3-37aded4fbb0f','d02f9306-7add-4e59-a3ed-14a141519d7e','f710714c-6525-49a0-bca7-3b18077269e6'];
const recorded=new Set([...Object.values(job.remote).map(f=>f.id),...state.cache[revision].files.map(f=>f.id)]);
assert.deepEqual([...recorded].sort(),expected.slice().sort());
const target=s3Store({endpoint:'https://7b3f670b94ea81a6649c3529b108ee8b.r2.cloudflarestorage.com',region:'auto',bucket:'examstudio-files-prep',accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY});
for(const id of expected){const key=space+'/'+id+'/000';await target.remove(key);assert.equal(await target.get(key,{missing:true}),null);}
const result={at:new Date().toISOString(),exactArtificialObjectsRemoved:expected.length,productionObjectsRemoved:0,verifiedAbsent:true};fs.writeFileSync('tests/artifacts/r2-freeze/gui-fixture-cleanup.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
