'use strict';
const isModern = draft => (draft.paperForm||draft.settings?.paperForm)?.template==='modern-minimal';
const bodySize = draft => draft.bodyFontSize??draft.settings?.bodyFontSize??(isModern(draft)?9.6:10);
// Use the recorded subtype, not the broad selection category (which also
// includes short answers). This never rewrites recognition or source text.
const isWritten = value => /^(서술형|논술형|proof|written_response|essay)$/i.test(String(value||'').trim());
const responseType=(question,metadata)=>question?.responseType??question?.questionType??metadata?.content?.responseType;
function sectionStarts(items, types){
 const starts=new Set();
 for(let i=0;i<items.length;i++)if(isWritten(types[i])&&(i===0||!isWritten(types[i-1]))){
  const set=items[i].questionSet;
  // A mixed connected set must stay together, with its original member order.
  if(!set||set.members?.[0]?.questionId===(items[i].bankQuestionId??items[i].questionId??items[i].id))starts.add(i);
 }
 return starts;
}
const points=(draft,item,fallback)=>draft.showOriginalPoints?(item.points??item.originalPoints??fallback??null):null;
module.exports={isModern,bodySize,isWritten,responseType,sectionStarts,points};
