'use strict';
// A form travels inside the exam document. Local catalogs only supply choices;
// they must never overwrite the form embedded in an existing exam.
const builtin = template => ({id:'builtin:'+template,version:1,name:template==='mock'?'실전모의고사 폼':'기본폼',template});
function catalog(saved=[],legacy=null){
 const forms=[builtin('standard'),builtin('mock')];
 for(const form of saved)if(form && ['standard','mock'].includes(form.template) && form.id && !forms.some(f=>f.id===form.id))forms.push(structuredClone(form));
 if(legacy && !forms.some(f=>f.id===legacy.id))forms.push({...structuredClone(legacy),id:legacy.id||'saved:legacy',name:legacy.name||'저장한 폼',version:legacy.version||1});
 return forms;
}
function selectedId(form,forms){
 if(form?.id&&forms.some(f=>f.id===form.id))return form.id;
 return null;
}
function saveForm(forms,form,id){
 const customId=form.id && !form.id.startsWith('builtin:')?form.id:id;
 const prior=forms.find(f=>f.id===customId);
 const saved={...structuredClone(form),id:customId,version:(prior?.version||0)+1,name:form.name&&!form.id?.startsWith('builtin:')?form.name:'저장한 '+(form.template==='mock'?'실전모의고사 폼':'기본폼')};
 return {saved,forms:[...forms.filter(f=>!f.id.startsWith('builtin:')&&f.id!==customId),saved]};
}
module.exports={builtin,catalog,selectedId,saveForm};
