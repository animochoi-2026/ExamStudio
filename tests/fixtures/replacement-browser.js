import {examEditor} from '../../web-bank/exam-editor.js';
import {mockExams} from '../../web-bank/mock-exams.js';
import {questionContent} from '../../web-bank/print-question.js';
import {mathText} from '../../web-bank/math-text.js';
import {publicHome} from '../../web-bank/public-home.js';
import {membershipPage} from '../../web-bank/membership-ui.js';
import M from '../../web-bank/mock-exam-model.cjs';
const node=(t,x='',c='')=>{const n=document.createElement(t);n.textContent=x;n.className=c;return n;},root=document.getElementById('view'),status=node('p');document.body.prepend(status);
const action=(text,fn,primary=false)=>{const b=node('button',text,primary?'primary':'');b.onclick=async()=>{b.disabled=true;try{await fn();}catch(e){status.textContent=e.message;}finally{if(!b.dataset.confirm)b.disabled=false;}};return b;};
const field=(p,label,value='',type='text')=>{const l=node('label'),i=node('input');i.type=type;i.value=value??'';l.append(node('span',label),i);p.append(l);return i;};
const config={spaceId:'fixture'},user={id:'replacement-fixture'},params=new URLSearchParams(location.search),mode=params.get('mode')||'normal';
const catalogs=Array.from({length:17},(_,i)=>({question_id:'Q'+i,revision_id:'R'+i,metadata:{source:{kind:'학교기출',school:i<12?'원래중':'다른중',grade:'중2',originalNumber:String(i+1),originalPoints:3},content:{responseType:'선택형'},classification:{primaryUnit:{id:'m2-8.7',name:'삼각형의 무게중심'},types:[{id:'task.length',name:'길이 계산'}]},difficulty:{userScore:i%11}},content:{body:'검사 문항 '+i},confirmed:{}}));
const questions=catalogs.map((c,i)=>({id:c.question_id,sourceId:c.question_id,kind:'original',body:`교체 확인 ${i}. $x+${i+1}=${i+3}$일 때 $x$를 구하시오.`,answer:'2',solution:`교체 확인 풀이 ${i}. 양변에서 ${i+1}을 빼면 $x=2$이다.`,choices:['1','2','3','4','5']}));
const reader={render:async(id,options={})=>{const index=catalogs.findIndex(x=>x.revision_id===id),q=structuredClone(questions[index]),element=questionContent(q,[]);if(options.answers)element.append(node('h3','정답'),mathText(q.answer),node('h3','상세 풀이'),mathText(q.solution));return {catalog:catalogs[index],question:q,element,figures:[]};}};
const paper={id:'fixture-paper',version:1,title:'대체문항 출력 확인',answerMode:'detailed',status:'draft',rules:{schools:['원래중'],units:['m2-8.7'],excludeIds:[]},items:[{questionId:'Q0',revisionId:'R0',originalPoints:7,workspaceMm:25},{questionId:'Q1',revisionId:'R1',originalPoints:5,workspaceMm:10}]};
const doc=M.create('fixture-mock');doc.title='대체문항 모의고사';doc.autoTitle=false;doc.schools=['원래중'];doc.counts={A:{choice:2,written:0}};M.addVariant(doc,'A','fixture-paper');doc.variants[0].units=['m2-8.7'];doc.paperForm={template:'mock',minutes:45,logoVisible:false,scoreNote:'문항별 배점 확인'};doc.variants[0].paper={...structuredClone(paper),paperForm:structuredClone(doc.paperForm)};sessionStorage.removeItem('bank-mock-work:fixture:replacement-fixture');
const rpc=async(name,args)=>{
 if(name==='bank_question_sets_get'||name==='bank_source_exams'||name==='bank_search_current'||name==='bank_mock_list')return [];
 if(name==='bank_exam_get')return {id:paper.id,version:1,document:paper};
 if(name==='bank_mock_get')return {id:doc.id,version:1,document:doc};
 if(name==='bank_mock_schools')return ['원래중','다른중'];
 if(name==='bank_replacement_page'){const eligible=catalogs.filter(c=>!args.selected.includes(c.question_id)),base=eligible.filter(c=>c.metadata.source.school==='원래중'),extra=eligible.filter(c=>c.metadata.source.school!=='원래중'),all=args.expanded?eligible:base,items=args.candidate?all.filter(c=>c.question_id===args.candidate):all.slice(args.page*10,args.page*10+10);status.textContent=`서버 페이지 요청: ${args.page+1} · 반환 ${items.length}개`;return {baseCount:base.length,extraCount:extra.length,total:all.length,version:'fixture',items:items.map(c=>({...c,tier:1,sameType:true,sameUnit:true,otherSchool:c.metadata.source.school!=='원래중'}))};}
 if(name==='bank_public_summary')return {dashboard:{questions:17,schools:2,sourceExams:2,pending:0,difficulty:{total:17,counts:{low:3,middle:8,high:5,unknown:1},killerCount:2}},recentSources:[{school:'원래중',academicYear:'2026',grade:'중2',semester:'2학기',exam:'중간고사',registered:17,reviewed:17}],asOf:new Date().toISOString()};
 if(name==='bank_signup_list')return [{kind:'signup',userId:'fixture-pending',email:'fixture@example.test',createdAt:new Date().toISOString()}];
 if(name==='bank_members_manage')return [{userId:'fixture-teacher',email:'teacher@example.test',role:'teacher',enabled:true,roleVersion:0}];
 if(name==='bank_mock_save'||name==='bank_exam_save'){status.textContent='인공 저장본 저장됨';return {id:args.e,version:args.expected+1};}
 throw Error('Unexpected fixture RPC '+name);
};
const ctx={root,node,action,field,rpc,config,user,reader,rows:async()=>[],save:()=>{},navigate:()=>{},message:t=>status.textContent=t,clear:title=>{root.replaceChildren(node('h2',title));return root;}};
const originalURL=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{const format=blob.type.includes('pdf')?'pdf':blob.type.includes('wordprocessingml')?'docx':blob.type==='application/hwp+zip'?'hwpx':null;if(format)fetch('/output/'+mode+'.'+format,{method:'POST',body:blob});return originalURL(blob);};
if(mode==='mock')await mockExams({...ctx,mockId:doc.id});
else if(mode==='public'){root.append(node('h2','기출문제로 만드는 나만의 시험지'),node('p','기출문제 검색·관리와 시험지·실전모의고사 제작'),action('로그인하기',()=>{},true),action('가입신청하기',()=>{}));await publicHome(ctx);}
else if(mode==='admin')await membershipPage({...ctx,member:{role:'admin'}});
else await examEditor({...ctx,examId:paper.id,chosen:[]});
status.textContent='검사 화면 준비 완료';
