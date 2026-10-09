const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {bundleCodex,files}=require('../scripts/release-codex.cjs');
test('Codex release includes only runtime and notices, never credentials or configuration',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'exam-codex-package-')),source=path.join(root,'source'),target=path.join(root,'target');
 for(const name of [...files,'auth.json','config.toml']){const p=path.join(source,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,name);}
 bundleCodex(source,target);for(const name of files)assert.equal(fs.readFileSync(path.join(target,name),'utf8'),name);
 assert.equal(fs.existsSync(path.join(target,'auth.json')),false);assert.equal(fs.existsSync(path.join(target,'config.toml')),false);
});
test('Codex release fails on incomplete runtime rather than publishing a dependent app',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'exam-codex-missing-'));assert.throws(()=>bundleCodex(root,path.join(root,'target')));assert.equal(fs.existsSync(path.join(root,'target')),false);
});
