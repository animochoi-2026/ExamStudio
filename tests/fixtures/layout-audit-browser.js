import {membershipPage,memberListPopup,pendingPopup,resetRequestNotices} from '../../web-bank/membership-ui.js';
import {paperFormSettings} from '../../web-bank/paper-form-settings.js';
import {publicHome} from '../../web-bank/public-home.js';
import {leaveEdits,setEditGuard} from '../../web-bank/edit-guard.js';
const root=document.querySelector('main');
const node=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;n.className=cls;return n;};
const action=(text,fn)=>{const b=node('button',text);b.onclick=async()=>{try{await fn();}catch(e){window.errors.push(e.message);}};return b;};
const field=(parent,text,value='',type='text')=>{const label=node('label',text),input=node(type==='textarea'?'textarea':'input');input.type=type;input.value=value;label.append(input);parent.append(label);return input;};
window.errors=[];window.requestReads=0;
const request={kind:'signup',userId:'fixture-request',email:'teacher@example.invalid',createdAt:'2026-10-12T00:00:00Z'};
const rpc=async(name)=>{
 if(name==='bank_signup_list'){window.requestReads++;if(window.failRequest&&window.requestReads>1)throw Error('시험용 조회 실패');return window.hasRequest?[request]:[];}
 if(name==='bank_members_manage')return Array.from({length:8},(_,i)=>({userId:'fixture-'+i,email:'teacher-'+i+'@example.invalid',role:'teacher',enabled:true,roleVersion:1}));
 if(name==='bank_public_summary')return {asOf:'2026-10-12T00:00:00Z',dashboard:{questions:120,sourceExams:6,schools:3,pending:2,difficulty:{counts:{low:30,middle:60,high:30,unknown:0},killerCount:10,total:120}},recentSources:[]};
 throw Error('Unexpected mutation or RPC: '+name);
};
const ctx={root,node,action,field,rpc,config:{spaceId:'layout-fixture'},user:{id:'layout-fixture'},member:{role:'owner'},clear:title=>{root.replaceChildren(node('h2',title));return root;},message:t=>window.errors.push(t),navigate:()=>{}};
window.openPage=async kind=>{setEditGuard(null);root.replaceChildren();if(kind==='members')await membershipPage(ctx);if(kind==='forms')await paperFormSettings(ctx);if(kind==='public')await publicHome(ctx);};
window.openMembers=()=>memberListPopup(ctx);
window.openPending=async()=>{window.hasRequest=true;return pendingPopup(ctx);};
window.resetNotices=()=>{resetRequestNotices();window.requestReads=0;};
window.openGuard=()=>{setEditGuard({dirty:()=>true,save:async()=>false});return leaveEdits();};
await openPage(new URLSearchParams(location.search).get('kind')||'members');window.ready=true;
