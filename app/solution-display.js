(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ExamSolutionDisplay=api;})(globalThis,function(){
 function solutionText(q){
  const text=String(q.solution||'');
  // Hide only the application's recognizable old grading appendix. Preserve
  // the saved historical solution and every user-authored explanation.
  return q.questionType&&!['proof','written_response'].includes(q.questionType)?text.split('\n\n[서술형 채점기준')[0]:text;
 }
 return {solutionText};
});
