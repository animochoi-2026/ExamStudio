'use strict';
// Conservative local comparison. Never execute an answer as JS or ask an AI to
// agree with the stored answer. Unsupported equivalence is not a successful check.
function normalize(value){return String(value??'').normalize('NFKC').trim()
 .replace(/\\(?:left|right)\b/g,'').replace(/\\(?:dfrac|tfrac|frac)\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g,'($1)/($2)')
 .replace(/\\(?:mathrm|text)\{([^{}]+)\}/g,'$1').replace(/\\(?:times|cdot)\b/g,'×')
 .replace(/\\(?:[,;:! ]|qquad\b|quad\b|enspace\b|thinspace\b)/g,'').replace(/\\(?:displaystyle|textstyle)\b/g,'')
 .replace(/\\boxed\{([^{}]+)\}/g,'$1').replace(/\^\{?\\circ\}?/g,'°')
 .replace(/\\pi\b/g,'π').replace(/[\s$]/g,'').replace(/−/g,'-').replace(/[.。]$/,'');}
function rational(s){
 s=normalize(s).replace(/\((-?\d+(?:\.\d+)?)\)/g,'$1');
 const fraction=/^(-?\d+)\/(-?\d+)$/.exec(s);let n,d;
 if(fraction){n=BigInt(fraction[1]);d=BigInt(fraction[2]);if(d===0n)return null;}
 else {const m=/^(-?)(\d+)(?:\.(\d+))?$/.exec(s);if(!m)return null;d=10n**BigInt((m[3]||'').length);n=BigInt(m[2]+(m[3]||''))*(m[1]?-1n:1n);}
 if(d<0n){n=-n;d=-d;}let a=n<0n?-n:n,b=d;while(b){const r=a%b;a=b;b=r;}return `${n/a}/${d/a}`;
}
function choice(value,count){
 const s=String(value??'').trim();const circled='①②③④⑤⑥⑦⑧⑨⑩'.indexOf(s[0]);if(circled>=0&&circled<count&&(!s[1]||/[\s$(:：.。]/.test(s[1])))return circled;
 const prefix=/^(?:정답\s*[:：]?\s*)?([1-9]|10)\s*번(?:\s|$)/.exec(s);if(prefix&&Number(prefix[1])<=count)return Number(prefix[1])-1;
 const m=/^(?:정답\s*[:：]?\s*)?(?:\(?([1-9]|10)\)?\s*(?:번)?)$/.exec(s);return m&&Number(m[1])<=count?Number(m[1])-1:null;
}
function multipart(value){
 const s=String(value??'').trim(),matches=[...s.matchAll(/(?:^|[\s,;])\(([1-9]\d?)\)\s*/g)];
 if(matches.length<2||s.slice(0,matches[0].index).trim())return null;
 const values=matches.map((m,i)=>s.slice(m.index+m[0].length,matches[i+1]?.index??s.length).trim().replace(/[,;]\s*$/,''));
 if(matches.some((m,i)=>Number(m[1])!==i+1)||values.some(v=>!v))return null;
 return values;
}
function equivalent(a,b){
 const x=normalize(a),y=normalize(b);if(!x||!y)return false;
 if(x===y||(rational(x)!==null&&rational(x)===rational(y)))return true;
 const pa=triangleConclusion(a),pb=triangleConclusion(b);
 if(pa&&pb&&pa===pb)return true;
 const left=multipart(a),right=multipart(b);
 return !!left&&!!right&&left.length===right.length&&left.every((v,i)=>equivalent(v,right[i]));
}
// Compare the explicit triangle answer and named criterion, not arbitrary prose.
// This does not claim to prove every explanation sentence. Missing, contradictory,
// negated or multiple triangle conclusions remain unverified.
function triangleConclusion(value){
 const s=String(value??'').replace(/\\triangle\b/g,'△').replace(/\\(?:cong|equiv)\b/g,'≅').replace(/\\sim\b/g,'∼').replace(/[≡]/g,'≅').replace(/[∽~]/g,'∼').replace(/[\s$]/g,'');
 if(/아니|않|불가|틀|not|false/i.test(s))return null;
 const matches=[...s.matchAll(/△([A-Z]{3})([≅∼])△([A-Z]{3})/g)];
 if(matches.length!==1||matches[0].index!==0)return null;
 const criteria=[...new Set(s.match(/SSS|SAS|ASA|RHS|RHA|AA/g)||[])];
 if(criteria.length!==1)return null;
 const m=matches[0],kind=m[2],criterion=criteria[0];
 if(kind==='≅'&&!['SSS','SAS','ASA','RHS','RHA'].includes(criterion)||kind==='∼'&&!['AA','SAS','SSS'].includes(criterion))return null;
 if(new Set(m[1]).size!==3||new Set(m[3]).size!==3)return null;
 return `${m[1]}${kind}${m[3]}:${criterion}`;
}
function choiceSet(value,count){
 const s=String(value??'').trim().replace(/^정답\s*[:：]?\s*/,'');
 if(!/^[①②③④⑤⑥⑦⑧⑨⑩](?:\s*(?:[,，·]|및|와|과)\s*[①②③④⑤⑥⑦⑧⑨⑩])*$/.test(s))return null;
 const indices=[...s].filter(c=>'①②③④⑤⑥⑦⑧⑨⑩'.includes(c)).map(c=>'①②③④⑤⑥⑦⑧⑨⑩'.indexOf(c));
 if(indices.some(i=>i>=count)||new Set(indices).size!==indices.length)return null;
 return indices.sort((a,b)=>a-b).join(',');
}
function scopeCompatible(actual,expected){
 if(normalize(actual)===normalize(expected)&&normalize(expected))return true;
 const grades=s=>[...String(s||'').matchAll(/(초(?:등학교)?|중(?:학교)?|고(?:등학교)?)\s*([1-6])(?:\s*학년)?/g)].map(m=>m[1][0]+m[2]);
 const a=[...new Set(grades(actual))],e=[...new Set(grades(expected))];
 // An explicit target grade may cite already learned lower-grade prerequisites.
 // An absent target, later grade or different school level still fails closed.
 return e.length===1&&a.includes(e[0])&&a.every(g=>g[0]===e[0][0]&&Number(g[1])<=Number(e[0][1]));
}
function verify(derived,stored,{answerType,choices=[]}={}){
 if(!normalize(stored))return {valid:false,reason:'stored_answer_missing'};
 if(!normalize(derived))return {valid:false,reason:'derived_answer_missing'};
 if(answerType==='multiple_choice'){
  const setA=choiceSet(derived,choices.length||10),setB=choiceSet(stored,choices.length||10);
  if(setA!==null&&setB!==null)return {valid:setA===setB,reason:setA===setB?'choice_set_match':'answer_mismatch'};
  const count=choices.length||10,a=choice(derived,count),b=choice(stored,count);
  if(a!==null&&b!==null)return {valid:a===b,reason:a===b?'choice_match':'answer_mismatch'};
  if(a!==null&&b===null&&equivalent(choices[a],stored))return {valid:true,reason:'choice_value_match'};
  if(a===null&&b!==null&&equivalent(derived,choices[b]))return {valid:true,reason:'choice_value_match'};
  if(a===null&&b===null&&equivalent(derived,stored)&&choices.filter(c=>equivalent(c,stored)).length===1)return {valid:true,reason:'choice_value_match'};
  return {valid:false,reason:'choice_unresolved'};
 }
 // Some independent solutions give the numeric value rather than its option
 // number. Resolve a saved option only when real choice text is available.
 const storedChoice=choices.length?choice(stored,choices.length):null;
 if(storedChoice!==null&&equivalent(derived,choices[storedChoice]))return {valid:true,reason:'choice_value_match'};
 if(equivalent(derived,stored))return {valid:true,reason:'normalized_answer_match'};
 return {valid:false,reason:['proof','descriptive','expression','unknown'].includes(answerType)?'answer_equivalence_unverified':'answer_mismatch'};
}
module.exports={normalize,rational,multipart,choice,choiceSet,scopeCompatible,equivalent,verify};
