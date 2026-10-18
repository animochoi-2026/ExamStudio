'use strict';
// Produces reviewable prompts only. No model, DB or deployment call.
const fs=require('node:fs'),path=require('node:path');
const P=require('../app/difficulty-v121/profile.cjs'),C=require('../app/difficulty-v121/policy.cjs'),I=require('../app/difficulty-v12/input.cjs');
function prepare(root=path.resolve(__dirname,'../docs/difficulty-v121')){
 fs.mkdirSync(root,{recursive:true});
 const descriptors=C.stages.map((stage,i)=>{
  const file=`stage-${i+1}-prompt.md`;
  fs.writeFileSync(path.join(root,file),`# ${i+1}단계 프롬프트 검토본\n\n모델: ${stage.model} / 추론: ${stage.effort}\n\n아래 구분선 뒤의 본문만 공통 instructions로 사용합니다. 대상 원문 JSON과 이미지가 별도로 추가되며 저장 정답·과거 점수·이전 단계 결과는 전달하지 않습니다. 공통 JSON Schema: [schema.json](schema.json).\n\nprompt_hash: \`${P.promptHash}\`\n\n---\n\n`+P.instructions);
  return {...stage,promptHash:P.promptHash,file};
 });
 fs.writeFileSync(path.join(root,'schema.json'),JSON.stringify(P.schema,null,2)+'\n');
 const result={specRevision:'1.2.1',promptHash:P.promptHash,schemaHash:P.schemaHash,scorerCodeHash:P.scorerCodeHash,profileVersion:P.version,policy:C.policy,stages:descriptors};
 fs.writeFileSync(path.join(root,'prompt-manifest.json'),JSON.stringify(result,null,2)+'\n');
 // This is NOT an authorization file: granted is deliberately absent.
 return {...result,documentHash:I.hash(result)};
}
if(require.main===module)console.log(JSON.stringify(prepare(),null,2));
module.exports={prepare};
