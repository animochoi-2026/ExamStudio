// Synthetic API fixtures only. Expose save/recovery evidence as visible text.
const past=new URLSearchParams(location.search).get('mode')==='past';
const fixture=await import(past?'./past-print-browser.js':'./mock-design-browser.js');
const audit=document.createElement('pre');audit.id='save-audit';audit.setAttribute('aria-label','합성 저장 기록');document.body.append(audit);
function report(){
 const saved=window.saved;
 audit.textContent=JSON.stringify({errors:window.errors,saved:saved&&{id:saved.id,title:saved.title,version:saved.version,font:saved.bodyFontSize,figure:saved.figureScalePercent,form:saved.paperForm?.template,academy:saved.paperForm?.academyName,items:saved.items?.map(i=>i.questionId),papers:saved.variants?.map(v=>({label:v.label,font:v.paper?.bodyFontSize,order:v.paper?.items.map(i=>i.questionId)}))}},null,2);
}
setInterval(report,150);report();
if(past){const reopen=document.createElement('button');reopen.textContent='합성 저장본 다시 열기';reopen.onclick=()=>window.openPrint({document:window.saved,id:window.saved.id,version:1});document.body.append(reopen);}
else if(new URLSearchParams(location.search).get('mode')==='exam'){const reopen=document.createElement('button');reopen.textContent='합성 편집 화면 다시 열기';reopen.onclick=fixture.reopenExam;document.body.append(reopen);}
