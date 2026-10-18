'use strict';
const crypto=require('node:crypto'),{schema}=require('./schema.cjs'),{instructions}=require('./prompt.json');
const scorer=require('./scorer.cjs');
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const hash=v=>crypto.createHash('sha256').update(typeof v==='string'?v:JSON.stringify(canonical(v))).digest('hex');
// Layout line breaks do not carry mathematical meaning. Never remove operators.
const normalizeText=s=>String(s||'').normalize('NFC').replace(/\r\n?/g,'\n').replace(/[\s\u00a0]+/g,' ').trim();
const settings=Object.freeze({model:'gpt-6.1-sol',reasoning:{effort:'high'},service_tier:'default',max_output_tokens:12000,store:true});
const promptHash=hash(instructions),specRevision='insight-v1.2-20261018-r1';
const evaluationVersion=hash({specRevision,promptHash,schema,settings,strict_calibration:false,inputAdapter:3});
function scopeDetails(s={}){return Object.fromEntries(['grade','semester','course','domains','units','prerequisites','curriculum','allowed','forbidden','restrictions'].filter(k=>s[k]!=null).map(k=>[k,s[k]]));}
function input({question,scope,scopeContext={},restrictions=[],images=[],target=null}){
 if(!scope||typeof scope!=='string')throw Error('문항의 실제 교과 수준이 필요합니다.');
 const permitted={body:normalizeText(question?.body),choices:(question?.choices||[]).map(normalizeText),statementBox:(question?.statementBox||[]).map(v=>typeof v==='string'?normalizeText(v):v),diagram:question?.diagram||question?.observedDiagram||null};
 if(!permitted.body&&!images.length)throw Error('평가 원문이 없습니다.');
 for(const i of images){if(!/^[a-f0-9]{64}$/.test(i.sha256))throw Error('원문 이미지 내용 해시가 필요합니다.');if(i.dataUrl){const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(i.dataUrl);if(!match||crypto.createHash('sha256').update(Buffer.from(match[2],'base64')).digest('hex')!==i.sha256)throw Error('원문 이미지 해시 불일치');}}
 const payload={question:permitted,curriculum_scope:normalizeText(scope),scope_context:scopeDetails(scopeContext),solution_restrictions:restrictions.map(normalizeText).sort(),...(target?{target_question:target}: {})};
 // Paths, signed URLs and catalog/review/teacher scores never enter the fingerprint.
 const contentHash=hash({payload,images:images.map(i=>i.sha256)});
 return {payload,contentHash,inputVersion:hash({contentHash,evaluationVersion}),images,versions:{spec_version:'1.2',spec_revision:specRevision,prompt_hash:promptHash,evaluation_version:evaluationVersion,scorer_version:scorer.version}};
}
function request(prepared){return {...settings,instructions,input:[{role:'user',content:[{type:'input_text',text:JSON.stringify(prepared.payload)},...prepared.images.map(i=>{if(!i.dataUrl?.startsWith('data:image/'))throw Error('실물 이미지 바이트를 준비하세요.');return {type:'input_image',image_url:i.dataUrl,detail:'high'};})]}],text:{format:{type:'json_schema',name:'difficulty_v12',strict:true,schema}}};}
module.exports={canonical,hash,normalizeText,scopeDetails,settings,promptHash,specRevision,evaluationVersion,input,request,instructions};
