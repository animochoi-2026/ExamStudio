'use strict';
// Conservative local comparison. Never execute an answer as JS or ask an AI to
// agree with the stored answer. Unsupported equivalence is not a successful check.
function normalize(value){return String(value??'').replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g,s=>'^'+[...s].map(c=>'0123456789-'['⁰¹²³⁴⁵⁶⁷⁸⁹⁻'.indexOf(c)]).join('')).normalize('NFKC').trim()
 .replace(/\\overline\{([A-Za-z]{2})\}/g,'$1')
 .replace(/\\(?:dfrac|tfrac|frac)\s*([0-9])\s*\{([^{}]+)\}/g,'($1)/($2)')
 .replace(/\\(?:dfrac|tfrac|frac)\s*([0-9])\s*([0-9])/g,'($1)/($2)')
 .replace(/\\(?:left|right)\b/g,'').replace(/\\(?:dfrac|tfrac|frac)\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g,'($1)/($2)')
 .replace(/\\(?:mathrm|text)\{([^{}]+)\}/g,'$1').replace(/\\(?:times|cdot)\b/g,'×')
 .replace(/\\(?:[,;:! ]|qquad\b|quad\b|enspace\b|thinspace\b)/g,'').replace(/\\(?:displaystyle|textstyle)\b/g,'')
 .replace(/\\boxed\{([^{}]+)\}/g,'$1').replace(/\^\{?\\circ\}?/g,'°')
 .replace(/\\pi\b/g,'π').replace(/\\triangle\b/g,'△').replace(/\\angle\b/g,'∠').replace(/\\parallel\b/g,'∥')
 .replace(/\\(?:cong|equiv)\b|≡/g,'≅').replace(/\\sim\b|∽/g,'∼')
 .replace(/\^\{(-?\d+)\}/g,'^$1').replace(/[\s$]/g,'').replace(/−/g,'-').replace(/[.。]$/,'')
 .replace(/\(([A-Za-z]+|-?\d+(?:\.\d+)?|\d+π)\)(?=\/)/g,'$1')
 .replace(/(?<=\/)\(([A-Za-z]+|-?\d+(?:\.\d+)?|\d+π)\)/g,'$1');}
function rational(s){
 s=normalize(s).replace(/^\((-?\d+(?:\.\d+)?)\)$/,'$1');
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
 const s=String(value??'').trim(),matches=[...s.matchAll(/(?:^|[\s,;])\(([1-9]\d?|[가나다라마바사아자차])\)\s*/g)];
 if(matches.length<2||s.slice(0,matches[0].index).trim())return null;
 const values=matches.map((m,i)=>s.slice(m.index+m[0].length,matches[i+1]?.index??s.length).trim().replace(/[,;]\s*$/,''));
 const korean=/[가-힣]/.test(matches[0][1]);
 if(matches.some((m,i)=>korean?m[1]!=='가나다라마바사아자차'[i]:Number(m[1])!==i+1)||values.some(v=>!v))return null;
 return values;
}
function splitTop(value,separator=','){
 const parts=[];let depth=0,start=0;
 for(let i=0;i<value.length;i++){if('({['.includes(value[i]))depth++;if(')}]'.includes(value[i]))depth--;if(depth<0)return null;if(value[i]===separator&&depth===0){parts.push(value.slice(start,i));start=i+1;}}
 if(depth)return null;parts.push(value.slice(start));return parts.every(Boolean)?parts:null;
}
function quantity(value){
 const s=normalize(value),m=/^(-?\d+(?:\.\d+)?(?:\/-?\d+)?)(mm|cm|km|m|°|원|초|분|시간|개|가지|대)?(\^[23])?$/.exec(s);
 if(!m||m[3]&&!['mm','cm','km','m'].includes(m[2]))return null;
 const number=rational(m[1]);return number===null?null:{number,unit:(m[2]||'')+(m[3]||'')};
}
function assignment(value){const m=/^((?:∠[A-Z]{3}|[A-Za-z]{1,3}(?:\^[23])?|[A-Z]{2}\/[A-Z]{2}))=([^=]+)$/.exec(normalize(value));return m?{label:m[1],value:m[2]}:null;}
function alternatives(value){
 const parts=normalize(value).split('또는');if(parts.length<2)return null;
 const first=assignment(parts[0]);
 return parts.map((s,i)=>i&&first&&quantity(s)?first.label+'='+s:s);
}
function propertyQuestion(value){
 const s=normalize(value);
 // A small closed grammar for classification questions, not fuzzy prose similarity.
 const m=/^(네변의길이가모두같|두대각선의길이가같)(?:은성질이항상성립하는가|은성질을(?:항상)?갖는지여부|은지여부|은가|은지)$/.exec(s);
 return m?.[1]||null;
}
function equivalent(a,b){
 const x=normalize(a),y=normalize(b);if(!x||!y)return false;
 if(x===y||(rational(x)!==null&&rational(x)===rational(y)))return true;
 const pa=triangleConclusion(a),pb=triangleConclusion(b);
 if(pa&&pb&&pa===pb)return true;
 const left=multipart(a),right=multipart(b);
 if(left||right)return !!left&&!!right&&left.length===right.length&&left.every((v,i)=>equivalent(v,right[i]));
 const ax=alternatives(a),ay=alternatives(b);
 if(ax||ay){if(!ax||!ay||ax.length!==ay.length)return false;const remaining=[...ay];return ax.every(v=>{const i=remaining.findIndex(w=>equivalent(v,w));if(i<0)return false;remaining.splice(i,1);return true;});}
 const lx=splitTop(String(a).replace(/^\s*순서대로\s*/,'')),ly=splitTop(String(b).replace(/^\s*순서대로\s*/,''));
 if(lx?.length>1||ly?.length>1)return !!lx&&!!ly&&lx.length===ly.length&&lx.every((v,i)=>equivalent(v,ly[i]));
 const qa=quantity(x),qb=quantity(y);
 if(qa&&qb)return qa.number===qb.number&&qa.unit===qb.unit;
 const aa=assignment(x),ab=assignment(y);
 if(aa&&ab)return aa.label===ab.label&&equivalent(aa.value,ab.value);
 // A single labelled numeric answer may omit its name, never a different name/unit.
 if(aa&&qb)return equivalent(aa.value,y);
 if(ab&&qa)return equivalent(x,ab.value);
 const pqa=propertyQuestion(a),pqb=propertyQuestion(b);
 return !!pqa&&pqa===pqb;
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
function explicitChoices(value,choices){
 const s=String(value??'').trim().replace(/^정답\s*[:：]?\s*/,'');
 const bare=choiceSet(s,choices.length||10);if(bare!==null)return bare;
 const matches=[...s.matchAll(/[①②③④⑤⑥⑦⑧⑨⑩]/g)];
 if(!matches.length||matches[0].index!==0||!choices.length)return null;
 const indices=[];
 for(let n=0;n<matches.length;n++){
  const m=matches[n],i='①②③④⑤⑥⑦⑧⑨⑩'.indexOf(m[0]);if(i>=choices.length||indices.includes(i))return null;
  const tail=s.slice(m.index+1,matches[n+1]?.index??s.length).trim().replace(/[,，·]\s*$/,'').trim();
  const option=String(choices[i]).replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/,'');
  if(tail&&!equivalent(tail,option))return null;indices.push(i);
 }
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
  const setA=explicitChoices(derived,choices),setB=explicitChoices(stored,choices);
  if(setA!==null&&setB!==null)return {valid:setA===setB,reason:setA===setB?'choice_set_match':'answer_mismatch'};
  // A multiple-option answer must never fall through to first-option-only matching.
  if(([...String(derived).matchAll(/[①②③④⑤⑥⑦⑧⑨⑩]/g)].length>1)||([...String(stored).matchAll(/[①②③④⑤⑥⑦⑧⑨⑩]/g)].length>1))return {valid:false,reason:'choice_unresolved'};
  const suffix=/^(.+?)\s*\(([①②③④⑤⑥⑦⑧⑨⑩])\)\s*$/.exec(String(stored).trim());
  if(suffix){const i='①②③④⑤⑥⑦⑧⑨⑩'.indexOf(suffix[2]),option=String(choices[i]||'').replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/,'');if(option&&equivalent(suffix[1],option))return verify(derived,suffix[2],{answerType,choices});}
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
 const qa=quantity(assignment(derived)?.value||derived),qb=quantity(assignment(stored)?.value||stored);
 return {valid:false,reason:qa&&qb?'answer_mismatch':'answer_equivalence_unverified'};
}
module.exports={normalize,rational,multipart,choice,choiceSet,explicitChoices,quantity,assignment,scopeCompatible,equivalent,verify};
