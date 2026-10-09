'use strict';
// Resolve already authorized export assets locally. Preserve measured sizes
// supplied by web snapshots instead of redrawing/capping the same figure.
const fs=require('node:fs'),path=require('node:path'),geometry=require('./geometry.cjs'),structure=require('./structured-layout.js');
function printAssets(q,settings={}){
 const result=[],seen=new Set(),sizes=settings.figureSizePt||{};
 const fileData=file=>{const bytes=fs.readFileSync(file),ext=path.extname(file).toLowerCase();return 'data:'+(ext==='.svg'?'image/svg+xml':ext==='.jpg'||ext==='.jpeg'?'image/jpeg':ext==='.webp'?'image/webp':'image/png')+';base64,'+bytes.toString('base64');};
 const add=(id,file,data,extra={})=>{if(q.hiddenFigureIds?.includes(id)||seen.has(id))return;seen.add(id);result.push({id,dataUrl:file?fileData(file):data,sizePt:file?sizes[file]:null,path:file,...extra});};
 if(structure.status(q).active){
  for(const n of q.layoutDocument.nodes.filter(n=>n.origin==='printed'&&n.type==='figure')){
   const file=q.structureFigurePaths?.[n.id]||(n.figureId==='diagram'?q.diagramPath:q.materialPaths?.[(q.materialIds||[]).indexOf(n.figureId)]);
   if(q.hiddenFigureIds?.includes(n.figureId))continue;
   const data=q.structureFigureImages?.[n.id]||(n.diagram?'data:image/svg+xml;base64,'+Buffer.from(geometry.diagramSvg(n.diagram,structure.diagramOptions(q,n))).toString('base64'):n.figureId==='diagram'?q.sourceFigureDataUrl:q.materialImages?.find(m=>m.id===n.figureId)?.dataUrl);
   if(!file&&!data)throw Error('구조화 문항 그림이 없습니다: '+n.id);
   add(n.figureId||n.id,file,data,{measureStructureId:n.id,structureId:n.diagram?n.id:null});
  }
 }else{
  if(q.diagramPath)add('diagram',q.diagramPath);
  else if(q.diagramMode==='source'){if(!q.sourceFigureDataUrl&&!q.hiddenFigureIds?.includes('diagram'))throw Error('원본 그림 이미지가 없습니다.');add('diagram',null,q.sourceFigureDataUrl);}
  else{const d=geometry.questionDiagram(q);if(d)add('diagram',null,'data:image/svg+xml;base64,'+Buffer.from(geometry.diagramSvg(d)).toString('base64'));}
  (q.materialPaths||[]).forEach((file,i)=>add(q.materialIds?.[i]||'material-'+i,file));
  (q.materialImages||[]).forEach((m,i)=>add(m.id||'material-'+i,null,m.dataUrl));
 }
 return result;
}
module.exports={printAssets};
