'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),S=require('../app/structured-layout.js');
test('source-confirmed standalone blank keeps tokens, containing box, width, alignment and order',()=>{
 const raw=JSON.parse(fs.readFileSync('tests/fixtures/compound-proof-uploaded.json')),before=JSON.stringify(raw),q=S.confirmStandaloneBlank(raw,{nodeId:'placementStep',inlineIndex:6,sourceConfirmed:true}),nodes=q.layoutDocument.nodes,at=nodes.findIndex(n=>n.id==='placementStep');
 const three=nodes.slice(at,at+3);assert.deepEqual(three.map(n=>n.parentId),['proofBox','proofBox','proofBox']);assert.deepEqual(three.flatMap(n=>n.inlines),raw.layoutDocument.nodes.find(n=>n.id==='placementStep').inlines);assert.equal(three[1].inlines[0].kind,'blank');assert.equal(three[1].align,'center');assert.equal(three[1].inlines[0].widthEm,13);assert.equal(three[0].inlines[0].text,'\\triangle DEF');assert.match(three[0].inlines[1].text,/를 뒤집어/);assert.match(three[2].inlines[0].text,/이므로/);assert.equal(JSON.stringify(raw),before);
});
test('ordinary output is unchanged; absent or unconfirmed blank cannot be invented',()=>{
 const q=JSON.parse(fs.readFileSync('tests/fixtures/compound-proof-uploaded.json'));assert.throws(()=>S.confirmStandaloneBlank(q,{nodeId:'placementStep',inlineIndex:6}));assert.throws(()=>S.confirmStandaloneBlank(q,{nodeId:'placementStep',inlineIndex:0,sourceConfirmed:true}));assert.equal(S.html({...q,layoutMode:'normal'}),null);
});
