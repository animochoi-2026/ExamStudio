'use strict';
// Printed copies omit only the application's explicitly marked review appendix.
// Never mutate the saved solution or hide unmarked mathematical explanations.
function printableSolution(text){
 const value=String(text||'');
 const appendix=/^\s*\[참고 코멘트\]/m.exec(value);
 return (appendix?value.slice(0,appendix.index):value)
  .split('\n').filter(line=>!/^\s*원문 확인 참고\s*:/.test(line)).join('\n').trimEnd();
}
module.exports={printableSolution};
