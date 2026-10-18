'use strict';
// Conservative local comparison. Never execute an answer as JS or ask an AI to
// agree with the stored answer. Unsupported equivalence is not a successful check.
function normalize(value){return String(value??'').normalize('NFKC').trim()
 .replace(/\\(?:left|right)\b/g,'').replace(/\\(?:dfrac|tfrac|frac)\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g,'($1)/($2)')
 .replace(/\\(?:mathrm|text)\{([^{}]+)\}/g,'$1').replace(/\\(?:times|cdot)\b/g,'×').replace(/\\,/g,'')
 .replace(/[\s$]/g,'').replace(/−/g,'-');}
function rational(s){
 s=normalize(s).replace(/\((-?\d+(?:\.\d+)?)\)/g,'$1');
 const fraction=/^(-?\d+)\/(-?\d+)$/.exec(s);let n,d;
 if(fraction){n=BigInt(fraction[1]);d=BigInt(fraction[2]);if(d===0n)return null;}
 else {const m=/^(-?)(\d+)(?:\.(\d+))?$/.exec(s);if(!m)return null;d=10n**BigInt((m[3]||'').length);n=BigInt(m[2]+(m[3]||''))*(m[1]?-1n:1n);}
 if(d<0n){n=-n;d=-d;}let a=n<0n?-n:n,b=d;while(b){const r=a%b;a=b;b=r;}return `${n/a}/${d/a}`;
}
function choice(value,count){
 const s=String(value??'').trim();const circled='①②③④⑤⑥⑦⑧⑨⑩'.indexOf(s[0]);if(circled>=0&&circled<count&&(!s[1]||/[\s$(:：]/.test(s[1])))return circled;
 const prefix=/^(?:정답\s*[:：]?\s*)?([1-9]|10)\s*번(?:\s|$)/.exec(s);if(prefix&&Number(prefix[1])<=count)return Number(prefix[1])-1;
 const m=/^(?:정답\s*[:：]?\s*)?(?:\(?([1-9]|10)\)?\s*(?:번)?)$/.exec(s);return m&&Number(m[1])<=count?Number(m[1])-1:null;
}
function equivalent(a,b){const x=normalize(a),y=normalize(b);if(!x||!y)return false;return x===y||(rational(x)!==null&&rational(x)===rational(y));}
function verify(derived,stored,{answerType,choices=[]}={}){
 if(!normalize(stored))return {valid:false,reason:'stored_answer_missing'};
 if(!normalize(derived))return {valid:false,reason:'derived_answer_missing'};
 if(answerType==='multiple_choice'){
  const count=choices.length||10,a=choice(derived,count),b=choice(stored,count);
  if(a!==null&&b!==null)return {valid:a===b,reason:a===b?'choice_match':'answer_mismatch'};
  if(a!==null&&b===null&&equivalent(choices[a],stored))return {valid:true,reason:'choice_value_match'};
  return {valid:false,reason:'choice_unresolved'};
 }
 if(equivalent(derived,stored))return {valid:true,reason:'normalized_answer_match'};
 return {valid:false,reason:['proof','descriptive','expression','unknown'].includes(answerType)?'answer_equivalence_unverified':'answer_mismatch'};
}
module.exports={normalize,rational,choice,equivalent,verify};
