import {examEditor} from '../../web-bank/exam-editor.js';
import {questionContent} from '../../web-bank/print-question.js';
import {paperFormSettings,paperFormCatalog,formLoader} from '../../web-bank/paper-form-settings.js';
import {renderPastPrint} from '../../web-bank/past-print-render.js';
import {exportDocx} from '../../web-bank/web-export.js';
import {configurePdfMathBase} from '../../web-bank/pdf-math.js';
import {prepareImagePdf} from '../../web-bank/image-pdf.js';
const node=(t,s='',c='')=>{const n=document.createElement(t);n.textContent=s;n.className=c;return n;};
const action=(s,fn)=>{const b=node('button',s);b.onclick=fn;return b;};
const field=(p,s,v='',type='text')=>{const l=node('label',s),i=node(type==='textarea'?'textarea':'input');i.type=type;i.value=v;l.append(i);p.append(l);return i;};
const root=document.getElementById('view'),config={spaceId:'modern-local'},user={id:'local-teacher'};
window.messages=[];
const logo=await (await fetch('/logo.txt')).text();
const diagram='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="190" height="100"><path d="M30 85L95 10L160 85Z" fill="none" stroke="#24282e"/><text x="90" y="10" font-size="10">A</text><text x="20" y="95" font-size="10">B</text><text x="164" y="95" font-size="10">C</text><text x="87" y="37" font-size="10">40°</text></svg>');
window.fixture=async({scores=true,count=18,long=false,noLogo=false,title='실전모의고사 1회',template='modern-minimal',past=false}={})=>{
 root.replaceChildren();window.messages=[];
 const questions=Array.from({length:count},(_,i)=>({id:'q'+i,sourceId:'q'+i,kind:'original',include:true,responseType:i<4?'single_choice':i===4?'single_value':'written_response',body:i===4?'단답형: $x+2=5$일 때, $x$의 값은?':i<4?'그림과 같이 $AB=AC$인 이등변삼각형 $ABC$에서 $\\angle A=40^\\circ$이다. $\\frac{1}{2}+\\sqrt{3}$의 값을 구하시오.':'삼각형의 두 변의 길이가 $a=3$, $b=4$이다. 주어진 조건에서 넓이를 구하고 이유를 설명하시오.',choices:i<4?['10','12','14','16','18']:[],answer:'3',solution:'주어진 조건을 대입하면 $x=3$이다.'}));
 if(long)questions[2].body=Array.from({length:75},(_,i)=>`긴 문항의 조건 ${i+1}: $x+1=${i+2}$를 확인한다.`).join('\n');
 const catalogs=questions.map((q,i)=>({question_id:q.id,revision_id:'r'+i,metadata:{source:{school:'검증중',grade:'중2',originalNumber:String(i+1),originalPoints:i===3?null:i<4?4:6},content:{responseType:q.responseType},classification:{primaryUnit:{id:'m2-6.3'}}}}));
 const reader={render:async id=>{const i=Number(id.slice(1)),question=structuredClone(questions[i]),figures=[];if(i===0||i===1){const img=node('img');img.src=diagram;img.style.cssText='width:64mm;height:auto';figures.push({id:'diagram',node:img});}return {question,catalog:catalogs[i],figures,element:questionContent(question,figures)};}};
 const draft={id:'modern-fixture',version:0,title,examTitle:title,variantLabel:'A1',roundLabel:'1회',bodyFontSize:9.6,status:'draft',answerMode:'quick',paperForm:{id:'builtin:'+template,template,academyName:'압구정파인만학원',logo:noLogo?null:logo,logoVisible:!noLogo,minutes:45},rules:{units:['m2-6.3']},showOriginalPoints:scores,preserveOriginalOrder:true,items:questions.map((q,i)=>({questionId:q.id,revisionId:'r'+i,originalNumber:String(i+1),originalPoints:i===3?null:i<4?4:6,points:i===5?7:undefined,workspaceMm:i>=5?30:0,year:i<10?2025:2024,sourceId:i<10?'s25':'s24',index:i}))};
 const rpc=async name=>{if(name==='bank_question_sets_get')return [];throw Error('Unexpected network operation: '+name);};
 const context={root,config,user,node,action,field,reader,rpc,rows:async()=>[],save:()=>{},message:m=>window.messages.push(m),navigate:()=>{}};
 if(past){draft.pastPrint={from:2024,to:2025,schoolNames:['검증중']};const result=await renderPastPrint({...context,draft,section:'questions'});root.append(result.questions);window.handle=null;}else await examEditor({...context,examId:'new',chosen:[],outputSection:'questions',embedded:{draft,onChange:()=>{},setHandle:h=>window.handle=h}});
 window.localDraft=draft;window.questions=questions;window.reader=reader;window.context=context;
 return {ready:past||window.handle.ready(),status:window.handle?.layoutStatus(),messages:window.messages};
};
window.pdf=async()=>{configurePdfMathBase(location.origin+'/fixture.js');const file=await prepareImagePdf(root.querySelector('.exam-pages'),localDraft.title,{textContent:''},{section:'questions',questionCount:localDraft.items.length});return Array.from(new Uint8Array(await file.blob.arrayBuffer()));};
window.nativeSnapshot=async()=>{
 const draft=window.handle.getDraft(),loaded=await Promise.all(draft.items.map(i=>reader.render(i.revisionId)));
 const pages=root.querySelector('.exam-pages');
 // Use the exact preview measurement and positioned figures when serializing.
 loaded.forEach((r,i)=>{r.element=pages.querySelector(`.print-question[data-index="${i}"] .native-question`);r.figures.forEach(f=>{f.node=r.element.querySelector('img');});});
 const layout={pages:[...pages.querySelectorAll('.exam-page:not(.answer-page)')].map(p=>({columns:[...p.querySelectorAll('.exam-column')].map(c=>[...c.querySelectorAll('.print-question')].map(q=>({questionId:draft.items[Number(q.dataset.index)].questionId})))}))};
 const Old=window.Worker;window.Worker=class{postMessage(data){window.nativeRequest=data;queueMicrotask(()=>this.onmessage({data:{bytes:new Uint8Array()}}));}terminate(){}};
 try{await exportDocx({draft,loaded,layout,pages,status:{textContent:''},download:false});return {snapshot:nativeRequest.snapshot,assets:nativeRequest.assets.map(a=>({name:a.name,bytes:Array.from(new Uint8Array(a.bytes))}))};}finally{window.Worker=Old;}
};
window.openSettings=async()=>{root.replaceChildren();await paperFormSettings({...context});};
window.checkCatalog=(id=user.id)=>paperFormCatalog(config,{id});
window.ready=true;
