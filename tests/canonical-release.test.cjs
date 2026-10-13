'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),crypto=require('node:crypto');
const G=require('../scripts/canonical-release.cjs');
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'canonical-test-'));
 const git=(...args)=>cp.execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
 git('init');git('config','user.name','Test');git('config','user.email','test@local');git('config','commit.gpgsign','false');git('config','core.autocrlf','false');
 fs.writeFileSync(path.join(root,'start'),'baseline');git('add','.');git('commit','-m','baseline');const first=git('rev-parse','HEAD');
 fs.mkdirSync(path.join(root,'release'));fs.writeFileSync(path.join(root,'contract.test.cjs'),'must preserve\n');
 fs.writeFileSync(path.join(root,'release/canonical.json'),JSON.stringify({requiredAncestors:[first]}));
 fs.writeFileSync(path.join(root,'release/contracts.json'),JSON.stringify({protectedFiles:{'contract.test.cjs':crypto.createHash('sha256').update('must preserve\n').digest('hex')}}));
 git('add','.');git('commit','-m','canonical');const head=git('rev-parse','HEAD');
 fs.writeFileSync(path.join(root,'.git/examstudio-current.json'),JSON.stringify({commit:head,checkout:root}));
 return {root,git,first,head,close:()=>fs.rmSync(root,{recursive:true,force:true})};
}
test('shared authority rejects an older worktree even when its own manifest is stale',()=>{
 const f=fixture();try{assert.equal(G.assertBaseline(f.root,{clean:true}).head,f.head);f.git('checkout','--detach',f.first);assert.throws(()=>G.assertBaseline(f.root),/최신 공식 기준 누락/);}finally{f.close();}
});
test('contract weakening and dirty release inputs are rejected, while CRLF is harmless',()=>{
 const f=fixture();try{
  fs.writeFileSync(path.join(f.root,'contract.test.cjs'),'must preserve\r\n');G.assertBaseline(f.root);
  fs.writeFileSync(path.join(f.root,'contract.test.cjs'),'accept broken output\n');assert.throws(()=>G.assertBaseline(f.root),/보존 계약 변경/);
  fs.writeFileSync(path.join(f.root,'contract.test.cjs'),'must preserve\n');fs.writeFileSync(path.join(f.root,'unexpected.js'),'pending');assert.throws(()=>G.assertBaseline(f.root,{clean:true}),/깨끗한 작업 트리/);
 }finally{f.close();}
});
test('production push examines pushed revision and does not interfere with feature branches',()=>{
 const f=fixture();try{
  G.prePush(f.root,`refs/heads/feature ${f.first} refs/heads/feature ${f.head}`);
  assert.throws(()=>G.prePush(f.root,`refs/heads/old ${f.first} refs/heads/main ${f.head}`),/최신 공식 기준 누락/);
  G.prePush(f.root,`refs/heads/new ${f.head} refs/heads/main ${f.first}`);
  assert.throws(()=>G.prePush(f.root,`(delete) ${'0'.repeat(40)} refs/heads/main ${f.head}`),/삭제/);
 }finally{f.close();}
});
test('deployment locks are exclusive and existing uncertain outcomes are never auto-cleared',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'canonical-lock-')),file=path.join(dir,'lock');
 try{const release=G.acquireLock(file);assert.throws(()=>G.acquireLock(file),/배포.*미확인/);assert(fs.existsSync(file));release();G.acquireLock(file)();}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('a newer production deployment cannot be replaced with an earlier integrated baseline',()=>{
 const f=fixture();try{G.assertDeployedAncestor(f.root,f.first,f.head);assert.throws(()=>G.assertDeployedAncestor(f.root,f.head,f.first),/직전 운영 배포/);}finally{f.close();}
});
test('published asset verification excludes Pages control files and rejects changed or missing bytes',async()=>{
 const http=require('node:http'),body=Buffer.from('approved'),hash=crypto.createHash('sha256').update(body).digest('hex');
 const server=http.createServer((req,res)=>{if(req.url.startsWith('/app.js'))res.end(body);else{res.statusCode=404;res.end('missing');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const url=`http://127.0.0.1:${server.address().port}/`,assets=G.publicAssets({'app.js':hash,_headers:'not-a-public-file','_routes.json':'routing'});
  assert.deepEqual(Object.keys(assets),['app.js']);assert.equal(await G.checkAssets(url,assets),1);
  await assert.rejects(G.checkAssets(url,{'app.js':'wrong'}),/운영 자산 변경/);
  await assert.rejects(G.checkAssets(url,{'missing.js':hash}),/조회 실패/);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
