'use strict';
// Store timing metadata only. No question IDs, content, account or credentials.
class Estimate{
 constructor({now=()=>Date.now(),history=[]}={}){this.now=now;this.history=history;this.started=now();this.phase=null;}
 update(key,completed=null,total=null,work=1){if(this.phase?.key!==key){this.phase={key,start:this.now(),completed,total,work};}else Object.assign(this.phase,{completed,total,work});return this.read();}
 read(){const p=this.phase,elapsed=(this.now()-this.started)/1000;if(!p)return {elapsed};const spent=(this.now()-p.start)/1000;let rates=[],basis='';if(p.completed>0&&p.total>p.completed&&spent>0){rates=[spent/p.completed];basis='현재 처리 속도';}else{rates=this.history.filter(x=>x.key===p.key&&x.work>0&&x.seconds>0&&Math.max(x.work,p.work)/Math.min(x.work,p.work)<=2).slice(-8).map(x=>x.seconds/x.work);basis='비슷한 작업의 완료 기록 '+rates.length+'회';}
 if(!rates.length)return {elapsed,phaseElapsed:spent};const remaining=p.completed>0&&p.total>p.completed?rates[0]*(p.total-p.completed):rates.reduce((a,b)=>a+b,0)/rates.length*p.work-spent;const expected=Math.max(...rates)*p.work*1.5,delayed=remaining<=0||(!p.completed&&spent>expected);return {elapsed,phaseElapsed:spent,low:Math.max(0,remaining*.65),high:Math.max(1,remaining*1.6),basis,delayed};}
 complete(){const p=this.phase;if(p)this.history.push({key:p.key,work:p.work,seconds:(this.now()-p.start)/1000});this.history=this.history.slice(-40);this.phase=null;return this.history;}
}
function format(s){const elapsed='경과 '+Math.floor(s.elapsed)+'초';if(s.delayed)return elapsed+' · 이전 처리 속도보다 지연 중 · 현재 작업을 계속 확인하고 있습니다.';if(s.low==null)return elapsed+' · 예상 시간 계산 중';return elapsed+' · 현재 단계 예상 남은 시간 '+Math.ceil(s.low)+'~'+Math.ceil(s.high)+'초 (추정 · '+s.basis+')';}
module.exports={Estimate,format};
