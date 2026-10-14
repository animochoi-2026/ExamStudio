import {mockExams} from '../../web-bank/mock-exams.js';
import {createQuestionReader} from '../../web-bank/question-renderer.js';
import M from '../../web-bank/mock-exam-model.cjs';
import katex from 'katex';
window.katex=katex;
const data=await(await fetch('/fixture')).json(),root=document.getElementById('view');
const node=(t,text='',cls='')=>{const n=document.createElement(t);n.textContent=text;n.className=cls;return n;};
const action=(text,fn)=>{const b=node('button',text);b.onclick=()=>Promise.resolve(fn()).catch(e=>document.getElementById('status').textContent=e.message);return b;};
const field=(p,text,value='',type='text')=>{const l=node('label',text),i=node('input');i.type=type;i.value=value??'';l.append(i);p.append(l);return i;};
const client={from:table=>({select:()=>({eq:(_,id)=>({single:async()=>({data:table==='bank_catalog'?data.catalogs.find(c=>c.revision_id===id):data.entries.find(e=>e.id===id)})})})}),storage:{from:()=>({download:async key=>({data:await(await fetch('/file/'+key.split('/')[1])).blob()})})},rpc:()=>({abortSignal:async()=>({data:data.sets})})};
const doc=M.create(crypto.randomUUID());doc.title='세트 화면 검증';doc.schools=['검증중'];doc.autoTitle=false;doc.version=1;
for(const [index,order]of data.orders.entries()){M.addVariant(doc,'A',crypto.randomUUID());const v=doc.variants.at(-1);v.units=['m2-8.7'];v.paper={id:crypto.randomUUID(),version:1,title:v.label,answerMode:'quick',paperForm:{template:'mock',scoreNote:''},rules:{units:v.units,schools:doc.schools},items:order.map(n=>({questionId:data.catalogs[n].question_id,revisionId:data.catalogs[n].revision_id,responseType:'선택형',originalPoints:4,workspaceMm:8}))};}
window.registryReads=0;window.failRegistry=false;window.delayRegistry=0;
const rpc=async name=>{if(name==='bank_mock_get')return {id:doc.id,version:1,document:structuredClone(doc)};if(name==='bank_question_sets_get'){window.registryReads++;if(window.delayRegistry)await new Promise(r=>setTimeout(r,window.delayRegistry));if(window.failRegistry)throw Error('검증용 연결 실패');return structuredClone(data.sets);}if(name==='bank_mock_schools')return doc.schools;if(['bank_mock_check','bank_source_exams','bank_search_current','bank_paper_forms'].includes(name))return [];throw Error('Unexpected RPC '+name);};
await mockExams({root,node,action,field,rpc,reader:createQuestionReader(client,{spaceId:data.space}),config:{spaceId:data.space,grade:'중2'},user:{id:data.user},mockId:doc.id,navigate:()=>{},message:()=>{},rows:async()=>[],save:()=>{}});
window.ready=true;
