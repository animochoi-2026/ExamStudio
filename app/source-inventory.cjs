'use strict';
// Printed identity is independent of the work-list position. No school-specific
// totals or last-number inference belongs in this module.
const fields=['school','grade','academicYear','semester','exam'];
const clean=v=>String(v??'').normalize('NFKC').replace(/\s+/g,'').trim();
function number(value, section=null){
 const raw=String(value??'').normalize('NFKC').trim().replace(/^\[\s*(.*?)\s*\]$/,'$1'),written=/서술|서답|주관|단답|논술/.test(raw);
 const detected=written?'written':/객관|선택/.test(raw)?'objective':null;
 const stated=section==='written'||section==='objective'?section:null;
 const part=section==='unknown'||detected&&stated&&detected!==stated?null:detected||stated;
 const text=raw.replace(/^(?:(?:서술|서답|주관|단답|논술|객관|선택)(?:형|식)?\s*)?(?:문제\s*)?/,'').replace(/\s*번?[.．:]?$/,'').trim();
 const valid=/^[1-9]\d{0,3}(?:[-.]\d+|\(\d+\))?$/.test(text);
 return {raw,section:part,number:valid?text:null,key:valid&&part?part+':'+text:null};
}
function sourceNumber(source={}){
 // Bare numbers in legacy school-exam catalogs denote the objective sequence;
 // an explicit uncertain section from a new recognition never uses that fallback.
 const section=source.numbering?.section??source.section;
 return number(source.originalNumber,section==='unknown'?'unknown':section||(/서술|서답|주관|단답|논술/.test(String(source.originalNumber))?'written':'objective'));
}
function identity(source={}){
 const values=Object.fromEntries(fields.map(k=>[k,clean(source[k])]));
 values.academicYear=values.academicYear.replace(/학년도$|년도$|년$/,'');
 const printed=sourceNumber(source);
 return {values,printed,complete:fields.every(k=>values[k])&&!!printed.key,
  key:fields.every(k=>values[k])&&printed.key?JSON.stringify([...fields.map(k=>values[k]),printed.key]):null};
}
function normalize(value){
 if(!value||typeof value!=='object')return null;
 const count=x=>Number.isInteger(x)&&x>0&&x<=2000?x:null;
 const section=['objective','written'].includes(value.section)?value.section:'unknown';
 const objectiveCount=count(value.objectiveCount),writtenCount=value.writtenCount===0?0:count(value.writtenCount),total=count(value.total);
 const invalid=['total','objectiveCount','writtenCount'].some(k=>value[k]!=null&&(!Number.isInteger(value[k])||value[k]<(k==='writtenCount'?0:1)||value[k]>2000));
 const consistent=!invalid&&(objectiveCount!==null&&writtenCount!==null?total===null||total===objectiveCount+writtenCount:true);
 return {section,total:consistent?total:null,objectiveCount:consistent?objectiveCount:null,writtenCount:consistent?writtenCount:null,
  evidence:String(value.evidence||'').slice(0,1000),confirmed:value.confirmed===true&&consistent,
  uncertain:value.uncertain===true||!consistent};
}
function inventory(items, manifest={}){
 const ids=new Set();items=items.filter(item=>{const id=item.question_id||item.questionId;if(!id)return true;if(ids.has(id))return false;ids.add(id);return true;});
 const seen=new Map(),unknown=[];
 for(const item of items){const source=item.metadata?.source||item.source||item;const n=sourceNumber(source);if(!n.key){unknown.push(item.question_id||item.questionId||source.originalNumber||'?');continue;}seen.set(n.key,(seen.get(n.key)||0)+1);}
 const counts=normalize(manifest.numbering||manifest)||{};
 const expectedTotal=counts.total??manifest.expected_count??manifest.expectedCount??null;
 const expected=[];
 for(const [section,count]of [['objective',counts.objectiveCount],['written',counts.writtenCount]])if(Number.isInteger(count))for(let i=1;i<=count;i++)expected.push(section+':'+i);
 const missing=expected.filter(k=>!seen.has(k));
 const duplicates=[...seen].filter(([,n])=>n>1).map(([k])=>k);
 const unexpected=expected.length?[...seen.keys()].filter(k=>!expected.includes(k)):[];
 return {included:items.length,distinct:seen.size,expectedTotal,missing,duplicates,unknown,unexpected,
  complete:!counts.uncertain&&expected.length>0&&expected.length===expectedTotal&&!missing.length&&!duplicates.length&&!unknown.length&&!unexpected.length};
}
function sourceProgress(source={},progress={}){
 const numbering=normalize(progress.numbering||source.numbering),explicit=progress.expected_count??progress.expectedCount;
 const expectedCount=Number.isInteger(explicit)&&explicit>0&&explicit<=2000?explicit:!numbering?.uncertain?(numbering?.total??(numbering?.objectiveCount!=null&&numbering?.writtenCount!=null?numbering.objectiveCount+numbering.writtenCount:null)):null;
 return {...progress,expectedCount,numbering};
}
function sourceCountLabel(entry){const progress=sourceProgress(entry.source,entry.progress||{});return `(총 ${entry.question_count}/${progress.expectedCount??'?'}문제)`;}
const label=key=>key.replace(/^objective:/,'객관식 ').replace(/^written:/,'서술형 ')+'번';
module.exports={fields,number,sourceNumber,identity,normalize,inventory,sourceProgress,sourceCountLabel,label};
