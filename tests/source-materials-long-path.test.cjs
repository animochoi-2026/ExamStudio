'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),sharp=require('sharp');
const {materialImages}=require('../app/source-materials.cjs');
test('common material preserves crop pixels under a long Windows upload path',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'exam-material-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 let dir=root;while(dir.length<275)dir=path.join(dir,'question-bank-outbox-native-assets');fs.mkdirSync(dir,{recursive:true});
 const bytes=await sharp({create:{width:20,height:30,channels:4,background:'#3876ba'}}).png().toBuffer();
 const file=path.join(dir,'공통자료.png');fs.writeFileSync(file,bytes);assert(file.length>260);
 const bounds={x:.25,y:0,width:.5,height:.5};const actual=await materialImages({cropPaths:[file],recognition:{materials:[{label:'공통 자료',regionIndex:0,bounds}]}});
 const output=Buffer.from(actual[0].dataUrl.split(',')[1],'base64');const expected=await sharp(bytes).extract({left:5,top:0,width:10,height:15}).raw().toBuffer();
 assert.deepEqual(await sharp(output).raw().toBuffer(),expected);assert.equal(actual[0].label,'공통 자료');
});
