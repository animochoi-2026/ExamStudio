'use strict';
const sharp=require('sharp');
const {createHash}=require('node:crypto');
function materialId(m,p){return 'material-'+createHash('sha256').update(JSON.stringify([p.cropPaths?.[m.regionIndex]?.replace(/\\/g,'/').split('/').pop(),m.bounds||null,m.label||''])).digest('hex').slice(0,20);}
function materialsFor(p){return [...(p.recognition?.materials||[]),...(p.regions||[]).flatMap((r,i)=>r.role==='context'?[{label:'공통 자료',text:'',regionIndex:i,bounds:null}]:[])];}
function validateMaterials(materials,p){
 for(const m of materials||[]){if(!Number.isInteger(m.regionIndex)||m.regionIndex<0||m.regionIndex>=(p.cropPaths||[]).length)throw Error('공통 자료가 참조하는 원본 이미지가 없습니다.');const b=m.bounds;if(b&&(![b.x,b.y,b.width,b.height].every(Number.isFinite)||b.x<0||b.y<0||b.width<=0||b.height<=0||b.x+b.width>1.001||b.y+b.height>1.001))throw Error('공통 자료의 이미지 범위가 올바르지 않습니다.');}
}
async function materialImages(p,hidden=[]){
 const result=[];
 for(const m of materialsFor(p)){
  if(hidden.includes(materialId(m,p)))continue;
  if(!Number.isInteger(m.regionIndex)||!p.cropPaths?.[m.regionIndex])continue;
  let image=sharp(p.cropPaths[m.regionIndex]);
  if(m.bounds){const b=m.bounds;if(![b.x,b.y,b.width,b.height].every(Number.isFinite)||b.x<0||b.y<0||b.width<=0||b.height<=0||b.x+b.width>1.001||b.y+b.height>1.001)throw Error('공통 자료의 이미지 범위가 올바르지 않습니다.');
   const meta=await image.metadata(),left=Math.min(meta.width-1,Math.round(b.x*meta.width)),top=Math.min(meta.height-1,Math.round(b.y*meta.height));
   image=image.extract({left,top,width:Math.min(meta.width-left,Math.max(1,Math.round(b.width*meta.width))),height:Math.min(meta.height-top,Math.max(1,Math.round(b.height*meta.height)))});
  }
  result.push({id:materialId(m,p),label:m.label,text:m.text,dataUrl:'data:image/png;base64,'+(await image.png().toBuffer()).toString('base64')});
 }
 return result;
}
async function sourceFigureImage(q){
 if(q.diagramMode!=='source')return null;
 if(!q.sourceFigure?.path||!q.sourceFigure.bounds)throw Error('원본 그림 영역을 다시 지정하세요.');
 const p={cropPaths:[q.sourceFigure.path],recognition:{materials:[{label:'원본 그림',regionIndex:0,bounds:q.sourceFigure.bounds}]}};
 validateMaterials(p.recognition.materials,p);
 return (await materialImages(p))[0].dataUrl;
}
async function questionImages(p,q){
 const images=q.kind==='original'?await materialImages(p,q.hiddenFigureIds||[]):[];
 for(const f of q.sourceFigures||[])if(!q.hiddenFigureIds?.includes(f.id))images.push({id:f.id,label:f.label||'원본 그림',dataUrl:await sourceFigureImage({diagramMode:'source',sourceFigure:f})});
 return images.filter(m=>!q.hiddenFigureIds?.includes(m.id));
}
function questionOnlyCurrent(q,p){return !!(q.questionOnlyExport&&q.questionOnlyExport.version===(q.version||1)&&q.questionOnlyExport.sourceVersion===(p.recognition?.version||null)&&q.questionOnlyExport.sourceKey===JSON.stringify(p.cropPaths||[]));}
module.exports={materialsFor,materialImages,materialId,questionOnlyCurrent,validateMaterials,sourceFigureImage,questionImages};
