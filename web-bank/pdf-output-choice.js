// One control owns both the PDF section and the existing answer detail mode.
// Old documents retain their answer mode and the caller's previous section default.
export function pdfOutputChoice({node,draft,defaultPart='all',onChange=()=>{}}){
 const label=node('label','출력 내용 · 정답·해설'),select=node('select');select.setAttribute('aria-label','정답·해설');
 for(const [value,text]of [['quick','문제 + 빠른 정답'],['detailed','문제 + 빠른 정답 + 상세 풀이'],['questions','학생용 문제만'],['answers-quick','교사용 빠른 정답만'],['answers-detailed','교사용 빠른 정답 + 상세 풀이']]){const option=node('option',text);option.value=value;select.append(option);}
 let current;
 function setDraft(value){current=value;const part=['all','questions','answers'].includes(value.pdfSection)?value.pdfSection:defaultPart,mode=value.answerMode==='detailed'?'detailed':'quick';select.value=part==='questions'?'questions':part==='answers'?'answers-'+mode:mode;}
 function get(){return {part:select.value==='questions'?'questions':select.value.startsWith('answers-')?'answers':'all',answerMode:select.value==='questions'?(current.answerMode==='detailed'?'detailed':'quick'):select.value.endsWith('detailed')?'detailed':'quick'};}
 select.onchange=()=>onChange(get());label.append(select);setDraft(draft);
 return {label,select,get,setDraft};
}
