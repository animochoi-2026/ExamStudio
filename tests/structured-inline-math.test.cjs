'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const structure=require('../app/structured-layout.js'),{math,documentHtml}=require('../app/pdf-export.cjs');
const actual=require('./fixtures/compound-proof-actual.json');
test('actual saved proof math delimiters render inline, keeping math and particles in a single paragraph',()=>{
 const before=JSON.stringify(actual),confirmed=structure.confirmArrow(actual,{nodeId:'arrow',symbol:'\u2192',sourceConfirmed:true}),html=documentHtml({title:'실제 재현',settings:{},questions:[confirmed]});
 assert.doesNotMatch(html,/<[^>]+class="[^"]*\b(?:katex-display|katex-error)\b/);
 const condition=html.slice(html.indexOf('data-structure-id="condition"'),html.indexOf('data-structure-id="figures"'));
 assert.equal((condition.match(/class="structure-paragraph"/g)||[]).length,0); // starts inside the one paragraph tag
 assert.match(condition,/인 두 직각삼각형/);assert.match(condition,/>와 /);assert.match(condition,/>에서 /);assert.match(condition,/라고 하자/);
 assert.equal((condition.match(/<span class="katex">/g)||[]).length,4);
 assert.match(html,/를 뒤집어/);assert.equal((html.match(/data-blank-label=/g)||[]).length,5);assert.equal((html.match(/class="structure-figure"/g)||[]).length,3);
 assert.equal(JSON.stringify(actual),before);
});
test('one delimiter envelope is unwrapped, while actual backslashes and escaped dollar content are preserved',()=>{
 for(const wrapped of [String.raw`$\angle C=90^\circ$`,String.raw`$$\angle C=90^\circ$$`,String.raw`\(\angle C=90^\circ\)`,String.raw`\[\angle C=90^\circ\]`])assert.equal(structure.inlineMath(wrapped),String.raw`\angle C=90^\circ`);
 const aligned=String.raw`\begin{aligned}a&=b\\c&=d\end{aligned}`;assert.equal(structure.inlineMath('$'+aligned+'$'),aligned);
 const escaped=String.raw`x+\$5`;assert.equal(structure.inlineMath('$'+escaped+'$'),escaped);
 assert.equal(structure.inlineMath(String.raw`\frac{1}{2}`),String.raw`\frac{1}{2}`);
 assert.throws(()=>structure.inlineMath('$x$ + $y$'),/한 개의 수식/);assert.throws(()=>structure.inlineMath('$x'),/닫히지/);
 assert.match(math('본문 $$x=1$$'),/katex-display/); // ordinary explicit display behavior stays intact
});
