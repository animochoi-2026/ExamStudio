const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {desktopSignature}=require('../app/native-pdf-cache.cjs');
test('desktop PDF signature changes for output and image bytes but not viewing timestamps',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pdf-signature-'));try{
 const source=path.join(dir,'source.png');fs.writeFileSync(source,'first');const p={title:'시험지',settings:{answerMode:'detailed'},problems:[{id:'1',source,original:{id:'q',include:true,body:'문제',answer:'3',solution:'풀이'}}]};
 const a=desktopSignature(p);p.updatedAt='viewed';p.problems[0].original.updatedAt='viewed';assert.equal(desktopSignature(p),a);
 p.problems[0].original.solution='새 풀이';assert.notEqual(desktopSignature(p),a);const b=desktopSignature(p);fs.writeFileSync(source,'replacement');assert.notEqual(desktopSignature(p),b);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
