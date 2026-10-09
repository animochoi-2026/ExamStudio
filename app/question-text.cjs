'use strict';
// Only a leading, explicitly delimited source question number; never bare numeric conditions.
function withoutSourceNumber(body){return String(body||'').replace(/^\s*(?:문제\s*\d{1,3}\s*(?:번|[.)．:]|(?=\s))|\[\s*\d{1,3}\s*\]|\d{1,3}\s*번\s*[.)．:]?|\d{1,3}[.)．](?!\d))\s*/u,'');}
function splitSourcePoints(value){
 return require('./structured-layout.js').splitSourcePoints(value);
}
// A printed line ending is not automatically a new paragraph. Keep explicit
// blank lines and list starts, while joining a wrapped sentence (including
// math followed by Korean particles such as "에서"). Used only on OCR output.
function normalizePrintLineBreaks(value){
 const formulas=[];const text=String(value||'').replace(/\r\n?/g,'\n').replace(/\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]/g,match=>{const index=formulas.push(match)-1;return `\u0000FORMULA${index}\u0000`;});const lines=text.split('\n'),result=[];
 for(const line of lines){
  const trimmed=line.trim();if(!result.length){result.push(trimmed);continue;}
  const previous=result.at(-1),list=/^(?:[①-⑳]|[ㄱ-ㅎ]\s*[.．)]|\(?\d{1,2}\)|\d{1,2}[.)．]|[-•]|(?:보기|조건|그림)\s*[:：])/u.test(trimmed);
  if(!trimmed||!previous||list||/[.!?。:：]$/.test(previous.trim()))result.push(trimmed);
  else{const particle=/^(?:에서|으로|부터|까지|인|[은는이가을를와과의에])(?:\s|$|(?=[가-힣]))/u.test(trimmed),attached=particle&&/(?:\$|[A-Za-z가-힣0-9°])$/u.test(previous.trimEnd());result[result.length-1]=previous.trimEnd()+(attached?'':' ')+trimmed;}
 }
 return result.join('\n').replace(/\n{2,}/g,'\n').trim().replace(/\u0000FORMULA(\d+)\u0000/g,(_,index)=>formulas[Number(index)]);
}
function separateStatements(q){
 const clean=value=>{const plain=String(value).replace(/^\s*(?:[①②③④⑤⑥⑦⑧]\s*|\d+[.)]\s*)/,'');return /^[ㄱ-ㅎ]\s*[.．)]\s*\S/u.test(plain)?plain:value;};
 const box=(q.statementBox||[]).map(clean),choices=[];
 for(const value of q.choices||[]){
  const plain=String(value).replace(/^\s*(?:[①②③④⑤⑥⑦⑧]\s*|\d+[.)]\s*)/,'');
  if(/^[ㄱ-ㅎ]\s*[.．)]\s*\S/u.test(plain))box.push(plain);else choices.push(value);
 }
 return {...q,statementBox:[...new Set(box)],choices};
}
module.exports={sourcePoints:require('./structured-layout.js').sourcePoints,withoutSourceNumber,separateStatements,splitSourcePoints,normalizePrintLineBreaks};
