'use strict';
const inventory=require('../app/source-inventory.cjs');
function title(value){
 const raw=String(value??'').trim(),pairs={'[':']','【':'】','(' :')','（':'）'};
 const unwrapped=pairs[raw[0]]===raw.at(-1)?raw.slice(1,-1).trim():raw;
 const normalized=unwrapped.normalize('NFKC'),m=normalized.match(/^((?:(?:논술|서술|서답|주관|단답|객관|선택)(?:형|식)?)\s*)?(?:문제\s*)?([1-9]\d{0,3}(?:[-.]\d+|\(\d+\))?)\s*번?[.)．:]?$/u);
 return m?[m[1]?.trim(),m[2]].filter(Boolean).join(' '):raw;
}
const numeric=value=>{const n=Number(value);return value!=null&&String(value).trim()&&Number.isFinite(n)&&n>0?n:1e9;};
const printedTitle=value=>title(value)||'원문 번호 미확인';
// Presentation only: unwrap a recognized question label, never content brackets.
function answerTitle(value){const raw=String(value??'').trim();return /^\[(?:(?:서답|서술|논술|주관|단답|객관|선택)(?:형|식)?\s*)?(?:문제\s*)?\d+(?:[-.]\d+|\(\d+\))?\s*번?\]$/u.test(raw)?raw.slice(1,-1).trim():raw;}
function leadingHeader(body){return String(body??'').match(/^\s*(?:\[[ \t]*(?:(?:논술|서술|서답|주관|단답|객관|선택)(?:형|식)?\s*)?(?:문제\s*)?\d{1,4}(?:[-.]\d+|\(\d+\))?\s*번?\s*\]|(?:(?:논술|서술|서답|주관|단답|객관|선택)(?:형|식)?\s*|문제\s*)\d{1,4}(?:[-.]\d+|\(\d+\))?\s*번?[.．:]?(?=\s|$)|\d{1,4}(?:번[.．:]?|[.)．:])(?!\d))\s*/u);}
function printedNumber(c){
 const stored=c.metadata?.source?.originalNumber;
 if(stored!=null&&String(stored).trim())return stored;
 // A missing catalog number may be recovered only from an explicit printed
 // leading header in the existing source excerpt, never an ID or bare condition.
 return leadingHeader(c.content?.body)?.[0].trim()||null;
}
function compareSource(a,b){
 const x=a.metadata?.source||{},y=b.metadata?.source||{};
 const xn=inventory.sourceNumber({...x,originalNumber:title(printedNumber(a))}),yn=inventory.sourceNumber({...y,originalNumber:title(printedNumber(b))});
 const rank=n=>n.section==='objective'?0:n.section==='written'?1:2;
 const section=rank(xn)-rank(yn);if(section)return section;
 const p=xn.number?xn.number.match(/\d+/g).map(Number):[numeric(x.originalOrder)],q=yn.number?yn.number.match(/\d+/g).map(Number):[numeric(y.originalOrder)];
 for(let i=0;i<Math.max(p.length,q.length);i++){const delta=(p[i]??0)-(q[i]??0);if(delta)return delta;}
 const order=numeric(x.originalOrder)-numeric(y.originalOrder);if(order)return order;
 const xp=x.position||{},yp=y.position||{};
 return numeric(xp.page)-numeric(yp.page)||Number((xp.x??0)>=.45)-Number((yp.x??0)>=.45)||(xp.y??0)-(yp.y??0)||(xp.x??0)-(yp.x??0);
}
function orderSource(rows){return rows.slice().sort(compareSource);}
function restoreItems(rows,previous,makeItem){
 const sorted=orderSource(rows),byId=new Map(sorted.map(c=>[c.question_id,c]));
 // Only the first restoration adopts source order. Existing edits (including
 // deliberate exclusions) own their order when reopening the same working copy.
 return previous?previous.map(item=>byId.has(item.questionId)?{...item,...makeItem(byId.get(item.questionId),item)}:item):sorted.map(c=>makeItem(c));
}
function stripHeader(value,printed){
 const body=String(value??''),expected=title(printed);
 if(!expected)return body;
 // Strip only an explicit leading label matching this source identity. A bare
 // number in a condition is not a header. Keep all text after the matched token.
 const m=leadingHeader(body);
 return m&&title(m[0])===expected?body.slice(m[0].length):body;
}
function forOutput(question,printed){
 const body=stripHeader(question.body,printed);let layoutDocument=question.layoutDocument;
 if(layoutDocument){
  const nodes=layoutDocument.nodes.slice(),index=nodes.findIndex(n=>n.origin==='printed'&&n.parentId===null&&['paragraph','proofStep'].includes(n.type));
  const n=nodes[index],leading=[];
  for(const inline of n?.inlines||[]){if(inline.origin!=='printed'||inline.kind!=='text')break;leading.push(inline);}
  const original=leading.map(x=>x.text).join(''),text=stripHeader(original,printed);
  if(text!==original){
   let remaining=original.length-text.length;
   const inlines=n.inlines.map((x,i)=>{if(i>=leading.length)return x;const consumed=Math.min(remaining,x.text.length);remaining-=consumed;return {...x,text:x.text.slice(consumed)};});
   if(inlines.every(x=>x.kind==='text'&&!x.text.trim()))nodes.splice(index,1);else nodes[index]={...n,inlines};
   layoutDocument={...layoutDocument,nodes};
  }
 }
 return {...question,body,...(layoutDocument?{layoutDocument}:{})};
}
module.exports={title,printedTitle,answerTitle,printedNumber,compareSource,orderSource,restoreItems,stripHeader,forOutput};
