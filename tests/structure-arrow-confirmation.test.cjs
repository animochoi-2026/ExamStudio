'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const structure=require('../app/structured-layout.js'),{normalizeQuestion}=require('../app/store.cjs'),actual=require('./fixtures/compound-proof-uploaded.json');
test('saved source-confirmed arrow survives normalization/JSON and renders between original figures',()=>{
 const before=JSON.stringify(actual),fixed=structure.confirmArrow(actual,{nodeId:'arrow',symbol:'→',sourceConfirmed:true});
 const q=normalizeQuestion(JSON.parse(JSON.stringify(fixed)),actual.sourceId,'original');
 const html=structure.html(q,{math:x=>x,figure:n=>'<img alt="'+n.id+'">'});
 assert(html.indexOf('alt="figureDEF"')<html.indexOf('>→</span>'));assert(html.indexOf('>→</span>')<html.indexOf('alt="figureCombined"'));
 assert.deepEqual(fixed.choices,actual.choices);assert.equal(fixed.body,actual.body);assert.equal(fixed.answer,actual.answer);assert.equal(JSON.stringify(actual),before);
 assert.equal(fixed.layoutDocument.nodes.filter(n=>n.type==='arrow')[0].inlines[0].text,'→');
});
test('missing arrows fail output; directions are explicit and handwritten/uncertain nodes are never repaired',()=>{
 assert.throws(()=>structure.html(actual,{math:x=>x,figure:()=>'<img>'}),/화살표 원본 확인 필요/);
 assert.throws(()=>structure.confirmArrow(actual,{nodeId:'arrow',symbol:'→'}),/원본/);
 for(const symbol of ['←','↑','↓','↔']){const renamed=structuredClone(actual);renamed.layoutDocument.nodes.find(n=>n.type==='arrow').id='observed-'+symbol.codePointAt(0);const out=structure.confirmArrow(renamed,{nodeId:'observed-'+symbol.codePointAt(0),symbol,sourceConfirmed:true});assert.equal(out.layoutDocument.nodes.find(n=>n.type==='arrow').inlines[0].text,symbol);}
 for(const origin of ['handwritten','uncertain']){const q=structuredClone(actual);q.layoutDocument.nodes.find(n=>n.type==='arrow').origin=origin;assert.throws(()=>structure.confirmArrow(q,{nodeId:'arrow',symbol:'→',sourceConfirmed:true}),/인쇄/);}
 const normal={...actual,layoutMode:'normal'};assert.equal(structure.html(normal,{}),null);
});
