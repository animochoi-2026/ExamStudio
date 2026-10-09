import './paper-form-runtime.js';
export function installPaperForms({getProject,saveProject,openDialog,guarded,showPreview}){
 const select=document.getElementById('paperFormSetting'),edit=document.getElementById('editPaperForm');
 const refresh=blocked=>{const project=getProject(),form=project?.settings?.paperForm||{id:'builtin:standard',template:'standard'},choices=window.ExamPaperForm.choices();if(!choices.some(f=>f.id===form.id))choices.push({...form,id:form.id||'embedded',name:form.name||'현재 시험지의 폼'});select.replaceChildren();for(const f of choices){const option=document.createElement('option');option.value=f.id;option.textContent=f.name;select.append(option);}select.value=form.id||'embedded';select.disabled=edit.disabled=!project||blocked;};
 select.addEventListener('change',guarded(async()=>{const project=getProject(),form=window.ExamPaperForm.choices().find(f=>f.id===select.value);if(!project||!form)return;project.settings.paperForm=window.ExamPaperForm.withDefaults(form);await saveProject();if(project.problems.some(p=>[p.original,...(p.variants||[])].some(q=>q?.include)))await showPreview();}));
 edit.addEventListener('click',guarded(async()=>{
  const project=getProject();if(!project)return;const projectId=project.id,root=openDialog('시험지 폼 수정','현재 선택한 폼','preview-modal'),frame=document.createElement('iframe');
  frame.title='시험지 폼 수정';frame.style.cssText='border:0;width:100%;height:70vh';frame.src=new URL('./paper-form-editor.html',import.meta.url).href;root.append(frame);
  frame.onload=()=>frame.contentWindow.postMessage({type:'exam-paper-form-open',form:project.settings.paperForm||{id:'builtin:standard',template:'standard'},title:project.title,units:project.scope?.curriculum?.selected||[]},'*');
  const changed=async event=>{if(event.source!==frame.contentWindow||event.data?.type!=='exam-paper-form-result')return;window.removeEventListener('message',changed);if(getProject()?.id!==projectId)return;project.settings.paperForm=structuredClone(event.data.paperForm);await saveProject();refresh(false);document.getElementById('mainDialog').close();await showPreview();};
  window.addEventListener('message',changed);document.getElementById('mainDialog').addEventListener('close',()=>window.removeEventListener('message',changed),{once:true});
 }));
 return {refresh};
}
