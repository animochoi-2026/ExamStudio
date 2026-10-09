'use strict';
const FONTS=['맑은 고딕','바탕','돋움'];
function documentStyle(settings={}){
 const size=Number(settings.bodyFontSize),noteSize=Number(settings.solutionFontSize);
 const bodyFont=FONTS.includes(settings.bodyFont)?settings.bodyFont:FONTS[0];
 // Web exam inputs accept 7~15pt; retain 16~18pt for existing saved documents.
 return {bodyFont,bodyFontSize:Number.isFinite(size)&&size>=7&&size<=18?Math.round(size*2)/2:12,
  solutionFont:FONTS.includes(settings.solutionFont)?settings.solutionFont:bodyFont,
  solutionFontSize:Number.isFinite(noteSize)&&noteSize>=9&&noteSize<=18?Math.round(noteSize*2)/2:9};
}
module.exports={FONTS,documentStyle};
