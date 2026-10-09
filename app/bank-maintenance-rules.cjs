 'use strict';
const crypto=require('node:crypto');
const registry=[
 {id:'types',version:require('./bank-question-types.cjs').version,title:'저장 본문으로 누락 출제유형 추천',fields:['classification.types','classification.suggested.types','classification.typeRecommendation'],ai:false},
 {id:'source',version:'source-evidence-1',title:'출처·원문 번호 연결',fields:['source'],ai:false},
 {id:'analysis',version:'expected-10-v3-solution-assumed',title:'소단원·난이도 추천',fields:['classification.suggested','difficulty.aiScore','analysis'],ai:true},
 {id:'calibration',version:require('./bank-calibration.cjs').version,title:'채택 평가로 난이도 보정',fields:['difficulty.calibration','difficulty.calibratedScore'],ai:false},
 {id:'render',version:'native-preview-1',title:'기존 도형·문항으로 DOCX·미리보기 재생성',fields:['docx','preview'],ai:false},
 {id:'integrity',version:'sha256-native-1',title:'원본·도형 파일 무결성 확인',fields:['processing.integrity'],ai:false}
];
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(canonical(x))).digest('hex');
function input(rule,row,ratings=[]){const m=row.metadata||{},d=m.difficulty||{};switch(rule){
 case 'types':return require('./bank-question-types.cjs').fingerprint(row);
 case 'source':return hash([row.content,m.source]);
 case 'analysis':return hash([row.content,m.analysis?.basis,m.analysis?.model,m.classification?.taxonomyVersion,d.scope]);
 case 'calibration':return hash([d.aiScore,d.userScore,row.confirmed?.difficulty,m.analysis?.model,d.criteriaVersion,m.source?.grade,d.scope,m.content?.responseType,ratings]);
 case 'render':return hash([row.content,(row.files||[]).filter(f=>['asset','source'].includes(f.role)).map(f=>[f.sha256,f.role]),m.source?.originalNumber]);
 default:return hash((row.files||[]).filter(f=>['source','asset','attachment'].includes(f.role)).map(f=>[f.role,f.sha256]));
}}
function needed(rule,row,ratings){if(rule.id==='types')return !require('./question-types.cjs').effective(row).length;const stamp=row.metadata?.processing?.rules?.[rule.id];return !stamp||stamp.nativeInput!==row.metadata?.processing?.nativeInput||stamp.version!==rule.version||stamp.input!==input(rule.id,row,ratings);}
function diff(a,b,p=''){const out=[];for(const key of new Set([...Object.keys(a||{}),...Object.keys(b||{})])){const x=a?.[key],y=b?.[key],name=p?p+'.'+key:key;if(JSON.stringify(x)===JSON.stringify(y))continue;if(x&&y&&typeof x==='object'&&typeof y==='object'&&!Array.isArray(x)&&!Array.isArray(y))out.push(...diff(x,y,name));else out.push({field:name,before:x??null,after:y??null});}return out;}
function recoverSource(metadata,project,problem,question){const m=structuredClone(metadata),evidence=[],unresolved=[];m.source||={};const src=project.sources?.find(s=>s.id===(problem.regions?.find(r=>r.role!=='context')?.sourceId||'primary'))||project.source;
 const inferred=require('./bank-source-info.cjs').inferSourceInfo(src?.name||''),candidate={...inferred,originalNumber:require('./bank-source-order.cjs').printedNumber(question,problem),originalPoints:question.originalPoints??problem.recognition?.points??null};
 for(const k of ['school','region','academicYear','grade','semester','exam','originalNumber','originalPoints'])if((m.source[k]==null||m.source[k]==='')&&candidate[k]!=null&&candidate[k]!==''){m.source[k]=candidate[k];evidence.push({field:'source.'+k,basis:k.startsWith('original')?'보존된 원문 인식 기록':'원본 파일명',value:candidate[k]});}
 for(const k of ['school','academicYear','originalNumber'])if(!m.source[k])unresolved.push({field:'source.'+k,reason:'보존 자료에 확인 가능한 근거 없음'});
 return{metadata:m,evidence,unresolved};}
function nativeInput(pack){const p=pack.native.problems[0],q=[p.original,...p.variants].find(q=>q?.id===pack.targetId),question=structuredClone(q);if(question.questionOnlyExport)delete question.questionOnlyExport.sourceKey;return hash([question,p.regions,p.recognition,pack.native.settings,pack.native.scope,pack.refs.map(f=>[f.role,f.sha256])]);}
module.exports={registry,input,needed,diff,recoverSource,hash,nativeInput};
