(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ExamEqualAngles=api;})(globalThis,function(){
 'use strict';
 const SYMBOLS=['circle','cross','triangle','square','diamond','plus','double-circle'];
 const clone=x=>JSON.parse(JSON.stringify(x));
 const angleKey=m=>JSON.stringify([m.vertex,...[m.a,m.b].sort()]);
 const issue=(group,text)=>({group,text:'[등각 그룹 확인 필요] '+text});
 function normalize(input,{strict=false,previous=null}={}){
  if(!input)return {diagram:input,issues:[],renderMarks:[]};
  const d=clone(input),issues=[],marks=d.equalAngleMarks||[],records=new Map((d.equalAngleGroups||[]).map(g=>[g.id,g]));
  if(previous){const confirmed=(previous.equalAngleRelations||[]).filter(r=>r.source==='user'&&r.status==='confirmed');if(confirmed.length){const relations=d.equalAngleRelations||[];for(const r of confirmed)if(!relations.some(n=>JSON.stringify([...n.groups].sort())===JSON.stringify([...r.groups].sort())&&n.status==='confirmed')){relations.push(clone(r));issues.push(issue('', '사용자가 확정한 그룹 사이 등각 관계를 유지했습니다.'));}d.equalAngleRelations=relations;}}
  // Existing user-confirmed membership and display survive AI redraws.
  if(previous)for(const old of previous.equalAngleGroups||[])if(old.pinned){
   const before=(previous.equalAngleMarks||[]).filter(m=>m.group===old.id),incoming=marks.filter(m=>m.group===old.id);
   if(JSON.stringify(before.map(angleKey).sort())!==JSON.stringify(incoming.map(angleKey).sort()))issues.push(issue(old.id,'사용자가 확정한 그룹 변경 요청을 보류했습니다.'));
   for(let i=marks.length-1;i>=0;i--)if(marks[i].group===old.id||before.some(m=>angleKey(m)===angleKey(marks[i])))marks.splice(i,1);
   marks.push(...clone(before));records.set(old.id,clone(old));
  }
  if(!marks.length)return {diagram:d,issues,renderMarks:[]};
  const members=new Map();
  for(const m of marks){
   if(!m.group||!['printed','constructed'].includes(m.origin)){issues.push(issue(m.group||'', '기호의 인쇄 여부 또는 그룹 근거가 불명확합니다.'));continue;}
   if(!members.has(m.group))members.set(m.group,[]);members.get(m.group).push(m);
  }
  const groups=[...members.keys()].sort().map(id=>{
   const saved=records.get(id),g=saved?clone(saved):{id,source:'legacy',evidence:'저장된 인식 결과의 명시적 그룹',status:'confirmed',symbol:null,count:1,pinned:false};
   const old=previous?.equalAngleGroups?.find(g=>g.id===id);if(!g.symbol&&old?.symbol&&JSON.stringify((previous.equalAngleMarks||[]).filter(m=>m.group===id).map(angleKey).sort())===JSON.stringify(members.get(id).map(angleKey).sort())){g.symbol=old.symbol;g.count=old.count;}
   if(strict&&g.source==='user'&&old?.source!=='user'){g.status='uncertain';issues.push(issue(id,'사용자 확인 근거가 없는 새 그룹입니다.'));}
   if(strict&&g.pinned&&!previous?.equalAngleGroups?.some(p=>p.id===id&&p.pinned)){g.pinned=false;g.status='uncertain';issues.push(issue(id,'새 인식 응답이 사용자 확정을 대신할 수 없습니다.'));}
   if(strict&&(!saved||!g.evidence?.trim()||g.source==='legacy')){g.status='uncertain';issues.push(issue(id,'본문·이등분선 관계·원본 기호의 근거가 필요합니다.'));}
   if(g.source==='bisector'&&new Set(members.get(id).map(m=>m.vertex)).size>1){g.status='uncertain';issues.push(issue(id,'서로 다른 꼭짓점은 이등분선이라는 이유만으로 같은 그룹에 넣을 수 없습니다. 본문의 추가 등각 조건을 확인하세요.'));}
   if(!Number.isInteger(g.count)||g.count<1||g.count>9){g.status='uncertain';issues.push(issue(id,'기호 개수는 1부터 9까지의 정수여야 합니다.'));}
   if(Array.isArray(d.points)&&members.get(id).some(m=>[m.a,m.vertex,m.b].some(name=>!d.points.some(p=>p.name===name)))){g.status='uncertain';issues.push(issue(id,'확정한 각의 점이 재현 도형에 없습니다. 그룹을 유지한 채 검수가 필요합니다.'));}
   if(g.status!=='confirmed')issues.push(issue(id,g.status==='conflict'?'원본 기호와 조건이 모순됩니다.':'흐릿하거나 불명확한 등각 관계를 확정하지 않았습니다.'));
   if(g.symbol!=null&&!SYMBOLS.includes(g.symbol)){g.status='uncertain';issues.push(issue(id,'지원하지 않는 사용자 기호를 자동 대체하지 않았습니다.'));}
   return g;
  });
  const byId=new Map(groups.map(g=>[g.id,g])),parents=new Map(groups.map(g=>[g.id,g.id]));
  const root=id=>{while(parents.get(id)!==id)id=parents.get(id);return id;};
  // Never merge based on vertex, visual shape, coordinates or chosen symbol.
  for(const r of d.equalAngleRelations||[]){
   if(strict&&r.source==='user'&&!previous?.equalAngleRelations?.some(p=>p.source==='user'&&p.status==='confirmed'&&JSON.stringify([...(p.groups||[])].sort())===JSON.stringify([...(r.groups||[])].sort()))){issues.push(issue('', '사용자 확인 없이 그룹 사이 등각 관계를 확정하지 않았습니다.'));continue;}
   if(r.status!=='confirmed'||!r.evidence?.trim()||!['body','printed','user'].includes(r.source)||!Array.isArray(r.groups)||r.groups.length<2||r.groups.some(id=>!byId.has(id)||byId.get(id).status!=='confirmed')){issues.push(issue('', '그룹 사이 등각 관계의 명시적 근거를 확인하세요.'));continue;}
   const ids=r.groups.map(root).sort();for(const id of ids)parents.set(id,ids[0]);
  }
  const sets=new Map();for(const g of groups){const id=root(g.id);if(!sets.has(id))sets.set(id,[]);sets.get(id).push(g);}
  const used=new Map();
  // Honor stable saved/user choices first. Conflicting pinned choices require review.
  const clusters=[...sets.values()].sort((a,b)=>Number(b.some(g=>g.pinned))-Number(a.some(g=>g.pinned))||Number(b.some(g=>g.symbol))-Number(a.some(g=>g.symbol))||a[0].id.localeCompare(b[0].id,'en'));
  for(const cluster of clusters){
   const pinned=cluster.filter(g=>g.pinned&&g.symbol),preferences=pinned.length?pinned:cluster.filter(g=>g.symbol);
   let symbol=preferences[0]?.symbol,count=preferences[0]?.count||1;
   if(pinned.some(g=>g.symbol!==symbol||(g.count||1)!==count)){issues.push(issue(cluster[0].id,'같다고 명시된 그룹의 사용자 기호가 서로 다릅니다.'));cluster.forEach(g=>g.status='conflict');}
   if(symbol&&used.has(symbol+':'+count)){
    if(pinned.length){issues.push(issue(cluster[0].id,'서로 무관한 그룹에 같은 사용자 기호가 지정되어 있습니다.'));cluster.forEach(g=>g.status='conflict');}
    else symbol=null;
   }
   if(!symbol){let index=0;do{symbol=SYMBOLS[index%SYMBOLS.length];count=1+Math.floor(index/SYMBOLS.length);index++;}while(used.has(symbol+':'+count)&&index<63);if(used.has(symbol+':'+count)){cluster.forEach(g=>g.status='uncertain');issues.push(issue(cluster[0].id,'구분 가능한 표시 수를 넘었습니다. 그림을 나눠 검수하세요.'));}}
   used.set(symbol+':'+count,cluster[0].id);
   for(const g of cluster){if(!g.pinned||!g.symbol){g.symbol=symbol;g.count=count;}g.displayGroup=root(g.id);}
  }
  const seen=new Map();
  for(const [id,ms]of members)for(const m of ms){const key=angleKey(m),prior=seen.get(key);if(prior&&root(prior)!==root(id)){issues.push(issue(id,'한 각이 서로 다른 그룹에 중복 등록되어 있습니다.'));byId.get(id).status='conflict';byId.get(prior).status='conflict';}seen.set(key,id);}
  d.equalAngleMarks=marks;d.equalAngleGroups=groups;
  const renderMarks=marks.filter(m=>byId.get(m.group)?.status==='confirmed'&&['printed','constructed'].includes(m.origin)).map(m=>({...m,symbol:byId.get(m.group).symbol,symbolCount:byId.get(m.group).count,displayGroup:byId.get(m.group).displayGroup}));
  return {diagram:d,issues,renderMarks};
 }
 function fromRelations(relations,previous=null){
  const equal=relations.filter(r=>r.kind==='equalAngle'),parent=new Map(),angles=new Map();
  const root=k=>{while(parent.get(k)!==k)k=parent.get(k);return k;};
  for(const r of equal){const keys=[r.points.slice(0,3),r.points.slice(3)].map(([a,vertex,b])=>{const m={a,vertex,b},key=angleKey(m);if(!parent.has(key)){parent.set(key,key);angles.set(key,m);}return key;});const keysRoot=keys.map(root).sort();parent.set(keysRoot[1],keysRoot[0]);}
  const old=normalize(previous).diagram,oldMarks=old?.equalAngleMarks||[],oldGroups=old?.equalAngleGroups||[];
  const matched=new Map([...angles].map(([key])=>[key,oldMarks.find(m=>angleKey(m)===key)]));
  const fallback=new Map();for(const [key,m]of matched)if(m&&!fallback.has(root(key)))fallback.set(root(key),m.group);
  const marks=[...angles].map(([key,m])=>({...m,group:matched.get(key)?.group||fallback.get(root(key))||'relation:'+root(key),style:'arc',count:1,origin:'constructed'}));
  const ids=[...new Set(marks.map(m=>m.group))].sort();
  const equality=equal.map(r=>({groups:[...new Set([r.points.slice(0,3),r.points.slice(3)].map(([a,vertex,b])=>marks.find(m=>angleKey(m)===angleKey({a,vertex,b})).group))],source:'body',evidence:r.reason||r.id,status:'confirmed'})).filter(r=>r.groups.length>1);
  return normalize({equalAngleMarks:marks,equalAngleGroups:ids.map(id=>oldGroups.find(g=>g.id===id)||({id,source:'body',evidence:equal.filter(r=>[r.points.slice(0,3),r.points.slice(3)].some(([a,vertex,b])=>marks.some(m=>m.group===id&&angleKey(m)===angleKey({a,vertex,b})))).map(r=>r.reason||r.id).join('; '),status:'confirmed',symbol:null,count:1,pinned:false})),equalAngleRelations:equality}).diagram;
 }
 function normalizeDocument(input,options={}){
  if(!input)return {document:input,issues:[]};const document=clone(input),issues=[];
  for(const n of document.nodes||[])if(n.diagram){const p=normalize(n.diagram,{...options,previous:options.previous?.nodes?.find(p=>p.id===n.id)?.diagram});n.diagram=p.diagram;issues.push(...p.issues);}
  return {document,issues};
 }
 return {SYMBOLS,angleKey,normalize,fromRelations,normalizeDocument};
});
