import model from './past-print-model.cjs';
import layoutModel from '../app/bank-exam-model.cjs';
import {questionArticle} from './print-question.js';
import {questionFragmenter} from './question-fragments.js';
import {examPageHeader,pageContentHeight} from './standard-form.js';
import {isMock,formClass,formHeader,formIntro,formFooter,measureForm,answerHeader,measureAnswer,fitFormTitles} from './exam-form.js';
import formModel from './exam-form-model.cjs';
import {appendSolutionPages} from './solution-flow.js';
import {mathText} from './math-text.js';
import {scaleQuestionFigures} from './figure-scale.js';
import {sourceInfo,formatSourcePoints} from './presentation.js';
import textTools from '../app/question-text.cjs';
export async function renderPastPrint({draft,root,node,reader,rpc,config,progress=()=>{},wait=p=>p,current=()=>root.isConnected}){
 const questions=node('div','','exam-pages past-print-pages'),answers=node('div','','exam-pages'),stage=node('div','','past-print-stage'),measure=node('div','','exam-measure'+(isMock(draft)?' mock-measure':''));
 stage.style.cssText='position:fixed;left:-20000px;top:0;visibility:hidden';stage.append(questions,answers,measure);root.append(stage);
 const loaded=[];try{
  const registry=await wait(rpc('bank_question_sets_get',{s:config.spaceId}));
  const cover=node('section','','exam-page past-print-cover');cover.append(node('h1',draft.title),node('h2','시험범위'),node('p',formModel.scopeLabel(draft.rules.units)),node('h2','연도 범위'),node('p',`${draft.pastPrint.from}~${draft.pastPrint.to}년`),node('h2','학교'),node('p',draft.pastPrint.schoolNames.join(' · ')));questions.append(cover);
  const geom=isMock(draft)?await measureForm(node,draft):{height:pageContentHeight()};
  const headingHeight=38,geometry={...geom,firstHeight:(geom.firstHeight??geom.height)-headingHeight};
  for(const group of model.groups(draft.items)){
   const measured=[],fragmenters=[];
   try{for(const item of group.items){
    if(!current())throw Error('기출프린트 생성을 취소했습니다.');
    const set=registry.find(s=>s.members.some(m=>m.questionId===item.questionId));
    if(set){const start=group.items.findIndex(x=>x.questionId===set.members[0].questionId&&x.sourceId===item.sourceId);if(start<0||set.members.some((m,i)=>group.items[start+i]?.questionId!==m.questionId))throw Error('선택 범위에 세트 일부만 포함되어 있습니다. 시험범위를 확인하세요.');}
    const r=await wait(reader.render(item.revisionId,{printedNumber:item.originalNumber,showOriginalPoints:!!draft.showOriginalPoints,setRegistry:registry,setContext:set?{first:set.members[0].questionId===item.questionId,start:group.items.find(x=>x.questionId===set.members[0].questionId).index+1}:null}));
    if(item.solutionSnapshot)r.question={...r.question,solution:item.solutionSnapshot};
    if(r.element.dataset.incomplete)throw Error(`${item.index+1}번 그림을 불러오지 못했습니다.`);
    const points=sourceInfo(r.catalog).points??textTools.sourcePoints(r.question)??null;
    r.question={...r.question,showOriginalPoints:!!draft.showOriginalPoints,originalPoints:draft.showOriginalPoints&&!r.question.sourceScoresRestored?points:null};
    const q=questionArticle(r.element,{index:item.index,number:String(item.index+1),fontSize:draft.bodyFontSize??10,points:r.question.originalPoints!=null?formatSourcePoints(r.question.originalPoints):null});measure.append(q);await wait(document.fonts.ready);await wait(Promise.all([...q.querySelectorAll('img')].map(x=>x.decode())));scaleQuestionFigures(r.element,draft.figureScalePercent??100);
    const m={...item,questionId:'occurrence-'+item.index,height:q.getBoundingClientRect().height,element:q};
    if(m.height>Math.min(geometry.firstHeight,geometry.height)){m.fragmenter=questionFragmenter({question:r.question,figures:r.figures,article:q,measure,workspacePx:0});fragmenters.push(m.fragmenter);}
    measured.push(m);loaded.push(r);progress('문항·수식·도형 준비',item.index+1,draft.items.length);
   }
   const layout=layoutModel.paginateQuadrants(measured,geometry);if(layout.overflows.length)throw Error('문항이 페이지를 넘습니다. 원문 배치를 확인하세요.');
   for(const [pi,p]of layout.pages.entries()){
    const page=node('section','','exam-page'+formClass(draft));page.dataset.year=group.year;
    page.append(isMock(draft)?formHeader(node,draft,pi):examPageHeader(node,draft.title,pi));
    if(pi===0)page.append(node('h2',model.header(group,loaded[group.items[0].index]?.catalog?.metadata?.source),'past-print-year'));
    const columns=node('div','','exam-columns');columns.style.height=(pi===0?geometry.firstHeight:geometry.height)+'px';
    p.columns.forEach((col,ci)=>{const column=node('div','','exam-column');if(isMock(draft)&&pi===0&&ci===0)column.append(formIntro(node,draft));for(const item of col){item.element.style.cssText+=';position:absolute;left:0;right:0;top:'+item.top+'px;margin-bottom:0';column.append(item.element);}columns.append(column);});page.append(columns,isMock(draft)?formFooter(node,pi,layout.pages.length):node('span',String(questions.children.length),'page-number'));questions.append(page);fitFormTitles(page);
   }
   }finally{fragmenters.forEach(f=>f.dispose());}
  }
  await renderAnswers({draft,loaded,answers,measure,node,current});
  if(!current())throw Error('기출프린트 생성을 취소했습니다.');questions.remove();answers.remove();return {questions,answers,loaded,count:draft.items.length};
 }finally{stage.remove();}
}

async function renderAnswers({draft,loaded,answers,measure,node,current}){
  const answerGeom=await measureAnswer(node,draft.title);
  if(draft.answerMode==='detailed'){
   const ok=await appendSolutionPages({pages:answers,title:draft.title,loaded,items:draft.items.map((x,i)=>({...x,originalNumber:String(i+1)})),node,mathText,height:answerGeom.height,paddingTop:answerGeom.paddingTop,isValid:current,markAnswers:true});if(!ok)throw Error('정답지 생성을 취소했습니다.');
  }else{
   const blocks=[];for(const [i,r]of loaded.entries()){const block=node('article');block.style.fontSize='9pt';block.append(mathText(`${i+1}. ${r.question.answer||'정답 미작성'}`));const marker=node('span','\u200b','answer-watermark');marker.dataset.index=i;block.append(marker);measure.append(block);await document.fonts.ready;blocks.push({questionId:'answer-'+i,height:block.getBoundingClientRect().height,element:block});}
   const layout=layoutModel.paginate(blocks,answerGeom.height,10);if(layout.overflows.length)throw Error('정답이 한 단보다 커서 출력을 중지했습니다.');
   for(const p of layout.pages){const page=node('section','','exam-page answer-page');page.style.paddingTop=answerGeom.paddingTop+'px';page.append(answerHeader(node,draft.title));const cols=node('div','','exam-columns');for(const col of p.columns){const column=node('div','','exam-column');for(const item of col)column.append(item.element);cols.append(column);}page.append(cols);answers.append(page);}
  }
}

// Changing answer mode does not reload or rebuild the already placed questions.
export async function renderPastPrintAnswers({draft,loaded,root,node,current=()=>root.isConnected}){
 const answers=node('div','','exam-pages'),measure=node('div','','exam-measure'),stage=node('div','','past-print-stage');
 stage.style.cssText='position:fixed;left:-20000px;top:0;visibility:hidden';stage.append(answers,measure);root.append(stage);
 try{await renderAnswers({draft,loaded,answers,measure,node,current});if(!current())throw Error('정답지 생성을 취소했습니다.');answers.remove();return answers;}finally{stage.remove();}
}
