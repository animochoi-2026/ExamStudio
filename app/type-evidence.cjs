'use strict';
// Ignore quotation punctuation and display whitespace, never mathematical
// symbols, numbers or words. Every quoted fragment must occur in the source.
const normalize=value=>String(value??'').replace(/\s+/gu,' ').trim();
function matchesEvidence(question,evidence){
 if(typeof evidence!=='string'||!evidence.trim())return false;
 const sources=[question?.body,...(question?.choices||[])].map(normalize);
 const contains=value=>{const text=normalize(value);return !!text&&sources.some(source=>source.includes(text));};
 if(contains(evidence))return true;
 // A model may join whole source fields with " / ". Require exact fields here,
 // so a slash inside a changed formula cannot become permissive fragment matching.
 const fields=evidence.split(/\s+\/\s+/u);
 if(fields.length>1&&fields.every(field=>sources.includes(normalize(field))))return true;
 const quoted=/“([^”]+)”|"([^"\n]+)"|‘([^’]+)’|「([^」]+)」|『([^』]+)』/gu;
 const matches=[...evidence.matchAll(quoted)];
 if(!matches.length)return false;
 let end=0;
 for(const match of matches){
  const gap=evidence.slice(end,match.index);
  if(end===0?gap.trim()!== '':!/^\s*(?:[,;·]|및|그리고)?\s*$/u.test(gap))return false;
  if(!contains(match.slice(1).find(value=>value!==undefined)))return false;
  end=match.index+match[0].length;
 }
 return !evidence.slice(end).trim();
}
module.exports={matchesEvidence};
