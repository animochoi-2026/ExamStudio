(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ExamDiagnostics=api;})(globalThis,function(){
 const names={collinear:'일직선',equalLength:'같은 길이',perpendicular:'수직',parallel:'평행',midpoint:'중점',distance:'길이',angle:'각도'};
 function explain(text,diagram){
  const legacy=String(text).match(/^(collinear|equalLength|perpendicular|parallel|midpoint|distance|angle) 조건의 점/);
  if(legacy){const type=legacy[1],constraints=(diagram?.constraints||[]).filter(c=>c.type===type),points=[...new Set(constraints.flatMap(c=>c.points||[]))];return `${points.length?points.join('·')+' 점의 ':''}${names[type]} 조건을 검사할 도형 데이터가 맞지 않습니다. 점 참조나 조건 형식을 도형 자동 수정으로 확인할 수 있습니다. 이 메시지만으로 정답이 틀렸다고 확정한 것은 아닙니다.`;}
  return String(text);
 }
 function transport(text){return /로그인|연결|사용량|한도|quota|auth|timeout|시간.*초과|응답.*형식|JSON|파싱|수량 불일치|(?:응답|결과).*누락|중지/i.test(text);}
 return{explain,transport};
});
