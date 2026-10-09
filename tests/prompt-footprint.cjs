'use strict';
// Static character/schema sizes only. This is not an AI latency or token benchmark.
const fs=require('node:fs'),path=require('node:path');
const {INSTRUCTIONS,OUTPUT_SCHEMA}=require('../app/codex.cjs');
const {DEFAULT_PROMPTS,composePrompt}=require('../app/prompts.cjs');
const {RulesStore,compose,DEFAULT_SCOPE}=require('../app/rules.cjs');
const {schemas}=require('../app/task-schemas.cjs');
const modules=new RulesStore(fs.mkdtempSync(path.join(__dirname,'../data/validation/footprint-'))).snapshot().modules;
const legacy=INSTRUCTIONS+'\n\n'+composePrompt(DEFAULT_PROMPTS.common,'geometry',DEFAULT_PROMPTS.parts.geometry);
const scenarios={};
for(const task of ['recognition','generation','revision','validation']){
 const result=compose({task,domains:['geometry'],variant:task==='generation'?'numeric_only':'',scope:DEFAULT_SCOPE,modules});
 scenarios[task]={selectedModules:result.modules.map(m=>m.id),ruleCharacters:result.instructions.length,scopeCharacters:result.scopeText.length,schemaCharacters:JSON.stringify(schemas[task]).length};
}
const report={mode:'static program composition, not model calls; UTF-16 character counts, not token estimates',legacy:{oneInstructionCopyCharacters:legacy.length,schemaCharacters:JSON.stringify(OUTPUT_SCHEMA).length,recognitionRequestCharacters:DEFAULT_PROMPTS.recognition.length,classificationBeforeRecognition:true},current:scenarios,actualInputTokens:null,actualOutputTokens:null,actualCachedTokens:null,aiLatencyBeforeMs:null,aiLatencyAfterMs:null,accuracyComparison:null};
fs.writeFileSync(path.join(__dirname,'artifacts/prompt-footprint.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
