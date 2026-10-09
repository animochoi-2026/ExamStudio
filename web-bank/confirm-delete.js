export function confirmDelete({node,title,description,exam=false}){return new Promise(resolve=>{
 const heading=exam?'시험지를 삭제하시겠습니까?':'영구 삭제 확인';
 const d=node('dialog','','delete-confirmation');d.setAttribute('aria-label',heading);
 d.append(node('h2',heading),node('strong',title),node('p',description));if(!exam)d.append(node('p','복구할 수 없습니다.','error'));
 const finish=value=>{d.close();d.remove();resolve(value);};
 for(const [label,value]of [['취소',false],[exam?'삭제':'영구 삭제',true]]){const b=node('button',label,value?'danger':'');b.type='button';b.onclick=()=>finish(value);d.append(b);}
 d.oncancel=e=>{e.preventDefault();finish(false);};document.body.append(d);d.showModal();d.querySelector('button').focus();
});}
