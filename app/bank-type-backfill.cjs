'use strict';
const T=require('./bank-question-types.cjs');
const copy=structuredClone;
function snapshot(row){return copy({metadata:row.metadata,content:row.content,confirmed:row.confirmed||{},files:row.files||[]});}
function checkCurrent(item,current,revision){if(!current||current.question_id!==item.questionId||current.revision_id!==item.baseId||!revision?.committed||revision.id!==item.baseId||revision.review_version!==item.reviewVersion||T.hash(snapshot(current))!==T.hash(item.expected))throw Error('수정 충돌: 계획 이후 본문·확정값·메타데이터·파일이 변경되었습니다. 새 계획에서 비교하세요.');if(T.effective(current).length)throw Error('수정 충돌: 출제유형이 이미 추천·확정되었습니다.');}
function stripTypeChanges(metadata){const m=copy(metadata);if(m.classification){delete m.classification.types;delete m.classification.typeRecommendation;if(m.classification.suggested)delete m.classification.suggested.types;}
 // Creating suggested only to hold types is an allowed minimal extension.
 if(m.classification&&(!m.classification.suggested||Object.keys(m.classification.suggested).length===0))delete m.classification.suggested;
 delete m.processing;return m;}
function assertPreserved(before,after){if(T.hash(stripTypeChanges(before))!==T.hash(stripTypeChanges(after)))throw Error('출제유형 외 메타데이터가 변경되어 반영을 중단했습니다.');}
function plan(rows,revisions,taxonomy=[]){const items=[],unresolved=[],preserved=[];for(const row of rows){const result=T.infer(row,taxonomy);if(result.status==='preserved'){preserved.push(row.question_id);continue;}if(result.status!=='suggested'){unresolved.push({questionId:row.question_id,reason:result.reason});continue;}const rev=revisions.find(v=>v.id===row.revision_id);if(!rev?.committed)throw Error('현재 완료 버전 확인 실패: '+row.question_id);const heads=revisions.filter(v=>v.question_id===row.question_id&&v.committed&&!revisions.some(c=>c.committed&&c.parent_id===v.id));if(heads.length!==1||heads[0].id!==row.revision_id)throw Error('현재 버전 충돌: '+row.question_id);items.push({questionId:row.question_id,baseId:row.revision_id,reviewVersion:rev.review_version,expected:snapshot(row),recommendation:result,status:'pending'});}
 const sample=[];for(const i of items){if(sample.some(s=>s.recommendation.types[0].id===i.recommendation.types[0].id))continue;sample.push(i);if(sample.length===3)break;}
 return {version:1,ruleVersion:T.version,createdAt:new Date().toISOString(),total:rows.length,items,unresolved,preserved,sampleIds:sample.map(i=>i.questionId),aiRequestsMax:0,aiCalls:0};}
module.exports={snapshot,checkCurrent,stripTypeChanges,assertPreserved,plan};
