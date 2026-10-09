'use strict';
const aliases={'닮음':['닮음','상사'],'피타고라스 정리':['피타고라스','Pythagor'],'삼각비':['삼각비','삼각함수','sin','cos','tan']};
const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function mentions(text,word){
 const latin=/^[a-z]+$/i.test(word),pattern=latin?`(?<![a-z])${escape(word)}${word==='Pythagor'?'[a-z]*':'(?![a-z])'}`:escape(word);
 return [...String(text).matchAll(new RegExp(pattern,'gi'))];
}
function forbiddenConcepts(scope,validation,solution){
 return scope.forbidden.filter(term=>[...new Set([term,...(aliases[term]||[])])].some(word=>{
  // An explicit usedConcepts report is evidence of use, even if the prose denies it.
  if((validation.usedConcepts||[]).some(value=>mentions(value,word).length))return true;
  return mentions(solution||'',word).some(match=>{
   const tail=String(solution).slice(match.index+match[0].length);
   // Exempt only a nearby, explicit non-use clause; do not ignore the rest of a sentence.
   return !/^(?:\s*정리)?\s*(?:은|는|을|를|이|가|에)?\s*(?:(?:사용|이용|활용|적용)(?:하|하지)\s*(?:않|못)|쓰지\s*않|대신|말고|제외|없이|사용\s*금지|금지)/.test(tail);
  });
 }));
}
module.exports={forbiddenConcepts};
// Relax a scope prohibition only when the user explicitly asks to USE that
// named concept. A mention, question, or request not to use it is insufficient.
function requestedConcepts(scope,text){
 return scope.forbidden.filter(term=>[...new Set([term,...(aliases[term]||[])])].some(word=>mentions(text,word).some(match=>{
  const tail=String(text).slice(match.index+match[0].length);
  return /^(?:\s*정리)?\s*(?:을|를|으로|로)?\s*(?:(?:사용|이용|활용|적용)(?:해|해서|하여|하되|하고|해줘|해주)|써서|써\s*줘|풀어|풀어줘)/.test(tail);
 })));
}
module.exports.requestedConcepts=requestedConcepts;
