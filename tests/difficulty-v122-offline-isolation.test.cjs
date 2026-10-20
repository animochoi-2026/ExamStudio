'use strict';
require('./offline-guard.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const blocked=e=>e.code==='ERR_TEST_EXTERNAL_IO_BLOCKED'||e.code==='ERR_ACCESS_DENIED';
test('process APIs fail before executable launch',()=>{
 const cp=require('node:child_process');
 for(const method of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])
  assert.throws(()=>cp[method]('codex',['exec']),blocked,method);
 assert(Object.getOwnPropertyDescriptor(cp,'spawnSync').writable===false);
 assert(Object.getOwnPropertyDescriptor(process,'dlopen').writable===false);
 assert.throws(()=>new (require('node:worker_threads').Worker)(''),blocked);
 assert.throws(()=>process.binding('spawn_sync'),blocked);
 assert.throws(()=>process.binding('tcp_wrap'),blocked);
 assert.equal(process.binding('constants').fs,fs.constants);
});
test('allowlist permits only read-only Git, current Node and local sharp reads',async()=>{
 const cp=require('node:child_process');
 assert.match(cp.execFileSync(process.execPath,['--version']),/^v\d+/);
 const git=process.env.EXAMSTUDIO_READONLY_GIT;assert(git);
 assert.match(cp.execFileSync(git,['rev-parse','HEAD']),/^[a-f0-9]{40}/);
 for(const args of [['fetch'],['pull'],['push'],['clone','x'],['-c','alias.x=!codex','x'],['hash-object','-w'],['status','--porcelain','--ignored']])
  assert.throws(()=>cp.execFileSync(git,args),blocked);
 assert.throws(()=>cp.execFileSync(process.execPath,['-e','fetch("https://example.test")']),blocked);
 const sharp=require('sharp'),png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5WQAAAAASUVORK5CYII=','base64');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'offline-image-')),file=path.join(dir,'image.png');
 fs.writeFileSync(file,png);assert.equal((await sharp(fs.readFileSync(file)).metadata()).width,1);
 fs.renameSync(file,path.join(dir,'moved.png'));assert(fs.existsSync(path.join(dir,'moved.png')));
});
test('network APIs including localhost cannot leave a test',async()=>{
 await assert.rejects(()=>fetch('https://api.openai.com/v1/responses'),blocked);
 for(const action of [
  ()=>require('node:net').connect(443,'api.openai.com'),
  ()=>new (require('node:net').Socket)().connect(80,'127.0.0.1'),
  ()=>require('node:tls').connect({host:'api.openai.com',port:443}),
  ()=>require('node:https').request('https://example.test'),
  ()=>require('node:http2').connect('https://example.test'),
  ()=>require('node:dgram').createSocket('udp4'),
  ()=>require('node:dns').lookup('example.test',()=>{}),
  ()=>new WebSocket('ws://127.0.0.1:1')])assert.throws(action,blocked);
 const esm=await import('node:child_process');assert.throws(()=>esm.spawn('codex',['exec']),blocked);
});
test('real subscription fails before auth, intent creation or child launch',async()=>{
 const dir=path.join(os.tmpdir(),'offline-probe-'+process.pid+'-'+Date.now());
 const provider=require('../app/difficulty-v122/subscription.cjs').provider({artifactRoot:dir,launch:()=>assert.fail('must never launch')});
 await assert.rejects(()=>provider({}),blocked);
 assert.equal(fs.existsSync(dir),false);
});
