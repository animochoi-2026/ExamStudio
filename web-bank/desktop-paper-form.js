// The desktop print window and form editor use the web form components.
// The native questions and project save flow stay in the desktop application.
import {formHeader,formIntro,formFooter,measureForm,fitFormTitles,nativeHeaderFontPt} from './exam-form.js';
import {paperFormPages} from './paper-form-export.js';
import {paperFormCatalog,paperFormSettings,beginFormEdit} from './paper-form-settings.js';
import {examPageHeader,pageContentHeight} from './standard-form.js';
import {defaultLogo} from './exam-form-logo.js';
import {examSession} from './exam-session.js';
import {snapshotQuestion} from './snapshot-question.js';
import {questionFragmenter} from './question-fragments.js';
import {scaleQuestionFigures} from './figure-scale.js';
const node=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;n.className=cls;return n;};
const config={spaceId:'desktop'},user={id:'local'};
const withDefaults=form=>({logo:defaultLogo,minutes:45,...structuredClone(form)});
window.ExamPaperForm={
 fragmenter(question,index,settings,article,measure){const {figures}=snapshotQuestion(question,index,settings);for(const f of figures){const actual=[...article.querySelectorAll('img')].find(img=>img.dataset.exportPath===f.path);if(actual)f.node=actual;}return questionFragmenter({question,figures,article,measure,workspacePx:Number(article.dataset.workspacePx||0)});},
 renderQuestions(snapshot){const old=[...document.querySelectorAll('.question')];snapshot.questions.forEach((q,i)=>old[i].replaceWith(snapshotQuestion(q,i,snapshot.settings).article));},
 scaleFigures(element,settings){scaleQuestionFigures(element,settings?.figureScalePercent,{preserveMeasured:true});},
 withDefaults,
 choices:()=>paperFormCatalog(config,user),
 async prepare(snapshot){const form=snapshot.paperForm||snapshot.settings?.paperForm;if(form?.template!=='mock'){const height=pageContentHeight();return {className:'exam-form-standard',width:180,geometry:{height,firstHeight:height,introHeight:0},header:i=>examPageHeader(node,snapshot.title,i),intro:()=>node('span'),footer:i=>node('span',String(i+1),'page-number')};}const draft={title:snapshot.title,paperForm:withDefaults(form),rules:{units:snapshot.scope?.curriculum?.selected||snapshot.settings?.units||[]}};return {className:'exam-form-mock',width:166,geometry:await measureForm(node,draft),header:i=>formHeader(node,draft,i),intro:()=>formIntro(node,draft),footer:(i,total)=>formFooter(node,i,total)};},
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
