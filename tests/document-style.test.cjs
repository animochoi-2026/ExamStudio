const test=require('node:test'),assert=require('node:assert/strict');
const {documentStyle}=require('../app/document-style.cjs');
const {documentHtml}=require('../app/pdf-export.cjs');
test('document font settings default safely and affect body without changing answer text size',()=>{
 assert.deepEqual(documentStyle({bodyFont:'<script>',bodyFontSize:100}),{bodyFont:'맑은 고딕',bodyFontSize:12,solutionFont:'맑은 고딕',solutionFontSize:9});
 assert.equal(documentStyle({bodyFont:'바탕',bodyFontSize:16}).bodyFontSize,16);
 const html=documentHtml({title:'서식',settings:{bodyFont:'바탕',bodyFontSize:16},questions:[{body:'문제',choices:[]}]});
 assert.match(html,/font-family:'바탕',sans-serif;font-size:16pt/);assert.match(html,/\.notes\{[^}]*font-size:9pt/);
});
test('solution typography is independent of body typography and rejects invalid settings',()=>{
 const settings={bodyFont:'바탕',bodyFontSize:16,solutionFont:'돋움',solutionFontSize:14};
 assert.deepEqual(documentStyle(settings),settings);
 const html=documentHtml({title:'서식',settings,questions:[{body:'문제',choices:[],answer:'1',solution:'풀이'}]});
 assert.match(html,/font-family:'바탕',sans-serif;font-size:16pt/);
 assert.match(html,/\.notes\{[^}]*font-size:14pt;font-family:'돋움'/);
 assert.equal(documentStyle({...settings,solutionFontSize:100}).solutionFontSize,9);
 assert.equal(documentStyle({...settings,solutionFont:'invalid'}).solutionFont,'바탕');
});
