// Print-only figure scaling; existing measured/manual dimensions win.
export function figureScalePercent(value){const number=Number(value==null||value===''?80:value);return Number.isFinite(number)?Math.max(50,Math.min(150,number)):80;}
export function scaleQuestionFigures(element,percent,{preserveMeasured=false}={}){
 const ratio=figureScalePercent(percent)/100;
 for(const image of element.querySelectorAll('img')){
  if(preserveMeasured&&image.dataset.printMeasured==='true')continue;
  const base=image.getBoundingClientRect(),available=image.parentElement.getBoundingClientRect().width,fit=Math.min(ratio,available/Math.max(1,base.width));
  image.dataset.figureScalePercent=String(figureScalePercent(percent));
  if(ratio===1)continue;
  image.style.width=(base.width*fit)+'px';image.style.height=(base.height*fit)+'px';image.style.maxHeight='none';image.style.objectFit='contain';
 }
}
