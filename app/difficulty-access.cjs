'use strict';
const assert=require('./rubric-assert.cjs');const version='fixed-learner-access-v2';
const bases=Object.freeze({S0:2,S1:4.5,S2:5.5,S3:7,S4:8.3,S5:9,S6:9.5}),reasoning=Object.freeze({R0:0,R1:0.2,R2:0.4,R3:0.5});
const obj=p=>({type:'object',properties:p,required:Object.keys(p),additionalProperties:false}),str={type:'string'},bool={type:'boolean'},enu=v=>({type:'string',enum:v}),arr=items=>({type:'array',items});
const itemSchema=obj({status:enu(['estimated','deferred']),answer:str,solutionSummary:str,scopeCheck:str,
 baselineCertificate:obj({rule:enu(['B0','B1','B2','insufficient']),originalObjectsOnly:bool,sameRepresentation:bool,evidence:str}),
 mainDiscovery:str,selectionCue:str,justification:str,missingGuidance:str,accessLevel:enu(Object.keys(bases)),levelRationale:str,lowerLevelCheck:str,
 remainingAfterHint:obj({hint:str,remaining:str,independentStructuralTransfer:bool,evidence:str}),easiestAlternative:str,reasoningLevel:enu(Object.keys(reasoning)),residualReasoning:str,limitations:arr(str)});
const schema=obj({items:arr(itemSchema)});
function conform(v,s,at='$'){if(s.type==='object'){assert.ok(v&&typeof v==='object'&&!Array.isArray(v),at);assert.deepEqual(Object.keys(v).sort(),s.required.slice().sort());for(const[k,x]of Object.entries(s.properties))conform(v[k],x,at+'.'+k);}else if(s.type==='array'){assert.ok(Array.isArray(v));v.forEach((x,i)=>conform(x,s.items,at+'['+i+']'));}else{assert.equal(typeof v,s.type,at);if(s.enum)assert.ok(s.enum.includes(v));}}
function score(x){conform(x,itemSchema);if(x.status==='deferred')return {version,status:'deferred',score:null,band:null,killer:null};for(const k of ['answer','solutionSummary','scopeCheck','mainDiscovery','selectionCue','justification','missingGuidance','levelRationale','lowerLevelCheck','residualReasoning'])assert.ok(x[k].trim(),'missing '+k);
 const b=x.baselineCertificate;if(['S0','S1','S2'].includes(x.accessLevel)){assert.equal(b.rule,{S0:'B0',S1:'B1',S2:'B2'}[x.accessLevel]);assert.equal(b.originalObjectsOnly,true,'low category includes new auxiliary');assert.equal(b.sameRepresentation,true,'low category includes new representation');assert.ok(b.evidence.trim());}else assert.equal(b.rule,'insufficient');
 if(x.accessLevel==='S6'){assert.equal(x.remainingAfterHint.independentStructuralTransfer,true);assert.ok(x.remainingAfterHint.remaining.trim()&&x.remainingAfterHint.evidence.trim());}
 const base=bases[x.accessLevel],delta=reasoning[x.reasoningLevel],n=Math.round(Math.min(10,base+delta)*10)/10;return {version,status:'estimated',accessLevel:x.accessLevel,reasoningLevel:x.reasoningLevel,base,reasoningDelta:delta,score:n,band:n<=3?'low':n<8?'middle':'high',killer:n>=9,killerColor:n>=9?'#FF1493':null};}
function validateBatch(v){conform(v,schema);assert.equal(v.items.length,9);assert.deepEqual(v.items.map(x=>x.id).sort(),'ABCDEFGHI'.split(''));return v.items.map(x=>({id:x.id,...score(x)}));}
module.exports={version,bases,reasoning,itemSchema,score};
