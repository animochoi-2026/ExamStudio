'use strict';
// Request-only reductions. Stored questions and user-authored rules are never rewritten.
const {directInstructions}=require('./task-intent.js');
const OPTIONAL_FEATURES=['shadedRegions','equalAngleMarks','lines','equalLengthMarks','dimensions','angleLabelOverrides'];
const hints={
 shadedRegions:/색칠|음영|칠한|그림자|shad|colou?r|fill/i,
 equalAngleMarks:/이등분|같은\s*각|각[^.\n]{0,25}(?:같|동일)|bisect|equalAngle/i,
 lines:/직선|연장|접선|수선|평행선|line|tangent/i,
 equalLengthMarks:/빗금|같은\s*(?:길이|변)|(?:길이|변)[^.\n]{0,25}(?:같|동일)|이등변|정삼각|정사각|마름모|중점|반지름|합동|equalLength|midpoint|radius/i,
 dimensions:/치수|점선|안내선|전체\s*길이|길이\s*범위|dimension|length.range/i,
 angleLabelOverrides:/안내선|화살표|바깥|밖으로|leader|override/i
};
function diagramFeatures({problem,request,variant,variants=[],modules=[]}){
 const r=problem.recognition;
 const broad=!r?.confirmed||r.sourceStale||r.rulesStale||r.uncertainties?.length||r.ignoredUncertainties?.length
  ||r.resolvedUncertainties?.length||r.materials?.length||problem.regions?.some(x=>x.role==='context')
  ||!r.observedDiagram||directInstructions(request)||request.includeImages||request.regenerateOf||request.difficultyStep===1
  ||(request.difficulty&&request.difficulty!=='same')
  ||[variant,...variants].filter(Boolean).some(v=>!['numeric_only','mirror_numeric'].includes(v))
  ||modules.some(m=>m.userContent!=null&&m.content!==m.defaultContent&&m.tasks?.includes('generation')&&!['validation.common','solution.guidance'].includes(m.id));
 if(broad)return null; // Open-ended changes/uncertain inputs keep all guidance.
 const d=r.observedDiagram;
 const text=JSON.stringify({body:r.body,givens:r.givens,conditions:r.conditions,marks:r.marks,choices:r.choices,statementBox:r.statementBox,
  extraGuidance:modules.filter(m=>m.userContent!=null&&['validation.common','solution.guidance'].includes(m.id)).map(m=>m.content)});
 return OPTIONAL_FEATURES.filter(k=>(Array.isArray(d[k])?d[k].length:!!d[k])||hints[k].test(text)
  ||(k==='equalLengthMarks'&&d.constraints?.some(c=>['equalLength','midpoint'].includes(c.type))));
}
function withoutDescriptions(value){
 if(Array.isArray(value))return value.map(withoutDescriptions);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>k!=='description').map(([k,v])=>[k,withoutDescriptions(v)]));
 return value;
}
function generationSchema(schema,features){
 if(features===null)return schema;
 const out=structuredClone(schema),diagram=out.properties.items.items.properties.question.properties.diagram.anyOf.find(x=>x.type==='object');
 // Keep the complete structural contract: unexpected but valid geometry must not be
 // rejected just because a keyword/observation failed to predict it.
 for(const k of OPTIONAL_FEATURES)if(!features.includes(k)&&diagram.properties[k])diagram.properties[k]=withoutDescriptions(diagram.properties[k]);
 return out;
}
function numericTemplate(body,values=[]){return String(body||'').replace(/\d+(?:\.\d+)?/g,n=>{values.push(n);return `⟦${values.length}⟧`;});}
function existingQuestions(questions=[],sourceBody=''){
 const old=questions.map(q=>({id:q.id,body:q.body})),groups=new Map();
 for(const [index,q] of questions.entries()){
  const values=[];
  // Preserve signs, operators, quantifiers, inequalities and all wording verbatim.
  // Digit substitution is reversible and is not an AI-generated semantic summary.
  const template=numericTemplate(q.body,values);
  // The marker could be literal source text. Avoid ambiguity rather than decoding it.
  if(/⟦\d+⟧/.test(q.body||''))return{format:'bodies',items:old};
  if(!groups.has(template))groups.set(template,sourceBody&&!/⟦\d+⟧/.test(sourceBody)&&template===numericTemplate(sourceBody)?{templateFrom:'source.body',questions:[]}:{template,questions:[]});
  groups.get(template).questions.push({id:q.id,index:index+1,values});
 }
 const grouped=[...groups.values()];
 // Use compact templates only when they are actually smaller. Never truncate unique conditions.
 // Budget for the decoder instruction/format tag too; a tiny collection stays verbatim.
 return JSON.stringify(grouped).length+400<JSON.stringify(old).length
  ?{format:'numeric_templates',items:grouped}:{format:'bodies',items:old};
}
module.exports={OPTIONAL_FEATURES,diagramFeatures,generationSchema,existingQuestions};
