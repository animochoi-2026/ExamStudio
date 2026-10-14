'use strict';
const sets=require('./question-sets.cjs'),layout=require('./structured-layout.js');
// Recognition evidence is structural metadata, never a teacher approval.
function validate(recognition){
 const s=recognition.setContext;if(!s)return null;
 const proposal=sets.detect(s.evidence),numbers=proposal?.originalNumbers;
 if(!numbers||JSON.stringify(numbers)!==JSON.stringify(s.originalNumbers)||!numbers.includes(String(recognition.originalNumber))||s.uncertain)throw Error('세트의 인쇄 번호 범위와 현재 원문 번호를 확인하세요.');
 const all=recognition.layoutDocument?.nodes||[],ids=new Set(s.commonNodeIds),nodes=all.filter(n=>ids.has(n.id));
 if(!ids.size||nodes.length!==ids.size||nodes.some(n=>n.origin!=='printed'||n.inlines.some(i=>i.origin!=='printed')))throw Error('세트 공통 자료의 인쇄 구조가 불명확합니다.');
 layout.validate({version:1,features:['interleavedFlow','multipleFigures'],nodes});
 if(all.some(n=>ids.has(n.parentId)&&!ids.has(n.id)))throw Error('세트 공통 상자에 속한 일부 자료가 누락됐습니다.');
 if(!all.some(n=>!ids.has(n.id)&&['paragraph','proofStep'].includes(n.type)&&n.inlines.some(i=>i.text.trim())))throw Error('세트의 개별 발문을 공통 자료와 분리해 주세요.');
 if(nodes.some(n=>n.type==='figure'&&!n.diagram&&(!n.figureId||!s.commonFigureIds.includes(n.figureId))))throw Error('세트 공통 이미지 참조를 확인하세요.');
 if(s.commonFigureIds.some(id=>!['diagram','observedDiagram'].includes(id)&&!id.startsWith('material-')))throw Error('세트 공통 그림 참조를 확인하세요.');
 return {numbers,nodes,output:{commonNodeIds:[...ids],commonFigureIds:[...s.commonFigureIds]},evidence:s.evidence};
}
function normalize(recognition){
 if(!recognition.setContext)return recognition;
 try{validate(recognition);recognition.setContextReview='structured';}
 catch(e){recognition.setContextReview='pending';recognition.uncertainties.push({text:'[세트 확인 필요] '+e.message,kind:'reading',location:{regionIndex:null,description:'공통 자료'}});}
 return recognition;
}
function prepare(project,plan,ensure){
 const members=plan.numbers.map(number=>project.problems.filter(p=>p.original&&(()=>{const i=ensure(p);return i.sourceId===plan.sourceId&&String(i.metadata.source.originalNumber)===number;})()));
 if(members.some(xs=>xs.length!==1))return null;
 const verified=[];try{for(const [index,[p]] of members.entries()){const v=validate(p.recognition||{});if(!v||JSON.stringify(v.numbers)!==JSON.stringify(plan.numbers)||String(p.recognition.originalNumber)!==plan.numbers[index])return null;verified.push(v);}}catch{return null;}
 const text=v=>v.nodes.flatMap(n=>(n.inlines||[]).map(i=>i.kind+':'+i.text.replace(/\s+/g,''))).join('|');if(verified.some(v=>text(v)!==text(verified[0])))return null;
 for(const [index,[p]] of members.entries()){const ids=new Set(p.original.layoutDocument?.nodes?.map(n=>n.id)||[]);if(verified[index].output.commonNodeIds.some(id=>!ids.has(id)))return null;}
 return {nodes:verified[0].nodes,evidence:verified[0].evidence,output:Object.fromEntries(verified.map((v,i)=>[plan.numbers[i],v.output]))};
}
module.exports={validate,normalize,prepare};
