const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {main,packageOptions}=require('../scripts/package.cjs');
test('public package retains required export/updater scripts and excludes developer sources/maps/tests',()=>{
 const {runtimeScripts}=require('../scripts/package.cjs'),options=packageOptions(),excluded=name=>options.ignore.some(re=>re.test(name));
 for(const name of runtimeScripts)assert.equal(excluded('/scripts/'+name),false,name);
 for(const name of ['package.cjs','github-release.py','test-desktop.cjs','revision-prune-operator.cjs','verify-member-invite-live.cjs','new-developer-tool.cjs'])assert.equal(excluded('/scripts/'+name),true,name);
 for(const name of ['/app/revision-payload-prune.cjs','/app/main.cjs.map','/node_modules/vendor/tests/example.js','/node_modules/vendor/dist/index.js.map','/.env','/data/private.json'])assert.equal(excluded(name),true,name);
 for(const name of ['/app/main.cjs','/app/github-update.cjs','/node_modules/vendor/dist/index.js'])assert.equal(excluded(name),false,name);
});
test('packaged Korean executable uses the expected NFC filename',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'exam-exe-name-'));
 fs.writeFileSync(path.join(root,'문제공방.exe'.normalize('NFD')),'exe');
 require('../scripts/package.cjs').normalizeExecutable(root);
 assert.ok(fs.readdirSync(root).includes('문제공방.exe'));
});
test('audit 2: packaging creates a new build and preserves installed data',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'exam-package-')),data=path.join(root,'dist','ExamStudio-win32-x64','data');fs.mkdirSync(data,{recursive:true});const file=path.join(data,'project.json');fs.writeFileSync(file,'saved-user-data');
 const options=packageOptions(root);assert.equal(options.executableName,'문제공방');assert.equal(options.overwrite,false);assert.equal(path.dirname(options.out),path.join(root,'builds'));assert.notEqual(options.out,packageOptions(root).out);
 for(const name of require('../scripts/release-codex.cjs').files){const p=path.join(root,'vendor/codex-runtime',name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,'mock runtime');}
 for(const name of ['data','dist','builds','.codex-remote-attachments'])assert.ok(options.ignore.some(re=>re.test('/'+name+'/file')));
 await main({root,packager:async opts=>{const dir=path.join(opts.out,'ExamStudio-win32-x64');fs.mkdirSync(dir,{recursive:true});return[dir];}});
 assert.equal(fs.readFileSync(file,'utf8'),'saved-user-data');
 // Keep the tiny isolated fixture; never delete the installed output tree.
});
