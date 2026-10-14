import {examEditor} from '../../web-bank/exam-editor.js';
import {mockExams} from '../../web-bank/mock-exams.js';
import {questionContent} from '../../web-bank/print-question.js';
import M from '../../web-bank/mock-exam-model.cjs';
const params=new URLSearchParams(location.search),mode=params.get('mode')||'ordinary',data=await(await fetch('/fixture?mode='+mode)).json();
const node=(t,x='',c='')=>{const n=document.createElement(t);n.textContent=x;n.className=c;return n;},root=document.getElementById('view'),status=document.getElementById('status');
const action=(text,fn,primary=false)=>{const b=node('button',text,primary?'primary':'');b.onclick=async()=>{b.disabled=true;try{await fn();}catch(e){status.textContent=e.message;}finally{if(!b.dataset.confirm)b.disabled=false;}};return b;};
const field=(p,label,value='',type='text')=>{const l=node('label'),i=node('input');i.type=type;i.value=value??'';l.append(node('span',label),i);p.append(l);return i;};
const catalogs=data.questions.map(q=>({question_id:q.q,revision_id:q.r,metadata:q.metadata,confirmed:{difficulty:q.score},summaryDifficulty:{score:q.score}}));
const reader={render:async(r,options={})=>{const c=catalogs.find(c=>c.revision_id===r),q={id:c.question_id,body:'합성 문항 '+c.metadata.source.originalNumber+' 다음 식의 값을 구하세요. $x+1=3$',choices:['1','2','3','4','5'],answer:'2',solution:'양변에서 1을 뺍니다.'},element=questionContent(q,[]);if(options.answers)element.append(node('h3','정답 2'),node('p',q.solution));return{catalog:c,question:q,element,figures:[]};}};

const paper={id:crypto.randomUUID(),version:1,title:'대체문항 검증',answerMode:'quick',paperForm:{template:'mock',scoreNote:''},print:{paper:'A4',columns:2,marginsMm:{top:20,right:15,bottom:18,left:15}},status:'draft',rules:data.rules,items:data.questions.slice(0,2).map(q=>({questionId:q.q,revisionId:q.r,originalPoints:q.n===1?7:5,workspaceMm:15,responseType:'선택형'}))};
const doc=M.create(crypto.randomUUID());doc.title='합성 모의고사';doc.schools=data.rules.schools;doc.autoTitle=false;doc.counts={A:{choice:2,written:0}};M.addVariant(doc,'A',crypto.randomUUID());doc.variants[0].units=data.rules.units;doc.variants[0].paper=structuredClone(paper);doc.version=1;
M.addVariant(doc,'A',crypto.randomUUID());doc.variants[1].units=data.rules.units;doc.variants[1].paper={...structuredClone(paper),id:crypto.randomUUID(),items:[structuredClone(paper.items[0]),{...structuredClone(paper.items[1]),questionId:data.questions[4].q,revisionId:data.questions[4].r}]};
paper.rules={...paper.rules,unit:null,type:null,count:25,types:{선택형:20,단답형:5},profile:{low:0,middle:100,high:0,targetAverage:5}};
if(mode==='ordinary-success'){for(const [i,c]of catalogs.entries()){c.confirmed.difficulty=5;if(i>=2&&i<7)c.metadata.content.responseType=['단답형','서논술형','논술형','서술형','single_value'][i-2];}}
if(mode==='ordinary-shortage'||mode==='ordinary-apply'){paper.rules.count=60;paper.rules.types={선택형:60,서술형:0};}
if(mode==='mock-shortage'||mode==='mock-apply'){doc.counts={A:{choice:60,written:0}};for(const v of doc.variants)v.paper=null;doc.profile={low:0,middle:100,high:0,targetAverage:5};}
if(mode.endsWith('difficulty')){paper.rules.count=10;paper.rules.types={선택형:10,서술형:0};paper.rules.profile={low:30,middle:50,high:20,targetAverage:5};doc.counts={A:{choice:10,written:0,choicePoints:4}};for(const v of doc.variants)v.paper=null;doc.profile={low:30,middle:50,high:20,targetAverage:5};}
window.requests=[];window.fixture={paper,doc};
const rpc=async(name,args={})=>{
 if(['bank_replacement_candidates','bank_mock_check'].includes(name)){window.requests.push({name,args});const res=await fetch('/rpc',{method:'POST',body:JSON.stringify({name,args})}),value=await res.json();if(!res.ok)throw Error(value.message);return value;}
 if(name==='bank_exam_candidates'){window.requests.push({name,args});return catalogs.filter(c=>args.schools?.includes(c.metadata.source.school)&&c.metadata.source.grade==='중2'&&Number(c.metadata.source.originalNumber)<97);}
 if(name==='bank_mock_candidates'){window.requests.push({name,args});return {id:'fixture',candidates:catalogs.filter(c=>args.schools?.includes(c.metadata.source.school)&&Number(c.metadata.source.originalNumber)<97),excludeIds:[]};}
 if(name==='bank_question_sets_get'||name==='bank_source_exams'||name==='bank_search_current'||name==='bank_mock_list'||name==='bank_paper_forms')return [];
 if(name==='bank_exam_get')return {id:paper.id,version:1,document:paper};
 if(name==='bank_mock_get')return {id:doc.id,version:1,document:doc};
 if(name==='bank_mock_schools')return ['지정중','다른중'];
 if(name==='bank_exam_save'||name==='bank_mock_save'){window.saved=structuredClone(args.doc);return {id:args.e,version:args.expected+1};}
 throw Error('Unexpected fixture RPC '+name);
};
const ctx={root,node,action,field,rpc,config:{spaceId:data.S,grade:'m2'},user:{id:data.A},reader,rows:async()=>[],save:()=>{},navigate:()=>{},message:t=>status.textContent=t,clear:title=>{root.replaceChildren(node('h2',title));return root;}};
if(mode.startsWith('mock'))await mockExams({...ctx,mockId:doc.id});else await examEditor({...ctx,examId:paper.id,chosen:[]});
window.ready=true;
