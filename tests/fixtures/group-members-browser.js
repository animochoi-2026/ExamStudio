import {membershipPage} from '../../web-bank/membership-ui.js';
import {showMemberManager,showInviteWelcome,captureInvitation} from '../../web-bank/invitations.js';
import {profilePopup} from '../../web-bank/member-profile.js';
import {examLibrary} from '../../web-bank/exam-library.js';
const node=(t,s='',c='')=>{const n=document.createElement(t);n.textContent=s;n.className=c;return n;};
window.errors=[];const action=(t,fn)=>{const b=node('button',t);b.onclick=async()=>{b.disabled=true;try{await fn();}catch(e){window.errors.push(e.message);document.querySelector('#message').textContent=e.message;}finally{b.disabled=false;}};return b;};
const field=(p,t,v='',type='text')=>{const l=node('label',t),i=node('input');i.type=type;i.value=v;l.append(i);p.append(l);return i;};
const params=new URLSearchParams(location.search),actor=params.get('actor')||'A',root=document.querySelector('#view'),data=await(await fetch('/identity?actor='+actor)).json();
const rpc=async(name,args={})=>{const res=await fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({actor,name,args})}),value=await res.json();if(!res.ok)throw Object.assign(Error(value.message),value);return value;};
const rows=async(table)=>{const res=await fetch('/rows?actor='+actor);return res.json();};
const ctx={root,node,action,field,rpc,rows,user:data.user,member:data.member,config:{spaceId:data.space},client:{functions:{invoke:()=>{throw Error('No mail provider in fixture');}}},clear:title=>{root.replaceChildren(node('h2',title));return root;},message:t=>document.querySelector('#message').textContent=t,session:async()=>{document.querySelector('#message').textContent='참여 완료';},navigate:async()=>{root.replaceChildren();await open();}};
async function open(){await membershipPage(ctx);root.append(action('회원 초대',()=>showMemberManager(ctx)),action('내 프로필',()=>profilePopup(ctx)));}
if(params.get('page')==='invite'){captureInvitation();showInviteWelcome({...ctx,login:()=>{},logout:()=>{}});}else await open();window.ready=true;
