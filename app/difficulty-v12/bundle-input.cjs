'use strict';
const crypto=require('node:crypto'),I=require('./input.cjs');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function image(bytes){const b=Buffer.from(bytes);if(b[0]===137&&b.toString('ascii',1,4)==='PNG')return 'image/png';if(b[0]===255&&b[1]===216)return 'image/jpeg';if(b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP')return 'image/webp';throw Error('평가 원본 이미지 형식 확인 필요');}
async function fromNative(catalog,bundle,read){
 if(bundle.questionId!==catalog.question_id||bundle.revisionId!==catalog.revision_id)throw Error('원문 버전 불일치');
 const native=bundle.native,p=native?.project?.problems?.find(p=>[p.original,...(p.variants||[])].some(q=>q?.id===native.targetQuestionId)),q=[p?.original,...(p?.variants||[])].find(q=>q?.id===native?.targetQuestionId);if(!q)throw Error('평가 대상 원문 없음');
 const refs=[...(p.cropPaths||[])];if(q.sourceFigure?.path)refs.push(q.sourceFigure.path);for(const f of q.sourceFigures||[])if(f.path)refs.push(f.path);
 const keys=[...new Set(refs.filter(v=>v.startsWith('bank-asset:')).map(v=>v.slice(11)))];
 if(refs.some(v=>!v.startsWith('bank-asset:')))throw Error('서버에 연결된 원본 이미지 확인 필요');
 const images=[];for(const key of keys){const f=catalog.files.find(f=>f.key===key&&f.role==='asset');if(!f)throw Error('원본 참조 파일 누락');const bytes=await read(f);if(bytes.length!==f.size||digest(bytes)!==f.sha256)throw Error('평가 이미지 무결성 오류');images.push({sha256:f.sha256,fileId:f.id,dataUrl:'data:'+image(bytes)+';base64,'+Buffer.from(bytes).toString('base64')});}
 const scope=native.project.scope||catalog.metadata?.difficulty?.scope||{},restrictions=[scope.restrictions,...(scope.forbidden||[]),...(scope.curriculum?.extraForbidden||[])].filter(Boolean);
 return I.input({question:q,scope:scope.grade||catalog.metadata?.source?.grade,scopeContext:scope,restrictions,images});
}
module.exports={fromNative,digest,image};
