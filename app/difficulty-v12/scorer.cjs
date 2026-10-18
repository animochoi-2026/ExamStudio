'use strict';
// Literal port of the approved v1.2 §15. No model-supplied derived values used.
const version='insight-v1.2-scorer-1';
const bands=[[1,2],[2.1,3.8],[3.9,5.8],[5.9,7.7],[7.8,9.4],[9.5,10]];
const cmp=(a,b)=>a<b?-1:a>b?1:0;
const axis=v=>{if(!Number.isInteger(v)||v<0||v>4)throw Error('축과 실행량은 0~4 정수여야 합니다.');return v;};
function move(C,R,B,H){[C,R,B,H].forEach(axis);return C<=1&&R<=1&&B<=1?0:R>=3&&C>=3&&B>=2&&H>=3?5:C+R+B>=8?4:C+R+B>=6?3:C+R+B>=4?2:1;}
const units=d=>8*d.C+7*d.R+5*d.B, severity=d=>(0.40*d.C+0.35*d.R+0.25*d.B)/4;
function graph(discoveries){
 const map=new Map();for(const d of discoveries){if(typeof d.id!=='string'||!d.id||map.has(d.id))throw Error('발견 ID 누락 또는 중복');if(typeof d.is_non_obvious!=='boolean'||!Array.isArray(d.depends_on))throw Error('발견의 의존/비자동 판정 누락');map.set(d.id,{...d,move:move(d.C,d.R,d.B,d.H)});}
 const next=new Map([...map.keys()].map(id=>[id,[]]));
 for(const d of map.values()){if(new Set(d.depends_on).size!==d.depends_on.length)throw Error('중복 의존 ID');for(const id of d.depends_on){if(!map.has(id))throw Error('존재하지 않는 의존 ID');next.get(id).push(d.id);}}
 const seen=new Set(),visiting=new Set();function visit(id){if(visiting.has(id))throw Error('의존 그래프 순환');if(seen.has(id))return;visiting.add(id);for(const n of next.get(id))visit(n);visiting.delete(id);seen.add(id);}for(const id of map.keys())visit(id);
 return {map,next};
}
function chain(g,classes){
 const sum=ids=>ids.reduce((s,id)=>s+units(g.map.get(id)),0);
 const compare=(a,b)=>b.length-a.length||sum(b)-sum(a)||cmp(a.join('\0'),b.join('\0'));
 const memo=new Map();function from(id){if(memo.has(id))return memo.get(id);const tail=g.next.get(id).map(from).sort(compare)[0]||[],d=g.map.get(id),result=classes.includes(d.move)&&d.is_non_obvious?[id,...tail]:tail;memo.set(id,result);return result;}
 return [...g.map.keys()].map(from).sort(compare)[0]||[];
}
function assembly(g){
 const seen=new Set();for(const id of g.map.keys()){if(seen.has(id))continue;let count=0;const queue=[id];while(queue.length){const n=queue.pop();if(seen.has(n))continue;seen.add(n);const d=g.map.get(n);if(d.move>=2&&d.is_non_obvious)count++;queue.push(...g.next.get(n),...d.depends_on);}if(count>=3)return true;}return false;
}
function path(discoveries,literacy=false,extreme=false){
 const ds=discoveries.length?discoveries:[{id:'synthetic_m0',C:0,R:0,B:0,H:0,is_non_obvious:true,depends_on:[]}],g=graph(ds);
 const top=[...g.map.values()].sort((a,b)=>b.move-a.move||severity(b)-severity(a)||cmp(a.id,b.id))[0];
 let base=top.move,trigger='bottleneck',ids=[],avg=null,s=severity(top);
 if(base===5)trigger='single_wall';else{const m4=chain(g,[4]),m3=chain(g,[3,4,5]);ids=m4.length>=2?m4:m3.length>=3?m3:[];if(ids.length){base=5;trigger='dependent_chain';avg=ids.reduce((n,id)=>n+severity(g.map.get(id)),0)/ids.length;s=Math.max(...ids.map(id=>severity(g.map.get(id))));}}
 const promotions=[];let increase=0;if(assembly(g)){promotions.push('assembly');increase++;}if(literacy){promotions.push('literacy');increase+=2;}if(extreme){promotions.push('execution');increase++;}if(trigger==='bottleneck'&&promotions.length)trigger='promoted';
 return {tier:Math.min(5,base+increase),base_tier:'T'+base,promotions,trigger,dominant_s:s,chain_s_avg:avg,chain_ids:ids};
}
// Match Python round(x,1), including exact halfway ties (binary double value).
function round1(x){const bytes=new DataView(new ArrayBuffer(8));bytes.setFloat64(0,x);const bits=bytes.getBigUint64(0),exp=Number((bits>>52n)&2047n)-1023-52;let numerator=((bits&((1n<<52n)-1n))+(1n<<52n))*10n,denominator=1n;if(exp>=0)numerator<<=BigInt(exp);else denominator<<=BigInt(-exp);let n=numerator/denominator;const rest=numerator%denominator;if(rest*2n>denominator||rest*2n===denominator&&n%2n)n++;return Number(n)/10;}
function decimal(t,s,e=0,avg=null){axis(e);const [lo,hi]=bands[t];return round1(t===0?Math.min(2,1+0.6*s+0.1*e):t===5?Math.min(10,9.5+0.4*(avg??s)+(avg===null?0:0.1)):Math.min(hi,Math.max(lo,lo+(hi-lo)*(0.85*s+0.15*(e/4)))));}
function scoreProblem(routes,literacy=false){
 const fail=reason=>({status:'failed',problem_tier:null,score:null,confidence:0,reason});if(!routes.length)return fail('no_routes');const eligible=routes.filter(r=>!r.uses_powerful_tool);if(!eligible.length)return fail('no_eligible_routes');
 const results=eligible.map(r=>{const parts=r.independent_branches?.length?r.independent_branches:[r];const scored=parts.map(p=>{const v=path(p.critical_discoveries||[],literacy,r.execution_extreme||false);return {...v,score:decimal(v.tier,v.dominant_s,p.execution_load??r.execution_load??0,v.chain_s_avg),branch_id:p.branch_id||''};}).sort((a,b)=>b.tier-a.tier||b.score-a.score||cmp(a.branch_id,b.branch_id));return {...scored[0],selected_route_id:r.route_id};}).sort((a,b)=>a.tier-b.tier||a.score-b.score||cmp(a.selected_route_id,b.selected_route_id));
 const {tier,branch_id,...result}=results[0];return {status:'complete',problem_tier:'T'+tier,...result};
}
module.exports={version,bands,axis,move,severity,graph,path,decimal,scoreProblem};
