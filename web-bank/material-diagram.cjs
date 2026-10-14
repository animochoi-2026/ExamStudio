'use strict';
// An unchanged image-coordinate observation is redundant when the complete
// observed geometry already lies inside a successfully loaded source material.
// Never suppress authored/redrawn geometry or ambiguous multi-crop sources.
function containsObservedDiagram(problem,question,crop){
 const observed=question.observedDiagram;
 if(question.kind!=='original'||question.diagram||question.diagramMode==='source'||question.layoutDocument||!observed||problem.cropPaths?.length!==1||crop?.ref!==problem.cropPaths[0])return false;
 if(question.sourceVersion!==problem.recognition?.version||JSON.stringify(observed)!==JSON.stringify(problem.recognition?.observedDiagram)||observed.coordinateSystem!=='image_y_down')return false;
 if(!(problem.recognition?.materials||[]).some(m=>m.regionIndex===0&&JSON.stringify(m.bounds||null)===JSON.stringify(crop.bounds||null)))return false;
 if(!Number.isFinite(crop.width)||!Number.isFinite(crop.height)||crop.width<=0||crop.height<=0||!observed.points?.length)return false;
 const b=crop.bounds||{x:0,y:0,width:1,height:1};
 const points=[...observed.points];
 for(const c of observed.circles||[])points.push({x:c.cx-c.r,y:c.cy-c.r},{x:c.cx+c.r,y:c.cy+c.r});
 for(const l of observed.lines||[])points.push(l.start,l.end);
 for(const r of observed.shadedRegions||[])points.push(...(r.rings||[]).flat());
 for(const l of observed.labels||[]){if(!Number.isFinite(l.x)||!Number.isFinite(l.y))return false;points.push(l);}
 return points.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=b.x*crop.width&&p.x<=(b.x+b.width)*crop.width&&p.y>=b.y*crop.height&&p.y<=(b.y+b.height)*crop.height);
}
module.exports={containsObservedDiagram};
