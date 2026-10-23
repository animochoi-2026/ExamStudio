import {formLoader} from '../../web-bank/paper-form-settings.js';
import model from '../../web-bank/exam-form-model.cjs';
const node=(tag,text='',cls='')=>{const el=document.createElement(tag);el.textContent=text;el.className=cls;return el;};
const config={spaceId:'branding-fixture'},user={id:'branding-user'},key=model.profileKey(config.spaceId,user.id);
window.checkBranding=async({current,saved,select=['builtin:modern-minimal']})=>{
 localStorage.clear();if(saved)localStorage.setItem(key+':saved-form',JSON.stringify(saved));
 const draft={paperForm:structuredClone(current)},controls=node('div');document.body.replaceChildren(controls);
 const errors=[];formLoader({controls,getDraft:()=>draft,node,action:(text,fn)=>{const b=node('button',text);b.onclick=fn;return b;},persist(){},render:async()=>{},message:e=>errors.push(e),config,user,edit(){}});
 for(const id of select){const picker=controls.querySelector('select');picker.value=id;await picker.onchange();}
 return {form:draft.paperForm,errors};
};
window.ready=true;
