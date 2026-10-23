// The desktop print window and form editor use the web form components.
// The native questions and project save flow stay in the desktop application.
import {formHeader,formIntro,hasForm,formClass,formFooter,measureForm,fitFormTitles,nativeHeaderFontPt} from './exam-form.js';
import {paperFormPages} from './paper-form-export.js';
import {paperFormCatalog,paperFormSettings,beginFormEdit} from './paper-form-settings.js';
import {examPageHeader,pageContentHeight} from './standard-form.js';
import {defaultLogo} from './exam-form-logo.js';
import {examSession} from './exam-session.js';
import {snapshotQuestion} from './snapshot-question.js';
import {questionFragmenter} from './question-fragments.js';
import {scaleQuestionFigures} from './figure-scale.js';
import {prepareImagePdf} from './image-pdf.js';
import {configurePdfMathBase} from './pdf-math.js';
import {appendSolutionPages} from './solution-flow.js';
import {measureAnswer} from './exam-form.js';
import {mathText} from './math-text.js';
import modern from '../app/modern-minimal.cjs';
import {modernQuestion} from './modern-minimal.js';
const node=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;n.className=cls;return n;};
const config={spaceId:'desktop'},user={id:'local'};
const withDefaults=form=>({logo:form?.template==='modern-minimal'?null:defaultLogo,minutes:form?.template==='modern-minimal'?'':45,...structuredClone(form)});
window.ExamPaperForm={
 async imagePdf(snapshot,mathBase){
  configurePdfMathBase(mathBase);document.querySelector('.notes')?.remove();
  const geometry=await measureAnswer(node,snapshot.title);
  await appendSolutionPages({pages:document.body,title:snapshot.title,loaded:snapshot.questions.map(question=>({question})),items:snapshot.questions.map((q,i)=>({originalNumber:q.printedNumber||String(i+1)})),node,mathText,height:geometry.height,paddingTop:geometry.paddingTop,markAnswers:true,detailed:snapshot.settings.answerMode!=='quick'});
  const status={set textContent(value){document.title=value;}};
  const file=await prepareImagePdf(document.body,snapshot.title,status,{securityWatermark:snapshot.securityWatermark,questionCount:snapshot.questions.length});
  return {dataUrl:await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('PDF 파일 읽기 실패'));reader.readAsDataURL(file.blob);}),pages:file.pageCount};
 },
 fragmenter(question,index,settings,article,measure){const {figures}=snapshotQuestion(question,index,settings);for(const f of figures){const actual=[...article.querySelectorAll('img')].find(img=>img.dataset.exportPath===f.path);if(actual)f.node=actual;}return questionFragmenter({question:{...question,modernMinimal:article.classList.contains('modern-question')},figures,article,measure,workspacePx:article.querySelector('.modern-workspace')?.getBoundingClientRect().height??Number(article.dataset.workspacePx||0)});},
 renderQuestions(snapshot){const form=snapshot.paperForm||snapshot.settings?.paperForm;const settings={...snapshot.settings,paperForm:form};const starts=modern.sectionStarts(snapshot.questions,snapshot.questions.map(q=>q.responseType??q.questionType??q.content?.responseType));const old=[...document.querySelectorAll('.question')];snapshot.questions.forEach((q,i)=>{const article=snapshotQuestion(q,i,settings).article;if(modern.isModern({paperForm:form})){modernQuestion(article,{number:q.printedNumber||i+1,points:settings.showOriginalPoints===false?null:q.originalPoints,section:starts.has(i),workspaceMm:Number(article.dataset.workspacePx||0)*25.4/96,written:modern.isWritten(q.responseType??q.questionType??q.content?.responseType)});article.dataset.workspacePx='0';article.dataset.breakBefore=q.breakBefore||(starts.has(i)?'column':'');}old[i].replaceWith(article);});},
 scaleFigures(element,settings){scaleQuestionFigures(element,settings?.figureScalePercent,{preserveMeasured:true});},
 withDefaults,
 choices:()=>paperFormCatalog(config,user),
 async prepare(snapshot){const form=snapshot.paperForm||snapshot.settings?.paperForm;if(!hasForm({paperForm:form})){const height=pageContentHeight();return {className:'exam-form-standard',width:180,geometry:{height,firstHeight:height,introHeight:0},header:i=>examPageHeader(node,snapshot.title,i),intro:()=>node('span'),footer:i=>node('span',String(i+1),'page-number')};}const draft={...snapshot,title:snapshot.title,items:snapshot.questions,paperForm:withDefaults(form),rules:{units:snapshot.scope?.curriculum?.selected||snapshot.settings?.units||[]}};const geometry=await measureForm(node,draft);return {className:formClass(draft).trim(),width:modern.isModern(draft)?210-84*25.4/72:166,gapMm:modern.isModern(draft)?38*25.4/72:9,geometry,header:i=>{const head=formHeader(node,draft,i);if(geometry.infoExtra)head.querySelector('.modern-students').style.top=(145*96/72+geometry.infoExtra)+'px';return head;},intro:()=>formIntro(node,draft),footer:(i,total)=>formFooter(node,i,total,draft)};},
 fit:fitFormTitles,
 nativeHeaderFontPt,
 async capture(){const assets=[],pages=await paperFormPages(document.body,assets);return {pages,assets:assets.map(a=>({name:a.name,bytes:Array.from(new Uint8Array(a.bytes))}))};},
 async edit(root,initial){
  const draft={id:crypto.randomUUID(),version:0,title:initial.title,rules:{units:initial.units||[]},items:[],paperForm:withDefaults(initial.form)};
  beginFormEdit({config,user,draft,returnRoute:'desktop'});
  const action=(text,fn)=>{const b=node('button',text);b.onclick=fn;return b;};
  const field=(parent,label,value='',type='text')=>{const wrap=node('label',label),input=node(type==='textarea'?'textarea':'input');input.type=type;input.value=value;wrap.append(input);parent.append(wrap);return input;};
  const message=node('p');document.body.append(message);
  await paperFormSettings({root,config,user,node,action,field,fromExam:true,message:text=>message.textContent=text,navigate:()=>{const working=examSession.read(user.id,'new');parent.postMessage({type:'exam-paper-form-result',paperForm:working.paperForm},location.origin==='null'?'*':location.origin);}});
 }
};
if(document.documentElement.dataset.formEditor==='true')window.addEventListener('message',event=>{if(event.source!==parent||event.data?.type!=='exam-paper-form-open')return;window.ExamPaperForm.edit(document.getElementById('view'),event.data);});
