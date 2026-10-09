import {examEditor} from '../../web-bank/exam-editor.js';
import {mathText} from '../../web-bank/question-renderer.js';
import {examSession} from '../../web-bank/exam-session.js';
import {examLibrary} from '../../web-bank/exam-library.js';
import {paperFormSettings} from '../../web-bank/paper-form-settings.js';
import M from '../../app/bank-exam-model.cjs';
import C from '../../app/curriculum.js';
import D from '../../app/difficulty-access.cjs';
import {snapshotQuestion} from '../../web-bank/snapshot-question.js';
import {questionContent,questionArticle} from '../../web-bank/print-question.js';
import {difficultyPanel} from '../../web-bank/composition-summary.js';
import {decorateDifficulty} from '../../web-bank/home-view.js';
const node=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;n.className=cls;return n;};
const action=(text,fn)=>{const b=node('button',text);b.onclick=fn;return b;};
const field=(p,label,value='',type='text')=>{const l=node('label',label),i=node(type==='textarea'?'textarea':'input');i.type=type;i.value=value;l.append(i);p.append(l);return i;};
const config={spaceId:'fixture'},user={id:'fixture'},root=document.getElementById('view');
const params=new URLSearchParams(location.search),restored=params.get('mode')==='restored',large=params.has('large');
const real=params.has('real')?await (await fetch('/replay?form='+params.get('real'))).json():null;
const count=real?.questions.length||Number(params.get('count')||8),catalogs=Array.from({length:count},(_,i)=>({question_id:real?.questions[i].id||'q'+i,revision_id:'r'+i,metadata:{source:{school:'검증학교',academicYear:2026,grade:'중2',term:'2학기',exam:'중간고사',originalNumber:real?.questions[i].printedNumber||String(i+1),originalPoints:real?.questions[i].originalPoints},content:{responseType:'single_choice'},classification:{primaryUnit:{id:'m2-6.3'},types:[{id:'type'+i}]},difficulty:{aiScore:5,criteriaVersion:D.version}}}));
if(params.has('scopeId')){const leaf=C.leaves.find(n=>n.id===params.get('scopeId'));if(!leaf)throw Error('Unknown fixture scope');for(const c of catalogs){c.metadata.source.grade=leaf.grade;c.metadata.classification.primaryUnit={id:leaf.id,name:leaf.title};}}
const bs=String.fromCharCode(92),questions=catalogs.map((c,i)=>({id:c.question_id,sourceId:c.question_id,kind:'original',body:`검증문항 Q${i+1}. 직선 $${bs}ell_1${bs}parallel${bs}ell_2$에서 $${bs}frac{6}{2}$의 값을 구하시오.`,answer:'3',solution:`검증풀이 A${i+1}. $${bs}boxed{3}$`,choices:['1','2','3','4','5']}));
if(large)questions[1].body=Array.from({length:13},(_,i)=>'긴 문항의 조건 '+(i+1)+'을 확인합니다.').join('\n');
const canvas=document.createElement('canvas');canvas.width=400;canvas.height=180;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,400,180);ctx.strokeStyle='black';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(20,150);ctx.lineTo(210,20);ctx.lineTo(380,150);ctx.closePath();ctx.stroke();const figure=canvas.toDataURL('image/png');
const reader={render:async revisionId=>{if(window.readerDelay)await new Promise(r=>setTimeout(r,window.readerDelay));if(window.readerFailure===revisionId)throw Error('시험용 읽기 실패');const i=catalogs.findIndex(c=>c.revision_id===revisionId),question=structuredClone(questions[i]),element=node('div','','native-question'),figures=[];const body=mathText(question.body);body.classList.add('question-text');element.append(body);if(i===2){const img=node('img');img.src=figure;img.style.cssText='width:60mm;height:27mm;object-fit:contain';element.append(img);figures.push({id:'diagram',node:img});}const choices=node('div','','choices');question.choices.forEach((x,n)=>choices.append(mathText('①②③④⑤'[n]+' '+x)));element.append(choices);return {question,catalog:catalogs[i],element,figures};}};
if(real)reader.render=async revisionId=>{const i=catalogs.findIndex(c=>c.revision_id===revisionId),q=structuredClone(real.questions[i]),r=snapshotQuestion(q,i,real.settings);return {...r,element:questionContent(q,r.figures),catalog:catalogs[i]};};
window.savedExam=null;window.calls=[];const rpc=async(name,args)=>{window.calls.push({name,args});if(name==='bank_exam_save'){window.savedExam={id:args.e,version:args.expected+1,document:structuredClone(args.doc)};return {version:window.savedExam.version};}if(name==='bank_exam_get')return structuredClone(window.savedExam);if(name==='bank_source_questions')return catalogs;if(name==='bank_source_progress_get')return {status:'complete',expected_count:count};if(name==='bank_exam_list')return [{id:'exam-fixture',title:'삭제 시험지',status:'draft',item_count:8,version:4,updated_at:new Date().toISOString()}];if(name==='bank_exam_archived_list')return [];if(name==='bank_exam_delete')return true;if(name==='bank_search_current'&&params.has('scopeId'))return args.start_at===0?catalogs:[];if(name==='bank_source_exams'||name==='bank_search_current')return [];throw Error('Unexpected RPC '+name);};
window.messages=[];
window.pointsPlacementFixture=()=>[false,true].map(bodyBorder=>{const q={body:'문제 본문',statementBox:['별도 조건'],boxSlot:'after',bodyBorder,choices:[]},content=questionContent(q);questionArticle(content,{index:0,points:'4점'});return {bodyBorder,body:[...content.querySelectorAll('.question-text')].map(p=>p.textContent)};});
window.homeDifficultyFixture=()=>{const summary={total:20,counts:{low:3,middle:10,high:7,unknown:0},killerCount:4,histogram:{},labelDisagreements:0};const regular=difficultyPanel(node,[],'검증',null,summary),home=regular.cloneNode(true);decorateDifficulty(home,summary,node);return {regular:regular.outerHTML,home:home.outerHTML};};
const context={root,config,user,reader,rpc,rows:async()=>[],save:()=>{},navigate:route=>{window.navigated=route;},message:(text,error)=>window.messages.push({text,error}),node,action,field};
window.exportRequests=[];const NativeWorker=window.Worker;window.Worker=class extends NativeWorker{postMessage(data,...rest){if(data.snapshot)window.exportRequests.push(structuredClone(data));return super.postMessage(data,...rest)}};
window.draft=()=>examSession.read(user.id,'new')||examSession.read(user.id,window.savedExam?.id)||window.savedExam?.document;window.reopenSaved=async()=>{root.replaceChildren();await examEditor({...context,examId:window.savedExam.id,chosen:[]});};
window.generation=(rows,rules)=>M.selectQuestions(rows,rules);
window.units=C.leaves.filter(x=>x.grade==='중2').map(x=>x.id);
window.openFormSettings=async()=>{root.replaceChildren();await paperFormSettings({...context,fromExam:true});};
if(params.has('delete'))await examLibrary(context);else{
 if(real)examSession.write(user.id,'new',{id:'real-23-fixture',version:0,title:real.title,answerMode:real.settings.answerMode,status:'draft',rules:{},bodyFontSize:real.settings.bodyFontSize,...(params.get('figure')==='default'?{}:{figureScalePercent:Number(params.get('figure')||100)}),preserveOriginalOrder:true,showOriginalPoints:true,items:catalogs.map((c,i)=>({questionId:c.question_id,revisionId:c.revision_id,workspaceMm:real.questions[i].workspaceMm||0,originalNumber:c.metadata.source.originalNumber,originalPoints:c.metadata.source.originalPoints,breakBefore:real.questions[i].breakBefore||null}))});
 const customForm={id:'saved:custom',name:'사용자 저장폼',version:3,template:'mock',minutes:30,instructionItems:['사용자 안내문 · 이름과 반을 확인하세요.'],scoreNote:'사용자 배점',logoVisible:false};
 if(params.has('overlap')){const logo=document.createElement('canvas');logo.width=120;logo.height=90;const c=logo.getContext('2d');c.fillStyle='#ff6060';c.fillRect(0,0,120,90);Object.assign(customForm,{logo:logo.toDataURL(),logoVisible:true,logoXmm:70,logoYmm:24,logoScalePercent:200});}
 localStorage.setItem('bank-exam-form:fixture:fixture:forms',JSON.stringify([customForm]));
 await examEditor({...context,examId:'new',sourceExam:restored?'unsaved-original':null,chosen:restored?[]:catalogs.map(c=>({questionId:c.question_id,revisionId:c.revision_id}))});
}
window.ready=true;
