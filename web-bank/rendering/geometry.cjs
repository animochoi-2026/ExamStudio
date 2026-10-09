const vec=(a,b)=>[b.x-a.x,b.y-a.y];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
const norm=a=>Math.hypot(...a);
const dist=(a,b)=>norm(vec(a,b));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

function inspectDiagram(diagram) {
  if (!diagram) return {ok:true,checked:0,warnings:[],errors:[]};
  const errors=[],warnings=[]; const points=new Map();
  if (!Array.isArray(diagram.points) || diagram.points.length>300) return {ok:false,checked:0,warnings:[],errors:['도형의 점 목록이 올바르지 않습니다.']};
  for (const p of diagram.points) {
    if (!p || typeof p.name!=='string' || !p.name || !Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.abs(p.x)>1e9||Math.abs(p.y)>1e9) { errors.push('좌표 또는 점 이름이 올바르지 않습니다.');continue; }
    if(points.has(p.name)) errors.push(`점 ${p.name}이 중복됩니다.`);
    points.set(p.name,p);
  }
  for(const s of diagram.segments||[]) if(!points.has(s.from)||!points.has(s.to)||s.from===s.to) errors.push(`선분 ${s.from}${s.to}의 점을 확인해 주세요.`);
  for(const l of diagram.lines||[]){
    if(!l.start||!l.end||![l.start.x,l.start.y,l.end.x,l.end.y].every(n=>Number.isFinite(n)&&Math.abs(n)<=1e9)||dist(l.start,l.end)<1e-9)errors.push('직선 좌표 또는 길이가 올바르지 않습니다.');
    if((l.through||[]).some(n=>!points.has(n)))errors.push('직선이 없는 점을 참조합니다.');
  }
  const tickGroups=new Map();
  for(const m of diagram.equalLengthMarks||[]){
    if(!['printed','constructed'].includes(m.origin))continue;
    if(!points.has(m.from)||!points.has(m.to)||m.from===m.to)errors.push('같은 길이 빗금의 선분 참조를 확인해 주세요.');
    if(!Number.isInteger(m.count)||m.count<1||m.count>5||m.position!=null&&(!Number.isFinite(m.position)||m.position<.1||m.position>.9))errors.push('빗금 개수 또는 선분 위 위치를 확인해 주세요.');
    if(tickGroups.has(m.group)&&tickGroups.get(m.group)!==m.count)errors.push('같은 길이 빗금 그룹의 개수가 서로 다릅니다.');
    tickGroups.set(m.group,m.count);
  }
  for(const c of diagram.circles||[]) if(![c.cx,c.cy,c.r].every(Number.isFinite)||c.r<=0) errors.push('원의 중심 또는 반지름이 올바르지 않습니다.');
  for(const region of diagram.shadedRegions||[])if(!/^#[0-9a-f]{6}$/i.test(region.color)||!Array.isArray(region.rings)||!region.rings.length||region.rings.some(ring=>!Array.isArray(ring)||ring.length<3||ring.some(p=>!p||![p.x,p.y].every(n=>Number.isFinite(n)&&Math.abs(n)<=1e9))))errors.push('색칠 영역의 경계 좌표 또는 색상을 확인해 주세요.');
  const angleGroups=new Map();
  for(const m of diagram.equalAngleMarks||[]){
    if(![m.a,m.vertex,m.b].every(n=>points.has(n))||new Set([m.a,m.vertex,m.b]).size!==3)errors.push('같은 각 표시가 참조하는 점을 확인해 주세요.');
    if(!Number.isInteger(m.count)||m.count<1||m.count>3||!['dot','arc'].includes(m.style))errors.push('같은 각의 점·호 표시 형식을 확인해 주세요.');
    const key=m.style+':'+m.count;if(angleGroups.has(m.group)&&angleGroups.get(m.group)!==key)errors.push('같은 각 표식 그룹의 점·호 개수가 다릅니다.');angleGroups.set(m.group,key);
  }
  for(const a of diagram.angles||[]) if(![a.a,a.vertex,a.b].every(x=>points.has(x))) errors.push('각 표시가 없는 점을 참조합니다.');
  for(const d of diagram.dimensions||[]){
    if(!['printed','constructed'].includes(d.origin))continue;
    if(!d.from||!d.to||!d.start||!d.end){warnings.push('길이 표시의 대상 또는 끝점 미확인: 점선을 그리지 않았습니다.');continue;}
    if(!points.has(d.from)||!points.has(d.to)||d.from===d.to)errors.push('치수선 참조가 올바르지 않습니다.');
    if(![d.start.x,d.start.y,d.end.x,d.end.y].every(n=>Number.isFinite(n)&&Math.abs(n)<=1e9)||dist(d.start,d.end)<1e-9)errors.push('치수선 좌표 또는 길이가 올바르지 않습니다.');
  }
  for(const o of diagram.angleLabelOverrides||[])if(!Number.isInteger(o.angleIndex)||!diagram.angles?.[o.angleIndex]||![o.x,o.y].every(n=>Number.isFinite(n)&&Math.abs(n)<=1e9))errors.push('각도 배치 참조 또는 좌표가 올바르지 않습니다.');
  let checked=0;
  const checks=[...(diagram.constraints||[])];
  for(const a of diagram.angles||[]) if(a.right) checks.push({type:'angle',points:[a.a,a.vertex,a.b],value:90});
  for(const c of checks) {
    // A three-point perpendicular is unambiguous only when a right-angle
    // annotation confirms that its middle point is the shared vertex.
    let refs=c.points||[];
    if(c.type==='perpendicular'&&refs.length===3&&(diagram.angles||[]).some(a=>a.right&&a.vertex===refs[1]&&((a.a===refs[0]&&a.b===refs[2])||(a.a===refs[2]&&a.b===refs[0]))))refs=[refs[0],refs[1],refs[1],refs[2]];
    const p=refs.map(x=>points.get(x));
    const counts={perpendicular:4,parallel:4,equalLength:4,midpoint:3,collinear:3,distance:2,angle:3};
    if(!counts[c.type]) {warnings.push(`검사하지 않은 조건: ${c.type}`);continue;}
    const names={perpendicular:'수직',parallel:'평행',equalLength:'같은 길이',midpoint:'중점',collinear:'일직선',distance:'길이',angle:'각도'};
    if((c.type==='collinear'?p.length<3:p.length!==counts[c.type])||p.some(x=>!x)) {const absent=(c.points||[]).filter(n=>!points.has(n));errors.push(`${(c.points||[]).join('·')||'점 미지정'}: ${names[c.type]} 조건의 점 데이터가 부족합니다. ${absent.length?'그림에 없는 점: '+absent.join('·'):c.type==='collinear'?'서로 다른 점이 3개 이상 필요합니다.':counts[c.type]+'개의 점 참조가 필요합니다.'} 도형 자동 수정으로 복원해 주세요.`);continue;}
    let error=0,tolerance=1e-3; let desc=c.type;
    if(['perpendicular','parallel'].includes(c.type)) {const u=vec(p[0],p[1]),v=vec(p[2],p[3]);if(norm(u)*norm(v)<1e-12){errors.push('길이가 0인 선분이 있습니다.');continue;}error=Math.abs(c.type==='perpendicular'?dot(u,v):cross(u,v))/(norm(u)*norm(v));desc=c.type==='perpendicular'?'수직':'평행';}
    if(c.type==='equalLength'){error=Math.abs(dist(p[0],p[1])-dist(p[2],p[3]));tolerance=Math.max(dist(p[0],p[1])*1e-3,1e-5);desc='같은 길이';}
    if(c.type==='midpoint'){error=Math.hypot(p[0].x-(p[1].x+p[2].x)/2,p[0].y-(p[1].y+p[2].y)/2);tolerance=Math.max(dist(p[1],p[2])*1e-3,1e-5);desc='중점';}
    if(c.type==='collinear'){
      let a=p[0],b=p[1];for(const x of p)for(const y of p)if(dist(x,y)>dist(a,b)){a=x;b=y;}
      if(dist(a,b)<1e-9||new Set(c.points).size<3){errors.push(`${c.points.join('·')}: 일직선 조건을 검사할 서로 다른 점이 부족하거나 점들이 겹쳐 있습니다. 도형 자동 수정이 필요합니다.`);continue;}
      error=Math.max(...p.map(x=>Math.abs(cross(vec(a,b),vec(a,x)))/dist(a,b)));tolerance=Math.max(dist(a,b)*1e-3,1e-5);desc='일직선';
    }
    if(c.type==='distance'){if(!Number.isFinite(c.value)||c.value<=0){errors.push('길이 조건의 수치가 올바르지 않습니다.');continue;}error=Math.abs(dist(p[0],p[1])-c.value);tolerance=Math.max(c.value*1e-3,1e-5);desc='길이';}
    if(c.type==='angle'){const u=vec(p[1],p[0]),v=vec(p[1],p[2]);if(norm(u)*norm(v)<1e-12||!Number.isFinite(c.value)){errors.push('각도 조건을 확인해 주세요.');continue;}const actual=Math.acos(clamp(dot(u,v)/(norm(u)*norm(v)),-1,1))*180/Math.PI;error=Math.abs(actual-c.value);tolerance=0.15;desc=`각도 ${c.value}°`;}
    checked++;if(error>tolerance) errors.push(`${(c.points||[]).join(', ')}: ${desc} 조건이 좌표와 맞지 않습니다.${c.type==='collinear'?' 이 점들이 한 직선 위에 있어야 하지만 생성된 그림에서 벗어난 점이 있습니다.':' 생성된 그림의 배치를 수정해야 합니다.'}`);
  }
  if(!checked) warnings.push('명시된 좌표 조건이 없어 도형의 수학적 일치 여부를 자동 검사하지 않았습니다.');
  return {ok:errors.length===0,checked,warnings:[...new Set(warnings)],errors:[...new Set(errors)]};
}

function diagramSvg(diagram, options = {}) {
  if (!diagram) return null;
  const report = inspectDiagram(diagram);
  if (report.errors.some(error => /목록|좌표 또는|중복|참조|중심|선분/.test(error))) throw new Error(report.errors.join('\n'));
  return require('./diagram-layout.js').diagramSvg(diagram, options);
}
const { layoutDiagram, questionDiagram } = require('./diagram-layout.js');
module.exports = { inspectDiagram, diagramSvg, layoutDiagram, questionDiagram };
