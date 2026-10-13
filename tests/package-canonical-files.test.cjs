const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {assertCanonicalFiles}=require('../scripts/package.cjs');
test('release packaging refuses an omitted existing server connection config',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'exam-package-contract-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const assets={'app/shared-bank-config.json':'hash','app/main.cjs':'hash'};
 fs.mkdirSync(path.join(root,'app'));fs.writeFileSync(path.join(root,'app/main.cjs'),'main');
 assert.throws(()=>assertCanonicalFiles(root,assets),/shared-bank-config.json/);
 fs.writeFileSync(path.join(root,'app/shared-bank-config.json'),'{}');assert.doesNotThrow(()=>assertCanonicalFiles(root,assets));
 fs.unlinkSync(path.join(root,'app/main.cjs'));assert.throws(()=>assertCanonicalFiles(root,assets),/main.cjs/);
});
