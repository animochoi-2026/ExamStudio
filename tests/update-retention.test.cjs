const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {pruneUpdates}=require('../app/update-retention.cjs');
function setup(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'exam-retention-')),dataDir=path.join(root,'data');fs.mkdirSync(dataDir);return {root,dataDir};}
function transaction(ctx,name,version,sourceVersion,status='installed'){
 const dir=path.join(ctx.dataDir,'updates','download-'+name);fs.mkdirSync(path.join(dir,'backup/resources/app'),{recursive:true});fs.mkdirSync(path.join(dir,'unpacked'));fs.writeFileSync(path.join(dir,'release.zip'),'zip');
 fs.writeFileSync(path.join(dir,'backup/resources/app/package.json'),JSON.stringify({version:sourceVersion}));
 fs.writeFileSync(path.join(dir,'plan.json'),JSON.stringify({root:ctx.root,zip:path.join(dir,'release.zip'),version,sourceVersion}));
 if(status)fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify({status,version}));return dir;
}
test('cleanup retains three versions independently for ZIP and backup, leaves user data and recovery transactions',()=>{
 const c=setup();fs.writeFileSync(path.join(c.dataDir,'project.json'),'private');fs.mkdirSync(path.join(c.root,'결과물'));fs.writeFileSync(path.join(c.root,'결과물/a.docx'),'output');
 const old=transaction(c,'old','0.4.0','0.3.9'),mixed=transaction(c,'mixed','0.4.1','0.4.0'),current=transaction(c,'current','0.4.2','0.4.1'),latest=transaction(c,'latest','0.4.3','0.4.2'),failed=transaction(c,'failed','0.2.0','0.1.0','failed'),active=transaction(c,'active','0.2.0','0.1.0',null),protectedDir=transaction(c,'protected','0.2.0','0.1.0');
 const report=pruneUpdates({...c,versions:['0.4.3','0.4.2','0.4.1'],protectedDirectory:protectedDir});assert.ok(report.removed>0);
 assert.ok(!fs.existsSync(path.join(old,'release.zip')));assert.ok(!fs.existsSync(path.join(old,'backup')));
 assert.ok(fs.existsSync(path.join(mixed,'release.zip')));assert.ok(!fs.existsSync(path.join(mixed,'backup')));
 for(const dir of [current,latest,failed,active,protectedDir]){assert.ok(fs.existsSync(path.join(dir,'release.zip')));assert.ok(fs.existsSync(path.join(dir,'backup')));}
 assert.equal(fs.readFileSync(path.join(c.dataDir,'project.json'),'utf8'),'private');assert.equal(fs.readFileSync(path.join(c.root,'결과물/a.docx'),'utf8'),'output');
 assert.equal(pruneUpdates({...c,versions:['0.4.3','0.4.2','0.4.1'],protectedDirectory:protectedDir}).removed,0);
});
test('cleanup refuses linked paths and transactions from another installation',()=>{
 const c=setup(),foreign=transaction(c,'foreign','0.1.0','0.0.9');const plan=JSON.parse(fs.readFileSync(path.join(foreign,'plan.json')));plan.root=path.join(c.root,'other');fs.writeFileSync(path.join(foreign,'plan.json'),JSON.stringify(plan));
 const outside=fs.mkdtempSync(path.join(os.tmpdir(),'exam-outside-'));fs.writeFileSync(path.join(outside,'keep.txt'),'keep');
 const linked=transaction(c,'linked','0.1.0','0.0.9');fs.symlinkSync(outside,path.join(linked,'backup/linked'),'junction');
 const report=pruneUpdates({...c,versions:['0.4.0']});assert.ok(report.skipped>0);assert.ok(fs.existsSync(path.join(foreign,'release.zip')));assert.ok(fs.existsSync(path.join(linked,'backup')));assert.equal(fs.readFileSync(path.join(outside,'keep.txt'),'utf8'),'keep');
});
