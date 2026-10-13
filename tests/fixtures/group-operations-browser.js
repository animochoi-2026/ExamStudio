import {installBottomClearance} from '../../web-bank/bottom-clearance.js';
import {examEditor} from '../../web-bank/exam-editor.js';
import {mockExams} from '../../web-bank/mock-exams.js';
import {pastPrint} from '../../web-bank/past-print.js';
import {membershipPage,managementTools} from '../../web-bank/membership-ui.js';
import {difficultyPanel} from '../../web-bank/composition-summary.js';
import {decorateDifficulty,recentSource} from '../../web-bank/home-view.js';
import {schoolSources} from '../../web-bank/school-sources.js';
import {setGrade} from '../../web-bank/grade-workspace.js';
import {questionContent} from '../../web-bank/print-question.js';
import filters from '../../app/bank-search-filters.cjs';
setGrade('m2');
const node=(t,s='',c='')=>{const n=document.createElement(t);n.textContent=s;n.className=c;return n;};
window.errors=[];window.calls=[];window.clicked=[];
const action=(t,f)=>{const b=node('button',t);b.onclick=async()=>{b.disabled=true;try{await f();}catch(e){window.errors.push(e.message);}finally{b.disabled=false;}};return b;};
const field=(p,t,v='',type='text')=>{const l=node('label',t),i=node('input');i.type=type;i.value=v;l.append(i);p.append(l);return i;};
const root=document.querySelector('#view'),nav=document.querySelector('#nav');for(const text of ['홈','문항찾기','시험지','검수함','학교·시험지','중2 학년 이동'])nav.append(action(text,()=>window.clicked.push(text)));
installBottomClearance();
const cats=[2,5,8,9].map((score,i)=>({question_id:'q'+i,revision_id:'r'+i,metadata:{source:{kind:'학교기출',documentId:'source1',school:'검증중',academicYear:2026,grade:'중2',semester:'2학기',exam:'기말고사'},content:{responseType:'선택형'},classification:{primaryUnit:{id:'m2-6.3',name:'직각삼각형의 합동'}}},confirmed:{difficulty:score}}));
const sources=[{source_id:'source1',source:cats[0].metadata.source,question_count:4,contributors:['teacher@example.test'],updated_at:new Date().toISOString(),last_registered_at:new Date().toISOString()}];
const reader={render:async rev=>{const i=Number(rev.slice(1)),q={id:'q'+i,sourceId:'q'+i,kind:'original',body:'검증 문항 '+i,answer:'1',solution:'검증 풀이',choices:['1','2','3','4','5']},element=node('div');questionContent({parent:element,question:q,node});return {question:q,element,catalog:cats[i],figures:[]};}};
const rpc=async(name,args)=>{window.calls.push({name,args});if(name==='bank_exam_school_index')return cats.map(c=>({...c,source_id:'source1'}));if(name==='bank_source_exams'||name==='bank_school_sources')return sources;if(name==='bank_mock_schools')return ['검증중'];if(name==='bank_source_questions'||name==='bank_exam_candidates')return cats;if(name==='bank_profile_get')return {};if(name==='bank_groups_list')return [{id:'g',name:'파인만',memberCount:2,mockCount:0}];if(name==='bank_members_manage')return [{userId:'b',email:'b@example.test',name:'교사',academy:'파인만',role:'teacher',groupId:'g',groupName:'파인만',enabled:true,roleVersion:0}];if(name==='bank_source_difficulty')return {};if(['bank_mock_check','bank_question_sets_get','bank_exam_list','bank_mock_list','bank_signup_list'].includes(name))return [];throw Error('Unexpected RPC '+name);};
const ctx={root,node,action,field,rpc,reader,config:{spaceId:'fixture',grade:'m2'},user:{id:'fixture'},member:{role:'owner'},chosen:[],rows:async()=>[],save:()=>{},message:t=>window.notice=t,navigate:async next=>window.clicked.push(next),clear:title=>{root.replaceChildren(node('h2',title));return root;}};
const page=new URLSearchParams(location.search).get('page')||'exam';
if(page==='exam')await examEditor({...ctx,examId:'new'});
if(page==='mock')await mockExams({...ctx,mockId:'new'});
if(page==='past')await pastPrint(ctx);
if(page==='admin'){await membershipPage(ctx);for(let i=0;i<25;i++)root.append(node('p','관리 화면 스크롤 검증 '+i));managementTools({...ctx,security:()=>window.clicked.push('security'),invitations:()=>window.clicked.push('invite'),maintenance:()=>window.clicked.push('maintenance')});}
if(page==='schools')await schoolSources({...ctx,sourceCard:e=>node('article',e.source.school),order:'recent'});
if(page==='home'){
 root.classList.add('home');const summary={total:4,counts:{low:1,middle:1,high:2,unknown:0},killerCount:1};const selected=key=>{const clean=filters.clean({compositionBand:key}),matched=cats.filter(c=>filters.matches(c,clean));window.filterResult={key,ids:matched.map(c=>c.question_id)};result.textContent=matched.length?matched.map(c=>c.question_id).join(', '):'해당 조건의 문항이 없습니다.';};
 const panel=difficultyPanel(node,[],'난이도',selected,summary),result=node('p');decorateDifficulty(panel,summary,node,selected);root.append(panel,result,recentSource(sources[0],ctx));
}
window.ready=true;
