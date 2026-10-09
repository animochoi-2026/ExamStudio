(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ExamReviewIssues=api;})(globalThis,function(){
 const normalized=text=>String(text||'').normalize('NFKC').replace(/\[(?:원본\s*확인\s*필요|확인\s*필요)\]/g,'').trim().replace(/^(?:observation|관찰\s*기록)\s*:\s*/i,'').replace(/\s+/g,'').trim();
 const issueKey=u=>JSON.stringify([u.kind||'reading',u.location?.regionIndex??null,normalized(u.location?.description),normalized(u.text)]);
 const uniqueIssues=items=>[...new Map((items||[]).map(u=>[issueKey(u),u])).values()];
 const logKey=e=>JSON.stringify([e.projectId||null,e.problemId||null,normalized(e.text)]);
 const sourceReady=r=>!!r&&!r.sourceStale&&!r.rulesStale&&!(r.uncertainties||[]).length&&(r.confirmed||r.generationConsent?.active===true);
 function uncertaintyTarget(issue){
  if(issue.kind&&issue.kind!=='reading')return null;
  const text=String(issue.text||''),location=String(issue.location?.description||'');
  const body=/본문|문장|지문|선택지|보기|글자|분모|분자|부등호/;
  const diagram=/도형|그림|각도|빗금|치수|표식|점선|중심점|선분|교점/;
  if(body.test(text)&&diagram.test(text))return null;
  if(body.test(text))return 'text';if(diagram.test(text))return 'diagram';
  if(body.test(location)&&!diagram.test(location))return 'text';
  if(diagram.test(location)&&!body.test(location))return 'diagram';return null;
 }
 return{normalized,issueKey,uniqueIssues,logKey,sourceReady,uncertaintyTarget};
});
