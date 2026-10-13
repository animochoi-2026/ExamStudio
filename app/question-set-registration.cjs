'use strict';
const sets=require('./question-sets.cjs'),crypto=require('crypto');
function plans(bank,projectId){
 const project=bank.store.get(projectId),groups=new Map();
 for(const p of project.problems){const proposal=sets.proposal(p),q=p.original;if(!proposal||!q)continue;const item=bank.ensure(project,p,q),key=item.sourceId+':'+proposal.originalNumbers.join(',');
  if(!groups.has(key))groups.set(key,{key,sourceId:item.sourceId,title:item.metadata.source.materialTitle||project.title,numbers:proposal.originalNumbers,problemId:p.id,questionId:q.id,nodes:structuredClone(q.layoutDocument?.nodes||[]),evidence:proposal.evidence});
 }for(const plan of groups.values())plan.questionIds=project.problems.flatMap(p=>[p.original,...(p.variants||[])].filter(Boolean).filter(q=>{const i=bank.ensure(project,p,q);return i.sourceId===plan.sourceId&&plan.numbers.includes(String(i.metadata.source.originalNumber));}).map(q=>q.id));return [...groups.values()];
}
async function save(bank,{projectId,key,numbers,nodeIds}){
 const plan=plans(bank,projectId).find(x=>x.key===key);if(!plan)throw Error('세트 인식 자료가 바뀌었습니다. 등록 화면을 다시 여세요.');
 if(!Array.isArray(numbers)||numbers.length<2||numbers.some(x=>!/^\d{1,3}$/.test(x))||new Set(numbers).size!==numbers.length)throw Error('서로 다른 원본 문항 번호를 순서대로 지정하세요.');
 const nodes=plan.nodes.filter(n=>nodeIds?.includes(n.id));if(!nodes.length)throw Error('공통 조건·도형을 선택하세요.');
 if(nodes.some(n=>n.type==='figure'&&!n.diagram))throw Error('이미지에 포함된 원본 번호를 훼손하지 않도록 공통 도형의 출력 구조를 먼저 확인해 주세요.');
 require('./structured-layout.js').validate({version:1,features:['interleavedFlow','multipleFigures'],nodes});
 const project=bank.store.get(projectId),output={};
 for(const p of project.problems){if(!p.original)continue;const item=bank.ensure(project,p,p.original);if(item.sourceId!==plan.sourceId||!numbers.includes(String(item.metadata.source.originalNumber)))continue;
  output[String(item.metadata.source.originalNumber)]={commonNodeIds:(p.original.layoutDocument?.nodes||[]).filter(n=>nodes.some(c=>c.id===n.id&&JSON.stringify(c)===JSON.stringify(n))).map(n=>n.id),commonFigureIds:require('./source-materials.cjs').materialsFor(p).filter(m=>sets.detect(m.label+' '+m.text)).map(m=>require('./source-materials.cjs').materialId(m,p))};
 }
 const registry=await bank.storage.rpc('bank_question_sets_get',{s:bank.auth.config().spaceId}),old=registry.find(g=>g.source_document===plan.sourceId&&g.original_numbers.some(n=>numbers.includes(n)));
 const result=await bank.storage.rpc('bank_question_set_save',{s:bank.auth.config().spaceId,set_id:old?.id||crypto.randomUUID(),expected:old?.version||0,source_document:plan.sourceId,numbers,common_data:{nodes,evidence:plan.evidence},output_data:output});
 bank.save();return result;
}
async function requireConfirmed(bank,projectId,questionIds,{deferReview=false}={}){
 const pending=[];
 const project=bank.store.get(projectId),proposals=plans(bank,projectId);if(!proposals.some(p=>p.questionIds.some(id=>questionIds.includes(id))))return;const registry=await bank.storage.rpc('bank_question_sets_get',{s:bank.auth.config().spaceId});
 // Pending sets with no uploaded member are returned to their creator, too.
 for(const plan of proposals){
  if(!plan.questionIds.some(id=>questionIds.includes(id)))continue;
  if(!registry.some(g=>g.source_document===plan.sourceId&&g.original_numbers.includes(String(bank.ensure(project,project.problems.find(p=>p.id===plan.problemId),project.problems.find(p=>p.id===plan.problemId).original).metadata.source.originalNumber)))){if(deferReview&&project.queueSource)pending.push(plan);else throw Error('공통 자료 세트를 확인·저장한 뒤 업로드하세요. 세트 확인 화면에서 원본 번호와 공통 조건·도형을 선택할 수 있습니다.');}
 }
 return pending;
}
function deferMetadata(item,plans){
 const plan=(plans||[]).find(p=>p.questionIds.includes(item.questionId));if(!plan)return;
 item.metadata.reviews.questionSet={status:'pending',evidence:plan.evidence,originalNumbers:plan.numbers,message:'공통 자료와 짝 문항을 웹에서 검수해야 합니다.'};
 item.metadata.relations.questionSet={id:'pending:'+plan.key,source_document:plan.sourceId,original_numbers:plan.numbers,complete:false,members:[],reviewStatus:'pending'};
}
module.exports={plans,save,requireConfirmed,deferMetadata};
