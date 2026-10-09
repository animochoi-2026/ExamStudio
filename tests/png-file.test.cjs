'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const sharp=require('sharp'),{writePng}=require('../app/png-file.cjs');
test('real PNG encoding writes a Unicode fixture beyond the legacy Windows path limit',async t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'queue-png-long-'));t.after(()=>{assert.equal(path.dirname(dir),os.tmpdir());fs.rmSync(dir,{recursive:true,force:true});});let folder=dir;while(folder.length<275)folder=path.join(folder,'그림-'+('a'.repeat(35)));fs.mkdirSync(folder,{recursive:true});const target=path.join(folder,'문항-original.png');assert.ok(target.length>260);await writePng(sharp(Buffer.from('<svg width="20" height="20"><rect width="20" height="20" fill="green"/></svg>')),target);const bytes=fs.readFileSync(target);assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);assert.deepEqual((await sharp(bytes).metadata()).width,20);});
test('filesystem permission/storage failures keep native error codes for queue pause policy',async()=>{await assert.rejects(writePng({png(){return this;},async toBuffer(){return Buffer.from('fixture');}},path.join(os.tmpdir(),'missing-'+Date.now(),'output.png')),e=>e.code==='ENOENT');});

test('PNG disk-full failure retains ENOSPC so the queue pauses instead of retrying indefinitely',async t=>{
 const failure=require('../app/exam-queue.cjs').failure;
 t.mock.method(fs.promises,'writeFile',async()=>{throw Object.assign(Error('isolated disk-full fixture'),{code:'ENOSPC'});});
 await assert.rejects(writePng({png(){return this;},async toBuffer(){return Buffer.from('fixture');}},path.join(os.tmpdir(),'unused-png-fixture.png')),error=>error.code==='ENOSPC'&&failure(error)==='pause');
});
