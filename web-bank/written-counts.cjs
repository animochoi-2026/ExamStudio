'use strict';
// Normalize old settings, never existing paper items. Preserve unequal legacy
// point allocations until the user deliberately edits the unified settings.
function normalize(input={}){
 const c=structuredClone(input),short=c.short??0,written=c.written??0;
 if(!Number.isInteger(short)||short<0||!Number.isInteger(written)||written<0)throw Error('서술형 문항 수는 0 이상의 정수여야 합니다.');
 if(short){
  const a={count:short,points:c.shortPoints??4},b={count:written,points:c.writtenPoints??6};
  c.written=short+written;
  c.writtenPoints=written?b.points:a.points;
  if(written&&a.points!==b.points)c.writtenPointGroups=[a,b];
 }else c.written=written;
 delete c.short;delete c.shortPoints;
 return c;
}
function groups(input){const c=normalize(input),g=c.writtenPointGroups;
 return Array.isArray(g)&&g.every(x=>Number.isInteger(x.count)&&x.count>=0&&Number.isFinite(x.points)&&x.points>=0)&&g.reduce((n,x)=>n+x.count,0)===c.written?g:[{count:c.written,points:c.writtenPoints??4}];
}
function points(input,index){for(const g of groups(input)){if(index<g.count)return g.points;index-=g.count;}throw Error('서술형 배점 구성을 확인하세요.');}
module.exports={normalize,groups,points};
