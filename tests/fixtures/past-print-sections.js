import {renderPastPrint} from '../../web-bank/past-print-render.js';
import {questionContent} from '../../web-bank/print-question.js';
const node=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;n.className=cls;return n;};
window.checkSections=async()=>{
 const root=document.querySelector('main'),calls={load:0,render:0};
 const draft={title:'출력 종류 검증',rules:{units:['m2-8.7']},pastPrint:{from:2025,to:2025,schoolNames:['검증중']},answerMode:'detailed',items:Array.from({length:24},(_,index)=>({questionId:'q'+index,revisionId:'r'+index,index,originalNumber:String(index+1),sourceId:'source',year:2025} ))};
 const data=id=>({catalog:{metadata:{source:{school:'검증중',academicYear:2025,grade:'중2'}}},question:{body:`문항 ${id}. $x+1=2$`,answer:'1',solution:`${id}의 상세 풀이: $x=1$입니다.`}});
 const reader={load:async id=>{calls.load++;return data(id);},render:async id=>{calls.render++;const r=data(id);return {...r,element:questionContent(r.question,[]),figures:[]};}};
 const run=section=>renderPastPrint({draft,root,node,reader,rpc:async()=>[],config:{spaceId:'test'},section});
 const summary=r=>({questions:r.questions.children.length,answers:r.answers.children.length,text:r.answers.textContent,questionText:r.questions.textContent,timings:r.timings});
 const both=summary(await run('all'));calls.load=0;calls.render=0;
 const answer=summary(await run('answers')),answerCalls={...calls};calls.load=0;calls.render=0;
 const question=summary(await run('questions')),questionCalls={...calls};
 draft.items[0].solutionSnapshot='저장한 수정 풀이';const override=summary(await run('answers'));
 return {both,answer,question,override,answerCalls,questionCalls,stages:root.querySelectorAll('.past-print-stage').length};
};
