'use strict';
const {withoutSourceNumber}=require('./question-text.cjs');
function printedNumber(q,p){
 if(q.kind==='variant')return q.originalNumber??null;
 const r=p.recognition||{};
 let value=q.originalNumber??r.originalNumber??r.sourceQuestionNumber;
 if(!value){const body=r.body||q.body||'',rest=withoutSourceNumber(body);if(body!==rest)value=body.slice(0,body.length-rest.length);}
 if(value===null||value===undefined||!String(value).trim())return null;
 return String(value).trim().replace(/^문제\s*/,'').replace(/^\[\s*(\d+)\s*\]$/,'$1').replace(/\s*번[.)．:]?$/,'').replace(/^(\d+)\)$/,'$1').replace(/[.．:]$/,'').trim();
}
function position(p){const r=p.regions?.find(r=>r.role!=='context')||{};return {page:r.page||null,x:r.x??null,y:r.y??null,sourceLocalId:r.sourceId||'primary'};}
function comparePosition(a,b){return (a.page??1e9)-(b.page??1e9)||((a.x??0)<.45?0:1)-((b.x??0)<.45?0:1)||(a.y??0)-(b.y??0)||(a.x??0)-(b.x??0);}
function compareSource(a,b){const x=a.metadata?.source||{},y=b.metadata?.source||{};
 const group=String(x.documentId||a.sourceId||'').localeCompare(String(y.documentId||b.sourceId||''));if(group)return group;
 const page=(x.position?.page??0)-(y.position?.page??0);if(page)return page;
 // Use printed numbers within a page, including row-major layouts. Missing
 // numbers get one deterministic position-based key, not a pairwise heuristic.
 const key=s=>{const text=String(s.originalNumber||s.originalOrder||1000000000),m=text.match(/^([^\d]*)(\d+)(.*)$/);return m?[m[1].trim(),Number(m[2]),m[3]]:[text,1000000000,''];};
 const [xp,xn,xs]=key(x),[yp,yn,ys]=key(y);const order=Number(!!xp)-Number(!!yp)||xp.localeCompare(yp,'ko')||xn-yn||xs.localeCompare(ys,'ko',{numeric:true});if(order)return order;
 return comparePosition(x.position||{},y.position||{})||(x.originalOrder??1e9)-(y.originalOrder??1e9);
}
function sourceDetails(project,p,q,sourceId){const pos=position(p),ordered=project.problems.filter(x=>position(x).sourceLocalId===pos.sourceLocalId).slice().sort((a,b)=>comparePosition(position(a),position(b)));return {originalNumber:printedNumber(q,p),numbering:require('./source-inventory.cjs').normalize(p.recognition?.sourceNumbering),documentId:sourceId,position:pos,workOrder:project.problems.findIndex(x=>x.id===p.id)+1,originalOrder:ordered.findIndex(x=>x.id===p.id)+1};}
module.exports={printedNumber,position,compareSource,sourceDetails};
