import {examEditor} from '../../web-bank/exam-editor.js';
import {mockExams} from '../../web-bank/mock-exams.js';
import {questionContent} from '../../web-bank/print-question.js';
import {setGrade} from '../../web-bank/grade-workspace.js';
import {setSchoolRegions} from '../../web-bank/school-regions.js';
import aliases from '../../web-bank/school-alias-rpc.cjs';
import M from '../../web-bank/mock-exam-model.cjs';
const mode=new URLSearchParams(location.search).get('mode')||'exam',unit='m2-8.7';
setGrade('m2');window.errors=[];window.calls=[];
const node=(t,text='',cls='')=>{const n=document.createElement(t);n.textContent=text;n.className=cls;return n;},root=document.querySelector('main');
const action=(text,fn,primary=false)=>{const b=node('button',text,primary?'primary':'');b.onclick=async()=>{try{await fn();}catch(e){window.errors.push(e.message);}};return b;};
const field=(parent,label,value='',type='text')=>{const wrap=node('label',label),input=node('input');input.type=type;input.value=value??'';input.setAttribute('aria-label',label);wrap.append(input);parent.append(wrap);return input;};
const schools=['신동중','신동중학교','경원중',...Array.from({length:20},(_,i)=>'학교'+i+'중')];
setSchoolRegions(schools.map((name,i)=>({name,school_key:'서초구|'+name,district:'서초구',province:'서울특별시',status:'verified'})));
const rows=schools.flatMap((school,k)=>Array.from({length:8},(_,i)=>({question_id:`q-${k}-${i}`,revision_id:`r-${k}-${i}`,source_id:'s-'+k,metadata:{source:{kind:'학교기출',region:'서초구',school,grade:'중2',academicYear:'2026',originalNumber:i+1},classification:{primaryUnit:{id:unit}},content:{responseType:'선택형'}},confirmed:{difficulty:[6.8,7.2,7,5,6,8,4,9][i]}})));
const sources=schools.map((school,k)=>({source_id:'s-'+k,source:{school,region:'서초구',grade:'중2',academicYear:'2026'},question_count:8}));
const paper={id:'exam-fixture',version:1,title:'목표 평균 검증',rules:{count:5,types:{선택형:5,서술형:0},schools:['신동중','경원중'],schoolMode:'equal',units:[unit],scopeDistribution:true,profile:{low:30,middle:50,high:20,targetAverage:5,driver:'ratio'}},items:[],status:'draft'};
if(new URLSearchParams(location.search).has('emptyScope')){paper.rules.units=[];paper.rules.schools=[];}
const doc=M.create('mock-fixture');doc.schools=['신동중'];doc.counts.A={choice:4,written:0,choicePoints:4};for(const id of ['v1','v2']){M.addVariant(doc,'A',id);doc.variants.at(-1).units=[unit];}
window.documentFixture=doc;
const rpc=async(name,input={})=>{const args=aliases.request(name,input);window.calls.push({name,args});let result;
 if(name==='bank_exam_get')result={id:paper.id,version:1,document:paper};
 else if(name==='bank_exam_candidates')result=rows.filter(c=>args.schools.includes(c.metadata.source.school));
 else if(name==='bank_source_exams')result=sources;
 else if(name==='bank_exam_school_index')result=rows;
 else if(name==='bank_mock_schools')result=schools;
 else if(name==='bank_mock_get')result={id:doc.id,version:1,document:doc};
 else if(name==='bank_mock_auto_candidates')result={id:'snapshot-fixture',at:new Date().toISOString(),candidates:rows.filter(c=>args.schools.includes(c.metadata.source.school)),excludeIds:[]};
 else if(['bank_question_sets_get','bank_search_current','bank_mock_check','bank_mock_list','bank_paper_forms'].includes(name))result=[];
 else if(['bank_mock_save','bank_exam_save'].includes(name)){window.saved=structuredClone(args.doc);result={id:args.e,version:args.expected+1};}
 else throw Error('Fixture RPC not allowed: '+name);
 return aliases.response(name,result);
};
const reader={render:async(id,options={})=>{const c=aliases.response('bank_exam_candidates',[rows.find(c=>c.revision_id===id)])[0],q={id:c.question_id,body:'다음 식의 값을 구하세요. $x+1=3$',choices:['1','2','3','4','5'],answer:'2',solution:'양변에서 1을 뺍니다.'},element=questionContent(q,[]);if(options.answers)element.append(node('p','정답 2'));return {catalog:c,question:q,element,figures:[]};}};
const ctx={setOutputHandle:h=>window.outputHandle=h,root,node,action,field,rpc,reader,user:{id:'test-user'},config:{spaceId:'fixture',grade:'m2'},chosen:[],save(){},rows:async()=>[],navigate(){},message(text,error){if(error)window.errors.push(text);}};
window.handle=mode==='mock'?await mockExams({...ctx,mockId:doc.id}):await examEditor({...ctx,examId:paper.id});window.ready=true;
