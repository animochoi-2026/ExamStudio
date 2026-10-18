'use strict';
const fs=require('node:fs'),path=require('node:path');
const I=require('../difficulty-v12/input.cjs'),V=require('./schema.cjs'),S=require('./scorer.cjs'),{policy}=require('./policy.cjs');
const id='difficulty-v1.2.1',instructions=fs.readFileSync(path.join(__dirname,'prompt.md'),'utf8').replace(/\r\n/g,'\n');
const promptHash=I.hash(instructions),schemaHash=I.hash(V.schema);
const scorerCodeHash=I.hash([fs.readFileSync(path.join(__dirname,'scorer.cjs'),'utf8').replace(/\r\n/g,'\n'),fs.readFileSync(path.join(__dirname,'../difficulty-v12/scorer.cjs'),'utf8').replace(/\r\n/g,'\n')]);
const normalizerVersion='v121-normalizer-1',anchorSetVersion='middle-v121-1';
const version=I.hash({specRevision:policy.specRevision,policy,promptHash,schemaHash,scorerCodeHash,normalizerVersion,anchorSetVersion,
 validationCodeHash:I.hash([fs.readFileSync(path.join(__dirname,'schema.cjs'),'utf8'),fs.readFileSync(path.join(__dirname,'answer.cjs'),'utf8')].map(s=>s.replace(/\r\n/g,'\n')))});
function inputIdentity(entry){
 return I.hash({version,questionId:entry.questionId,revisionId:entry.revisionId,questionContentHash:entry.input.contentHash,
  imageAssetHash:I.hash(entry.input.images.map(i=>i.sha256).sort()),validationAnswerHash:I.hash(entry.validationContext.storedAnswer)});
}
module.exports={id,instructions,promptHash,schemaHash,scorerCodeHash,normalizerVersion,anchorSetVersion,version,scorerVersion:S.version,schema:V.schema,evaluate:V.evaluate,inputIdentity};
