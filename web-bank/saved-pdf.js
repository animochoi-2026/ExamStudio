import security from '../app/download-security.cjs';
import {imagePdfCache} from './image-pdf-cache.js';
import {prepareImagePdf} from './image-pdf.js';
import {createQuestionReader} from './question-renderer.js';
import {examEditor,blobDownload} from './exam-editor.js';
import {renderPastPrint} from './past-print-render.js';
import {pdfOutputChoice} from './pdf-output-choice.js';
import {outputLifetime} from './output-lifetime.js';

export async function savedPdfDownload(ctx,{server,variant,part='questions',answerMode='quick',draft:override,status,signal,force=false,publish=file=>file}){
 const {config,rpc,node,root}=ctx,kind=variant?'mock':'exam',draft=structuredClone(override||variant?.paper||server.document),requestId=crypto.randomUUID();
 // The answer format is an output option, not a mutation of the saved paper.
 draft.answerMode=answerMode;
 const job={kind,paperId:server.id,version:server.version,variant:variant?.id||'',part,answerMode,requestId,document:draft,force};
 return security.officialDownload({rpc,spaceId:config.spaceId,requestId,format:'pdf',revisions:draft.items.map(i=>i.revisionId),kind,paperId:server.id,publish,
  generate:identity=>imagePdfCache(ctx).obtain({job,name:draft.title,status,signal,prepare:()=>prepareDraftPdf(ctx,draft,status,identity,part,signal)})});
}
export async function prepareDraftPdf(ctx,draft,status,identity,part,signal){
   const {root,node,rpc,config}=ctx;
   const stage=node('div','','native-pdf-stage');stage.style.cssText='position:fixed;left:-20000px;top:0;width:1200px';root.append(stage);
   const lifetime=outputLifetime(status.pdfSignal||signal,1200000),reader=createQuestionReader(ctx.client,config,{signal:lifetime.signal});let handle;
   try{
    if(draft.kind==='past-paper-print'){
     const result=await lifetime.wait(renderPastPrint({draft,root:stage,node,reader,rpc,config,section:part,progress:text=>{if(lifetime.current())status.textContent=text;}}));
     const pages=node('div');if(part!=='answers')pages.append(...result.questions.children);if(part!=='questions')pages.append(...result.answers.children);
     stage.append(pages);const input=await lifetime.wait(prepareImagePdf(pages,draft.title,status,{securityWatermark:identity,questionCount:draft.items.length,section:part,answerWatermarks:part==='answers'}));input.timings={...result.timings,...input.timings};return input;
    }
    // The screen-loading task has already ended. This output owns a fresh
    // lifetime and must not replace the visible editor's handle or callbacks.
    await lifetime.wait(examEditor({...ctx,outputSection:part,root:stage,reader,examId:'new',chosen:[],server:null,sourceExam:null,initialLoad:{isValid:lifetime.current,awaitPending:lifetime.wait,onProgress:(text,n,total)=>{if(lifetime.current())status.textContent=text+(total?` (${n}/${total})`:'');}},setOutputHandle:undefined,downloadFocus:false,rows:ctx.rows||(()=>[]),save:()=>{},embedded:{draft,onChange:()=>{},setHandle:h=>handle=h}}));
    if(!handle?.ready())throw Error(handle?.layoutStatus?.()||'PDF 배치를 완료하지 못했습니다. 편집 화면에서 확인하세요.');
    return await lifetime.wait(handle.preparePdf(status,{securityWatermark:identity,section:part,answerWatermarks:part==='answers'}));
   }finally{lifetime.close();stage.remove();reader.clear();}
}

export async function savedPdfPanel(ctx,server,{mock=false}={}){
 const {root,node,action,navigate}=ctx;root.append(node('h3',server.title),node('p','내용과 출력 설정이 같으면 저장된 최신 PDF를 바로 받습니다.','hint'));
 const panel=node('section','','panel exam-output-controls'),status=node('p','','hint');let busy=false,controller;
 const field=(title,values)=>{const label=node('label',title),select=node('select');select.setAttribute('aria-label',title);for(const [value,text]of values){const option=node('option',text);option.value=value;select.append(option);}label.append(select);panel.append(label);return select;};
 const variants=mock?server.document.variants.filter(v=>v.paper):[];
 const variant=mock?field('시험지 유형',variants.map(v=>[v.id,v.label])):null;
 const selectedDraft=()=>variants.find(v=>v.id===variant?.value)?.paper||server.document;
 const outputChoice=pdfOutputChoice({node,draft:selectedDraft(),defaultPart:'questions'});panel.append(outputChoice.label);
 if(variant)variant.onchange=()=>outputChoice.setDraft(selectedDraft());
 const buttons=node('div','','actions');panel.append(buttons,status);root.append(panel);
 async function download(open,force=false){if(busy)return;busy=true;controller=new AbortController();const windowRef=open?window.open('about:blank','_blank'):null;for(const control of panel.querySelectorAll('button,select'))control.disabled=control!==cancel;cancel.hidden=false;
  try{
   const file=await savedPdfDownload(ctx,{server,variant:variants.find(v=>v.id===variant?.value),...outputChoice.get(),status,signal:controller.signal,force});
   if(open&&windowRef){const url=URL.createObjectURL(file.blob);windowRef.location=url;setTimeout(()=>URL.revokeObjectURL(url),600000);}else{if(open&&!windowRef)status.textContent='새 창이 차단되어 PDF를 다운로드합니다.';blobDownload(file.name,file.blob);}
   status.textContent=(file.cached?'저장된 최신 PDF 사용':'최신 PDF 생성·저장 완료')+(open?' · 열린 PDF에서 인쇄하세요.':'');
  }catch(error){windowRef?.close();status.textContent=controller.signal.aborted?'PDF 요청을 취소했습니다. 다시 요청할 수 있습니다.':'PDF 처리 실패: '+error.message+' 다시 시도할 수 있습니다.';}
  finally{busy=false;cancel.hidden=true;for(const control of panel.querySelectorAll('button,select'))control.disabled=false;}
 }
 const cancel=action('취소',()=>{if(confirm('PDF 생성을 취소할까요? 기존 저장 파일은 유지됩니다.'))controller?.abort();});cancel.hidden=true;
 buttons.append(action('PDF 다운로드',()=>download(false),true),action('PDF 열기·인쇄',()=>download(true)),action('이미지 PDF 다시 생성',()=>download(false,true)),action('미리보기·편집 열기',()=>navigate((mock?'mock-exams/':'exam/')+server.id)),cancel);
}
