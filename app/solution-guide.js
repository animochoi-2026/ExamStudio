(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ExamSolutionGuide=api;})(globalThis,function(){
 'use strict';
 const KINDS=['equalLength','equalAngle','rightAngle','perpendicular','parallel','collinear','midpoint','distance','angle','tangent','square','congruence'];
 const LIMITS={bytes:200000,points:80,segments:160,relations:64,steps:24};
 const clone=v=>JSON.parse(JSON.stringify(v));
 const key=(a,b)=>[a,b].sort().join('\u0000');
 function lengthEdges(r){const p=r.points;if(r.kind==='equalLength')return [[p[0],p[1]],[p[2],p[3]]];if(r.kind==='square')return p.map((a,i)=>[a,p[(i+1)%4]]);return [];}
 function lengthGroups(g){
  const parent=new Map(),edges=new Map();const root=k=>{let n=k;while(parent.get(n)!==n)n=parent.get(n);return n;};
  // Merge only edges linked by explicit mathematical relations. Coordinates
  // never create equality groups. Whole-guide ordering keeps each step stable.
  for(const r of g.relations){const pairs=lengthEdges(r),keys=pairs.map(([a,b])=>{const k=key(a,b);if(!parent.has(k)){parent.set(k,k);edges.set(k,[a,b].sort());}return k;});for(const k of keys.slice(1)){const a=root(keys[0]),b=root(k);if(a!==b)parent.set(a<b?b:a,a<b?a:b);}}
  const groups=new Map();for(const [k,pair] of edges){const r=root(k);if(!groups.has(r))groups.set(r,[]);groups.get(r).push({key:k,points:pair});}
  const compare=(a,b)=>a<b?-1:a>b?1:0;return [...groups.values()].map(es=>es.sort((a,b)=>compare(a.key,b.key))).sort((a,b)=>compare(a[0].key,b[0].key)).map((es,i)=>({id:'length-'+(i+1),count:i+1,edges:es}));
 }
 const normalized=s=>String(s||'').replace(/\r\n/g,'\n').trim();
 const coreText=s=>String(s||'').split('\n\n[서술형 채점기준')[0].split('\n\n[참고 코멘트]')[0];
 function plainText(g){return g.steps.map((s,i)=>`${i+1}. ${s.title}\n${s.text}`).join('\n\n');}
 function basis(q){const s=JSON.stringify([q.body||'',q.statementBox||[],q.choices||[],q.answer||'',normalized(coreText(q.solution)),q.diagram||q.observedDiagram||null]);let a=2166136261,b=2246822519;for(let i=0;i<s.length;i++){a=Math.imul(a^s.charCodeAt(i),16777619);b=Math.imul(b^s.charCodeAt(i),3266489917);}return (a>>>0).toString(16)+':'+(b>>>0).toString(16);}
 function list(v,max,label){if(!Array.isArray(v)||v.length>max)throw Error('해설 '+label+' 개수/형식을 확인하세요.');}
 function text(v,max,label){if(typeof v!=='string'||!v.trim()||v.length>max)throw Error('해설 '+label+'를 확인하세요.');}
 function validate(value){
  if(value==null)return null;
  let encoded;try{encoded=JSON.stringify(value);}catch{throw Error('해설 구조가 순환하거나 올바르지 않습니다.');}
  if(!encoded||encoded.length>LIMITS.bytes||new TextEncoder().encode(encoded).byteLength>LIMITS.bytes)throw Error('해설 구조가 너무 큽니다.');
  const g=clone(value);if(g.version!==1)throw Error('지원하지 않는 해설 구조 버전입니다.');
  list(g.steps,LIMITS.steps,'단계');if(!g.steps.length)throw Error('해설 단계가 없습니다.');list(g.relations,LIMITS.relations,'관계');
  const d=g.diagram,points=new Map();
  if(d){
   list(d.points,LIMITS.points,'점');list(d.segments,LIMITS.segments,'선분');
   if(!d.points.length)throw Error('해설 도형의 점이 없습니다.');
   for(const p of d.points){text(p.name,40,'점 이름');if(points.has(p.name)||![p.x,p.y].every(n=>Number.isFinite(n)&&Math.abs(n)<1e6))throw Error('해설 점 이름/좌표가 잘못되었습니다.');points.set(p.name,p);}
   for(const s of d.segments)if(!points.has(s.from)||!points.has(s.to)||s.from===s.to)throw Error('해설 선분이 없는 점을 참조합니다.');
   for(const field of ['circles','angles','labels','constraints','shadedRegions','equalLengthMarks','equalAngleMarks','lines','dimensions'])if(d[field]!=null)list(d[field],160,field);
   if(d.coordinateSystem&&d.coordinateSystem!=='cartesian_y_up')throw Error('해설 제작 도형은 수학 좌표를 사용하세요.');
   for(const c of d.circles||[])if(![c.cx,c.cy,c.r].every(n=>Number.isFinite(n)&&Math.abs(n)<1e6)||c.r<=0)throw Error('해설 원의 중심/반지름을 확인하세요.');
  }
  const seen=new Map(),counts={equalLength:4,equalAngle:6,rightAngle:3,perpendicular:4,parallel:4,midpoint:3,distance:2,angle:3,tangent:3,square:4,congruence:6};
  const point=n=>points.get(n),v=(a,b)=>[b.x-a.x,b.y-a.y],dot=(a,b)=>a[0]*b[0]+a[1]*b[1],norm=v=>Math.hypot(...v),dist=(a,b)=>norm(v(a,b));
  const equal=(a,b)=>Math.abs(a-b)<=Math.max(a,b,1)*1e-3;
  const angle=(a,o,b)=>{const u=v(o,a),w=v(o,b),len=norm(u)*norm(w);if(len<1e-10)throw Error('해설 각의 두 점이 겹칩니다.');return Math.acos(Math.max(-1,Math.min(1,dot(u,w)/len)))*180/Math.PI;};
  const sides=r=>[key(r.points[0],r.points[1]),key(r.points[2],r.points[3])].sort().join('|');
  const angles=r=>[r.points.slice(0,3),r.points.slice(3)].map(a=>a[1]+':'+key(a[0],a[2])).sort().join('|');
  for(const r of g.relations){
   text(r.id,60,'관계 id');text(r.reason,1500,'관계 근거');if(seen.has(r.id)||!KINDS.includes(r.kind)||!['given','derived'].includes(r.origin))throw Error('해설 관계 형식을 확인하세요.');
   list(r.points,12,'관계 점');if(r.points.some(p=>!points.has(p))||r.kind==='collinear'&&r.points.length<3||r.kind!=='collinear'&&r.points.length!==counts[r.kind])throw Error('해설 관계가 없는 점을 참조하거나 대응 점 수가 잘못되었습니다.');
   list(r.dependsOn,8,'선행 근거');if(r.dependsOn.some(id=>!seen.has(id)))throw Error('해설 관계 근거는 앞 단계의 관계를 참조해야 합니다.');
   if(r.origin==='derived'&&r.kind!=='congruence'&&!r.dependsOn.length)throw Error('유도한 해설 관계의 선행 근거가 없습니다.');
   const p=r.points.map(point),length=(a,b)=>dist(p[a],p[b]);let ok=true;
   if(['equalLength','parallel','perpendicular'].includes(r.kind)){const u=v(p[0],p[1]),w=v(p[2],p[3]),len=norm(u)*norm(w);if(len<1e-10)ok=false;else if(r.kind==='equalLength')ok=equal(norm(u),norm(w));else ok=Math.abs(r.kind==='perpendicular'?dot(u,w):u[0]*w[1]-u[1]*w[0])/len<1e-3;}
   if(r.kind==='equalAngle')ok=Math.abs(angle(...p.slice(0,3))-angle(...p.slice(3)))<.15;
   if(r.kind==='rightAngle'||r.kind==='tangent')ok=Math.abs(angle(...p)-90)<.15;
   if(r.kind==='angle')ok=Number.isFinite(r.value)&&Math.abs(angle(...p)-r.value)<.15;
   if(r.kind==='distance')ok=Number.isFinite(r.value)&&r.value>0&&equal(length(0,1),r.value);
   if(r.kind==='midpoint')ok=dist(p[0],{x:(p[1].x+p[2].x)/2,y:(p[1].y+p[2].y)/2})<Math.max(length(1,2),1)*1e-3;
   if(r.kind==='collinear'){const u=v(p[0],p[1]);ok=norm(u)>1e-8&&new Set(r.points).size===p.length&&p.slice(2).every(x=>Math.abs(u[0]*(x.y-p[0].y)-u[1]*(x.x-p[0].x))/norm(u)<Math.max(norm(u),1)*1e-3);}
   if(r.kind==='tangent')ok=ok&&(d.circles||[]).some(c=>equal(dist(p[0],{x:c.cx,y:c.cy}),0)&&equal(length(0,1),c.r));
   if(r.kind==='square')ok=new Set(r.points).size===4&&[0,1,2,3].every(i=>equal(length(i,(i+1)%4),length(0,1))&&Math.abs(angle(p[(i+3)%4],p[i],p[(i+1)%4])-90)<.15)&&length(0,1)>1e-8;
   if(r.kind==='congruence'){
    const a=r.points.slice(0,3),b=r.points.slice(3);if(new Set(a).size!==3||new Set(b).size!==3||Math.abs(angle(point(a[0]),point(a[1]),point(a[2]))%180)<1e-5)throw Error('해설 합동 삼각형이 퇴화했습니다.');
    if(!['SAS','SSS'].includes(r.criterion)||r.dependsOn.length!==3||new Set(r.dependsOn).size!==3)throw Error('합동에는 대응 순서와 서로 다른 세 조건, SAS/SSS 근거가 필요합니다.');
    const premises=r.dependsOn.map(id=>seen.get(id)),wanted=[0,1,2].map(i=>[key(a[i],a[(i+1)%3]),key(b[i],b[(i+1)%3])].sort().join('|'));
    if(r.criterion==='SSS')ok=premises.every(x=>x.kind==='equalLength')&&new Set(premises.map(sides)).size===3&&premises.every(x=>wanted.includes(sides(x)));
    else {const es=premises.filter(x=>x.kind==='equalLength'),as=premises.filter(x=>x.kind==='equalAngle');ok=es.length===2&&as.length===1&&sides(es[0])!==sides(es[1])&&es.every(x=>wanted.includes(sides(x)))&&[0,1,2].some(i=>{const before=(i+2)%3,after=(i+1)%3;return angles(as[0])===angles({points:[a[before],a[i],a[after],b[before],b[i],b[after]]})&&es.every(x=>[wanted[before],wanted[i]].includes(sides(x)));});}
    ok=ok&&[0,1,2].every(i=>equal(dist(point(a[i]),point(a[(i+1)%3])),dist(point(b[i]),point(b[(i+1)%3]))));
   }
   if(!ok)throw Error('해설 도형과 관계가 일치하지 않습니다: '+r.id+' ('+r.kind+')');seen.set(r.id,r);
  }
  if(lengthGroups(g).length>5)throw Error('해설 전체의 서로 다른 같은 길이 표시 그룹은 5개 이하여야 합니다.');
  const ids=new Set(),edgeKeys=new Set((d?.segments||[]).map(s=>key(s.from,s.to)));
  for(const s of g.steps){text(s.id,60,'단계 id');text(s.title,200,'목표');text(s.text,10000,'설명');if(ids.has(s.id))throw Error('해설 단계 id가 중복됩니다.');ids.add(s.id);if(s.choiceIndex!=null&&(!Number.isInteger(s.choiceIndex)||s.choiceIndex<0||s.choiceIndex>19))throw Error('해설 보기 번호가 잘못되었습니다.');
   if(s.view){if(!d)throw Error('해설 그림의 기본 도형이 없습니다.');list(s.view.points,80,'표시 점');list(s.view.segments,160,'표시 선분');list(s.view.relationIds,64,'표시 관계');if(s.view.points.some(p=>!points.has(p))||s.view.relationIds.some(id=>!seen.has(id))||s.view.segments.some(e=>!edgeKeys.has(key(e.from,e.to))||!['edge','emphasis','auxiliary'].includes(e.role)))throw Error('해설 단계의 도형 참조/선 역할이 잘못되었습니다.');
    const active=s.view.relationIds.map(id=>seen.get(id));if(active.filter(r=>r.kind==='equalAngle').length>3)throw Error('한 그림의 같은 길이/각 표식 그룹이 너무 많습니다. 단계를 나누세요.');
   }
  }
  return g;
 }
 function bind(value,q){const g=validate(value);if(!g)return null;if(normalized(plainText(g))!==normalized(coreText(q.solution)))throw Error('해설 단계 설명과 저장된 상세 풀이가 일치하지 않습니다.');if(g.steps.some(s=>s.choiceIndex!=null&&s.choiceIndex>=(q.choices||[]).length))throw Error('해설 단계의 보기 참조 범위가 잘못되었습니다.');g.basis=basis(q);return g;}
 function current(q){if(!q.solutionGuide||q.solutionStale||q.exportWithoutSolution||q.questionOnlyExport)return null;try{const g=validate(q.solutionGuide);return g.basis===basis(q)&&normalized(plainText(g))===normalized(coreText(q.solution))?g:null;}catch{return null;}}
 function relationText(r){const p=r.points;if(r.kind==='congruence')return `△${p.slice(0,3).join('')} ≅ △${p.slice(3).join('')} (${r.criterion})`;if(r.kind==='equalLength')return p.slice(0,2).join('')+' = '+p.slice(2).join('');if(r.kind==='equalAngle')return '∠'+p.slice(0,3).join('')+' = ∠'+p.slice(3).join('');if(r.kind==='rightAngle')return '∠'+p.join('')+' = 90°';if(r.kind==='angle')return '∠'+p.join('')+' = '+r.value+'°';if(r.kind==='distance')return p.join('')+' = '+r.value;return r.reason;}
 function project(g,step){
  if(!step.view)return null;const d=clone(g.diagram),rs=step.view.relationIds.map(id=>g.relations.find(r=>r.id===id));
  // Fixed construction points retain the same frame; only selected labels/edges are painted.
  d.segments=step.view.segments.map(e=>({from:e.from,to:e.to,dashed:e.role==='auxiliary'}));d.angles=[];d.equalLengthMarks=[];d.equalAngleMarks=[];d.shadedRegions=[];d.labels=[];d.lines=[];d.dimensions=[];d.constraints=[];d.angleLabelOverrides=null;
  const groups=lengthGroups(g),marks=new Map(groups.flatMap(group=>group.edges.map(e=>[e.key,group]))),painted=new Set();
  const tick=(a,b)=>{const k=key(a,b),group=marks.get(k);if(group&&!painted.has(k)){painted.add(k);d.equalLengthMarks.push({from:a,to:b,group:group.id,count:group.count,position:null,origin:'constructed'});}},right=p=>d.angles.push({a:p[0],vertex:p[1],b:p[2],label:'',right:true});
  let angleGroup=0;
  for(const r of rs){const p=r.points;for(const [a,b] of lengthEdges(r))tick(a,b);
   if(r.kind==='equalAngle'){const count=++angleGroup;for(const a of [p.slice(0,3),p.slice(3)])d.equalAngleMarks.push({a:a[0],vertex:a[1],b:a[2],group:r.id,count,style:'arc',origin:'constructed'});}
   if(['rightAngle','tangent'].includes(r.kind))right(p);
   if(r.kind==='angle')d.angles.push({a:p[0],vertex:p[1],b:p[2],label:r.value+'°',right:r.value===90});
   if(r.kind==='perpendicular'){const common=p.slice(0,2).find(x=>p.slice(2).includes(x));if(common)right([p.slice(0,2).find(x=>x!==common),common,p.slice(2).find(x=>x!==common)]);}
   if(r.kind==='square'){for(let i=0;i<4;i++)right([p[(i+3)%4],p[i],p[(i+1)%4]]);}
   if(r.kind==='congruence')for(const [i,refs] of [p.slice(0,3),p.slice(3)].entries())d.shadedRegions.push({rings:[refs.map(n=>{const x=d.points.find(p=>p.name===n);return{x:x.x,y:x.y};})],color:i?'#F2EBDE':'#E6F0F7',origin:'constructed'});
  }
  return {diagram:d,pointNames:step.view.points,segmentRoles:step.view.segments,relations:rs};
 }
 function remap(g,order,remapText){if(!g)return;for(const s of g.steps){if(s.choiceIndex!=null)s.choiceIndex=order[s.choiceIndex];s.title=remapText(s.title);s.text=remapText(s.text);}for(const r of g.relations)r.reason=remapText(r.reason);delete g.basis;}
 return {KINDS,LIMITS,validate,plainText,coreText,basis,bind,current,relationText,project,remap,lengthGroups};
});
