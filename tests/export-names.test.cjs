const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {datedWordPath,availablePath,publishWord}=require('../app/export-names.cjs');
test('dated Word names respect local calendar and do not duplicate date/version suffix',()=>{
 const date=new Date(2026,8,13,1,2);
 assert.equal(datedWordPath('exam.docx',date),'exam_2026-09-13.docx');
 assert.equal(datedWordPath('exam_2026-09-13_ver2.docx',date),'exam_2026-09-13.docx');
});
test('exclusive publish handles a collision after the file picker and preserves all versions',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'exam-unique-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const staged=path.join(dir,'stage'),target=path.join(dir,'exam_2026-09-13.docx');fs.writeFileSync(staged,'new');
 assert.equal(availablePath(target),target);fs.writeFileSync(target,'created while dialog open');
 const p1=publishWord(staged,target),p2=publishWord(staged,target);
 assert.equal(path.basename(p1),'exam_2026-09-13_ver1.docx');assert.equal(path.basename(p2),'exam_2026-09-13_ver2.docx');
 assert.equal(fs.readFileSync(target,'utf8'),'created while dialog open');assert.equal(fs.readFileSync(p1,'utf8'),'new');
});
