'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const text=require('../app/question-text.cjs'),structure=require('../app/structured-layout.js'),model=require('../app/bank-model.cjs');
const actual=require('./fixtures/answer-count-points-actual.json'),cases=require('./fixtures/answer-count-points-cases.json');
test('combined answer-count annotations hide only score and separator across printed variants',()=>{
 for(const [original,body,points]of cases.remove){assert.deepEqual(text.splitSourcePoints(original),{original,body,points});assert.equal(text.splitSourcePoints(body).body,body);}
 for(const original of cases.preserve)assert.deepEqual(text.splitSourcePoints(original),{original,body:original,points:null});
});
test('actual saved triangle question preserves answer condition, choices, geometry and source metadata',()=>{
 const before=JSON.stringify(actual),out=structure.forOutput(actual);
 assert.equal(out.body,actual.body.replace('/3점',''));assert.equal(structure.sourcePoints(actual),3);
 assert.deepEqual(out.choices,actual.choices);assert.deepEqual(out.observedDiagram,actual.observedDiagram);assert.equal(JSON.stringify(actual),before);
 const metadata=model.metadata(actual,{id:actual.sourceId,recognition:{}},{scope:{}});assert.equal(metadata.source.originalPoints,3);
 const explicit={...actual,originalPoints:7};assert.equal(structure.sourcePoints(explicit),7);assert.equal(structure.forOutput(explicit).originalPoints,7);
 const structured={...actual,layoutMode:'preserve',layoutDocument:{nodes:[{id:'prompt',parentId:null,type:'paragraph',origin:'printed',inlines:[{kind:'text',origin:'printed',text:actual.body}]}]}};
 assert.equal(structure.forOutput(structured).layoutDocument.nodes[0].inlines[0].text,out.body);
});
test('web list excerpts use the same score policy as native preview and output',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'exam-count-score-'));
 try{const file=path.join(dir,'presentation.cjs');await require('esbuild').build({entryPoints:[path.resolve(__dirname,'../web-bank/presentation.js')],outfile:file,bundle:true,platform:'node',format:'cjs',logLevel:'silent'});const {previewText}=require(file);
 assert.equal(previewText(actual.body),structure.forOutput(actual).body);assert.match(previewText(actual.body),/\(정답 2개\)/);assert.doesNotMatch(previewText(actual.body),/3점/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
