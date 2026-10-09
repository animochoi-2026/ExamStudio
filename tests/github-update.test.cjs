const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {GithubUpdater,newer,validateManifest,assetUrl,REPO}=require('../app/github-update.cjs');
test('update versions and assets reject downgrades, foreign repos and malformed digests',()=>{
 assert.equal(newer('0.4.0','0.3.18'),true);assert.equal(newer('0.3.9','0.3.18'),false);assert.equal(newer('0.4.0','0.4.0'),false);assert.throws(()=>newer('4.0-beta','0.3.18'));
 assert.throws(()=>assetUrl('https://evil.test/file','v0.4.0'));assert.throws(()=>assetUrl('https://github.com/foreign/repo/releases/download/v0.4.0/a','v0.4.0'));
 assert.throws(()=>validateManifest({schema:1,platform:'win32-x64',version:'0.4.0',sha256:'no'}, {tag_name:'v0.4.0'}));
});
test('download verifies checksum and size before creating any installation plan; dev source never updates',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'exam-update-test-')),bytes=Buffer.from('test release');
 const m={schema:1,platform:'win32-x64',version:'0.4.0',asset:'ExamStudio-0.4.0-win32-x64.zip',sha256:crypto.createHash('sha256').update(bytes).digest('hex'),size:bytes.length};
 const url=name=>`https://github.com/${REPO}/releases/download/v0.4.0/${name}`;
 const release={tag_name:'v0.4.0',body:'release',assets:[{name:'update.json',state:'uploaded',browser_download_url:url('update.json')},{name:m.asset,state:'uploaded',size:m.size,browser_download_url:url(m.asset)}]};
 let corrupt=false;const fetchImpl=async u=>new Response(u.includes('/releases?')?JSON.stringify([release]):u.endsWith('update.json')?JSON.stringify(m):corrupt?'bad':bytes);
 const updater=new GithubUpdater({current:'0.3.18',root:dir,dataDir:dir,packaged:true,fetchImpl});assert.equal((await updater.check()).available,true);await updater.download();assert.ok(fs.existsSync(updater.pending.planPath));assert.ok(!fs.existsSync(path.join(dir,'문제공방.exe')));
 corrupt=true;await assert.rejects(updater.download(),/무결성/);assert.equal(updater.pending,null);
 const dev=new GithubUpdater({current:'0.3.18',root:dir,dataDir:dir,packaged:false,fetchImpl});await dev.check();await assert.rejects(dev.download(),/개발본/);
});
function fixture(versions){
 const manifests=new Map(),bytes=Buffer.from('release zip');
 const releases=versions.map(v=>{const m={schema:1,platform:'win32-x64',version:v,asset:`ExamStudio-${v}-win32-x64.zip`,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),size:bytes.length};manifests.set(v,m);const url=n=>`https://github.com/${REPO}/releases/download/v${v}/${n}`;return {tag_name:`v${v}`,body:`notes ${v}`,assets:[{name:'update.json',state:'uploaded',browser_download_url:url('update.json')},{name:m.asset,state:'uploaded',size:m.size,browser_download_url:url(m.asset)}]};});
 return {releases,manifests,fetchImpl:async u=>new Response(u.includes('/releases?')?JSON.stringify(releases):u.endsWith('/update.json')?JSON.stringify(manifests.get(u.match(/\/download\/v([^/]+)/)[1])):bytes)};
}
test('three unique version numbers use semantic ordering; rollback, reinstall and unlisted rejection',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'exam-version-test-')),f=fixture(['0.4.9','0.4.11','0.4.10','0.4.8']);
 const u=new GithubUpdater({current:'0.4.10',root:dir,dataDir:dir,packaged:true,fetchImpl:f.fetchImpl});
 const info=await u.check();assert.deepEqual(info.choices.map(c=>c.version),['0.4.11','0.4.10','0.4.9']);assert.equal(info.choices[0].latest,true);assert.equal(info.choices[1].installed,true);assert.equal(info.choices[2].rollback,true);
 await u.download('0.4.9');let plan=JSON.parse(fs.readFileSync(u.pending.planPath));assert.equal(plan.version,'0.4.9');assert.equal(plan.sourceVersion,'0.4.10');
 await u.download('0.4.10');assert.equal(JSON.parse(fs.readFileSync(u.pending.planPath)).version,'0.4.10');
 await assert.rejects(u.download('0.4.8'),/버전 목록/);
});
test('latest/current is a single version entry; invalid manifests fail closed',async()=>{
 const f=fixture(['0.4.0']);const u=new GithubUpdater({current:'0.4.0',root:os.tmpdir(),dataDir:os.tmpdir(),packaged:false,fetchImpl:f.fetchImpl});
 const info=await u.check();assert.equal(info.previous,null);assert.equal(info.choices.length,1);assert.equal(info.choices[0].latest,true);assert.equal(info.choices[0].installed,true);assert.equal(info.choices[0].installable,true);
 f.manifests.get('0.4.0').sha256='invalid';await assert.rejects(u.check(),/검증/);assert.equal(u.catalog.size,0);
});
test('latest installed version can roll back to either retained older version',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'exam-rollback-test-')),f=fixture(['0.4.0','0.4.1','0.4.2','0.3.18']);
 const u=new GithubUpdater({current:'0.4.2',root:dir,dataDir:dir,packaged:true,fetchImpl:f.fetchImpl});const info=await u.check();
 assert.deepEqual(info.choices.map(c=>[c.version,c.rollback]),[['0.4.2',false],['0.4.1',true],['0.4.0',true]]);
 await u.download('0.4.0');assert.equal(JSON.parse(fs.readFileSync(u.pending.planPath)).version,'0.4.0');
});
test('a failed download-directory creation does not permanently lock updates',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'exam-permission-test-'));const f=fixture(['0.4.0']);fs.writeFileSync(path.join(dir,'updates'),'not a directory');
 const u=new GithubUpdater({current:'0.4.0',root:dir,dataDir:dir,packaged:true,fetchImpl:f.fetchImpl});await u.check();await assert.rejects(u.download('0.4.0'));assert.equal(u.active,false);assert.equal(u.pending,null);
});
