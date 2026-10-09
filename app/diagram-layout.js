(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ExamDiagramLayout = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const equalAngles=()=>typeof module==='object'&&module.exports?require('./equal-angle-groups.js'):globalThis.ExamEqualAngles;
  const TAU = Math.PI * 2;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const length = value => Math.hypot(value.x, value.y);
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const unit = value => { const size = length(value); return size > 1e-9 ? { x: value.x / size, y: value.y / size } : { x: 1, y: 0 }; };
  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  const add = (point, direction, amount) => ({ x: point.x + direction.x * amount, y: point.y + direction.y * amount });
  const escapeXml = value => String(value).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);
  const round = value => Number(value.toFixed(3));

  function labelText(value) {
    return String(value ?? '').replace(/[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g,c=>({'½':'1/2','⅓':'1/3','⅔':'2/3','¼':'1/4','¾':'3/4','⅕':'1/5','⅖':'2/5','⅗':'3/5','⅘':'4/5','⅙':'1/6','⅚':'5/6','⅛':'1/8','⅜':'3/8','⅝':'5/8','⅞':'7/8'}[c])).replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹0-9]+)\s*[⁄∕/]\s*([₀₁₂₃₄₅₆₇₈₉0-9]+)/g,(_,n,d)=>(n+'/'+d).replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉]/g,c=>'01234567890123456789'['⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉'.indexOf(c)])).replace(/[⁄∕]/g,'/').replace(/\$+/g, '').replace(/\^\{?\\circ\}?/g, '°')
      .replace(/\\(?:overline|mathrm|text)\{([^}]+)\}/g, '$1')
      .replace(/\\(?:dfrac|tfrac|frac)\{([^{}]+)\}\{([^{}]+)\}/g, '$1/$2')
      .replace(/\\(?:,|;|!|quad)/g, ' ').replace(/\\pi\b/g, 'π')
      .replace(/\\theta\b/g, 'θ').replace(/\\angle\b/g, '∠').trim();
  }

  // Conservative Times New Roman metrics keep placement identical in Node and Chromium.
  // The boxes include a safety margin for font substitution and rasterization.
  function textSize(text, fontSize) {
    const fraction=fractionParts(text);if(fraction)return {width:Math.max(textSize(fraction[1],fontSize*.8).width,textSize(fraction[2],fontSize*.8).width)+textSize(fraction[3]||'',fontSize).width,height:fontSize*2+6};
    let em = 0;
    for (const char of text) {
      if (/\s/.test(char)) em += .32;
      else if (/[ilI1.,:'|]/.test(char)) em += .37;
      else if (/[MW@]/.test(char)) em += .95;
      else if (/[A-Z]/.test(char)) em += .74;
      else if (/[a-z0-9]/.test(char)) em += .59;
      else if (/[°′″]/.test(char)) em += .43;
      else if (char.charCodeAt(0) > 0x2e00) em += 1.05;
      else em += .72;
    }
    return { width: Math.max(fontSize * .4, em * fontSize) + 7, height: fontSize * 1.15 + 6 };
  }
  function rectangle(center, size) { return { left: center.x - size.width / 2, right: center.x + size.width / 2, top: center.y - size.height / 2, bottom: center.y + size.height / 2 }; }
  function expand(rect, padding) { return { left: rect.left - padding, right: rect.right + padding, top: rect.top - padding, bottom: rect.bottom + padding }; }
  function overlaps(a, b, padding = 0) { return a.left < b.right + padding && a.right > b.left - padding && a.top < b.bottom + padding && a.bottom > b.top - padding; }
  function corners(rect) { return [{ x: rect.left, y: rect.top }, { x: rect.right, y: rect.top }, { x: rect.right, y: rect.bottom }, { x: rect.left, y: rect.bottom }]; }
  function inside(point, rect) { return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom; }
  function segmentHitsRect(a, b, rect) {
    const dx = b.x - a.x, dy = b.y - a.y;
    let low = 0, high = 1;
    for (const [p, q] of [[-dx, a.x - rect.left], [dx, rect.right - a.x], [-dy, a.y - rect.top], [dy, rect.bottom - a.y]]) {
      if (Math.abs(p) < 1e-9) { if (q < 0) return false; }
      else { const ratio = q / p; if (p < 0) low = Math.max(low, ratio); else high = Math.min(high, ratio); if (low > high) return false; }
    }
    return true;
  }
  function pointSegmentDistance(point, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, denominator = dx * dx + dy * dy;
    const t = denominator ? clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / denominator, 0, 1) : 0;
    return distance(point, { x: a.x + dx * t, y: a.y + dy * t });
  }
  function circleHitsRect(circle, rect) {
    const nearest = { x: clamp(circle.cx, rect.left, rect.right), y: clamp(circle.cy, rect.top, rect.bottom) };
    const center = { x: circle.cx, y: circle.cy };
    const farthest = Math.max(...corners(rect).map(point => distance(point, center)));
    return distance(nearest, center) <= circle.r + 3 && farthest >= circle.r - 3;
  }
  function signedAngle(from, to) { let result = to - from; while (result <= -Math.PI) result += TAU; while (result > Math.PI) result -= TAU; return result; }
  function insideWedge(point, angle) {
    const offset = sub(point, angle.vertex), argument = Math.atan2(offset.y, offset.x);
    const delta = signedAngle(angle.start, argument);
    return angle.sweep >= 0 ? delta >= 0 && delta <= angle.sweep : delta <= 0 && delta >= angle.sweep;
  }
  function directionAt(angle) { return { x: Math.cos(angle), y: Math.sin(angle) }; }

  // Only explicit equalLength relations can supply missing ticks. Never measure
  // approximate source coordinates to invent an equality condition.
  function equalLengthMarks(diagram) {
    const explicit=(diagram.equalLengthMarks||[]).filter(m=>['printed','constructed'].includes(m.origin));
    if(explicit.length)return explicit;
    const groups=[],key=(a,b)=>[a,b].sort().join('\u0000');
    for(const c of diagram.constraints||[]){
      if(c.type!=='equalLength'||c.points?.length!==4)continue;
      const [a,b,c1,d]=c.points,entries=[[key(a,b),{from:a,to:b}],[key(c1,d),{from:c1,to:d}]];
      const matches=groups.filter(g=>entries.some(([k])=>g.has(k))),merged=new Map(entries);
      for(const g of matches){for(const entry of g)merged.set(...entry);groups.splice(groups.indexOf(g),1);}groups.push(merged);
    }
    return groups.flatMap((g,i)=>i<5?[...g.values()].map(m=>({...m,group:'relation-'+i,count:i+1,position:null,origin:diagram.coordinateSystem==='image_y_down'?'printed':'constructed'})):[]);
  }
  function fractionParts(text){return String(text).match(/^\s*([−+\-]?[\wπθ.]+)\s*\/\s*([−+\-]?[\wπθ.]+)(\s*(?:°|cm|mm|m))?\s*$/);}
  function labelSvg(label){
    const f=fractionParts(label.text),x=round(label.center.x),y=round(label.center.y),size=label.fontSize;
    const style=['point','line'].includes(label.kind)?' font-style="italic"':['angle','dimension'].includes(label.kind)?' paint-order="stroke" stroke="white" stroke-width="5" stroke-linejoin="round"':'';
    if(!f)return `<text x="${x}" y="${round(y+size*.33)}" font-size="${size}"${style}>${escapeXml(label.text)}</text>`;
    const w=Math.max(textSize(f[1],size*.8).width,textSize(f[2],size*.8).width)-2;
    return `<g class="fraction-label" aria-label="${escapeXml(label.text)}"><text x="${x}" y="${round(y-size*.25)}" font-size="${size*.8}"${style}>${escapeXml(f[1])}</text><path d="M ${round(x-w/2)} ${y} H ${round(x+w/2)}" stroke="white" stroke-width="4"/><path d="M ${round(x-w/2)} ${y} H ${round(x+w/2)}" stroke="#14191c" stroke-width="1.2"/><text x="${x}" y="${round(y+size*.8)}" font-size="${size*.8}"${style}>${escapeXml(f[2])}</text>${f[3]?`<text x="${round(x+w/2+size*.5)}" y="${round(y+size*.33)}" font-size="${size}">${escapeXml(f[3])}</text>`:''}</g>`;
  }

  function layoutDiagram(diagram, options = {}) {
    if (!diagram || !Array.isArray(diagram.points) || !diagram.points.length) return null;
    const width = Number.isFinite(options.width) && options.width > 0 ? options.width : 960;
    const height = Number.isFinite(options.height) && options.height > 0 ? options.height : 620;
    const margin = 78;
    const inputPoints = diagram.points.filter(point => typeof point.name === 'string' && Number.isFinite(point.x) && Number.isFinite(point.y));
    if (!inputPoints.length) return null;
    const inputCircles = (diagram.circles || []).filter(circle => [circle.cx, circle.cy, circle.r].every(Number.isFinite) && circle.r > 0);
    const bounds = inputPoints.map(point => ({ x: point.x, y: point.y }));
    const inputShading=(diagram.shadedRegions||[]).filter(r=>['printed','constructed'].includes(r.origin)&&/^#[0-9a-f]{6}$/i.test(r.color)&&Array.isArray(r.rings)&&r.rings.every(ring=>ring.length>=3&&ring.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))));
    for(const r of inputShading)for(const ring of r.rings)bounds.push(...ring);
    for (const circle of inputCircles) bounds.push({ x: circle.cx - circle.r, y: circle.cy - circle.r }, { x: circle.cx + circle.r, y: circle.cy + circle.r });
    for (const label of diagram.labels || []) if (Number.isFinite(label.x) && Number.isFinite(label.y)) bounds.push({ x: label.x, y: label.y });
    const inputLines=(diagram.lines||[]).filter(l=>['printed','constructed'].includes(l.origin)&&l.start&&l.end&&[l.start.x,l.start.y,l.end.x,l.end.y].every(Number.isFinite)&&distance(l.start,l.end)>1e-9);
    for(const l of inputLines)bounds.push(l.start,l.end);
    const inputDimensions = (diagram.dimensions || []).filter(d => ['printed','constructed'].includes(d.origin) && d.from !== d.to && inputPoints.some(p => p.name === d.from) && inputPoints.some(p => p.name === d.to) && d.start && d.end && [d.start.x,d.start.y,d.end.x,d.end.y].every(Number.isFinite) && distance(d.start,d.end)>1e-9);
    for (const d of inputDimensions) bounds.push(d.start,d.end);
    for (const o of diagram.angleLabelOverrides || []) if (Number.isInteger(o.angleIndex) && diagram.angles?.[o.angleIndex] && [o.x,o.y].every(Number.isFinite)) bounds.push(o);
    const minX = Math.min(...bounds.map(p => p.x)), maxX = Math.max(...bounds.map(p => p.x));
    const minY = Math.min(...bounds.map(p => p.y)), maxY = Math.max(...bounds.map(p => p.y));
    const scale = Math.min((width - 2 * margin) / Math.max(maxX - minX, 1e-6), (height - 2 * margin) / Math.max(maxY - minY, 1e-6));
    const origin = { x: (width - (maxX - minX) * scale) / 2, y: (height - (maxY - minY) * scale) / 2 };
    const toPixel = point => ({ x: origin.x + (point.x - minX) * scale, y: diagram.coordinateSystem === 'image_y_down' ? origin.y + (point.y - minY) * scale : height - origin.y - (point.y - minY) * scale });
    const points = new Map(inputPoints.map(point => [point.name, { ...toPixel(point), name: point.name }]));
    const shadedRegions=inputShading.map(r=>({...r,rings:r.rings.map(ring=>ring.map(toPixel))}));
    const anglePlan=equalAngles()?.normalize(diagram),equalAngleIssues=[...(anglePlan?.issues||[])];
    const useSymbols=!!diagram.equalAngleGroups?.length||new Set((diagram.equalAngleMarks||[]).map(m=>m.group)).size>1;
    const equalAngleMarks=[];
    for(const m of (useSymbols?anglePlan?.renderMarks:diagram.equalAngleMarks)||[]){
      if(!['printed','constructed'].includes(m.origin)||!Number.isInteger(m.count)||m.count<1||m.count>3)continue;
      const a=points.get(m.a),vertex=points.get(m.vertex),b=points.get(m.b);if(!a||!vertex||!b||distance(a,vertex)<1e-7||distance(b,vertex)<1e-7)continue;
      const start=Math.atan2(a.y-vertex.y,a.x-vertex.x),sweep=signedAngle(start,Math.atan2(b.y-vertex.y,b.x-vertex.x)),radius=Math.min(30,Math.min(distance(a,vertex),distance(b,vertex))*.23);
      equalAngleMarks.push({...m,vertex,start,sweep,radius,maxRadius:Math.min(distance(a,vertex),distance(b,vertex))*.72,dots:Array.from({length:m.count},(_,i)=>add(vertex,directionAt(start+sweep*(i+1)/(m.count+1)),radius))});
    }
    const segments = (diagram.segments || []).filter(segment => points.has(segment.from) && points.has(segment.to)).map(segment => ({ a: points.get(segment.from), b: points.get(segment.to), dashed: !!segment.dashed, ...(options.solutionStyle?{from:segment.from,to:segment.to}:{}) }));
    const lines=inputLines.map(l=>{
      let a=toPixel(l.start),b=toPixel(l.end);const named=(l.through||[]).map(n=>points.get(n)).filter(Boolean);
      // Two confirmed points anchor a named line after coordinate edits too.
      if(named.length>=2&&distance(named[0],named[1])>1e-7){const u=unit(sub(named[1],named[0])),all=[a,b,...named],t=all.map(p=>(p.x-named[0].x)*u.x+(p.y-named[0].y)*u.y);a=add(named[0],u,Math.min(...t));b=add(named[0],u,Math.max(...t));}
      const u=unit(sub(b,a));return {...l,a:add(a,u,-30),b:add(b,u,30)};
    });
    const ticks=[];
    for(const mark of equalLengthMarks(diagram)){
      const a=points.get(mark.from),b=points.get(mark.to);
      if(!a||!b||distance(a,b)<1e-7||!Number.isInteger(mark.count)||mark.count<1||mark.count>5)continue;
      const u=unit(sub(b,a)),normal={x:-u.y,y:u.x},t=Number.isFinite(mark.position)?clamp(mark.position,.1,.9):.5;
      const midpoint=add(a,u,distance(a,b)*t),spacing=Math.min(8,distance(a,b)*.1/mark.count);
      for(let i=0;i<mark.count;i++){const center=add(midpoint,u,(i-(mark.count-1)/2)*spacing);ticks.push({a:add(center,normal,-8),b:add(center,normal,8),center,from:mark.from,to:mark.to,group:mark.group});}
    }
    // Draw only explicitly recorded parallel relations; never infer from appearance.
    const parallelMarks = [], parallelPairs = new Set();
    for (const relation of diagram.constraints || []) {
      if (relation.type !== 'parallel' || relation.points?.length !== 4) continue;
      const pairs = [relation.points.slice(0, 2), relation.points.slice(2, 4)];
      if (pairs.some(pair => !points.has(pair[0]) || !points.has(pair[1]) || distance(points.get(pair[0]), points.get(pair[1])) < 1e-7)) continue;
      const key = pairs.map(pair => [...pair].sort().join(':')).sort().join('|');
      if (parallelPairs.has(key)) continue;
      const count = parallelPairs.size % 3 + 1, group = 'parallel-' + parallelPairs.size;
      parallelPairs.add(key);
      for (const [from, to] of pairs) {
        const a = points.get(from), b = points.get(to);
        let u = unit(sub(b, a)); if (u.x < -1e-9 || (Math.abs(u.x) < 1e-9 && u.y < 0)) u = {x:-u.x,y:-u.y};
        const n = {x:-u.y,y:u.x}, midpoint = {x:(a.x+b.x)/2,y:(a.y+b.y)/2};
        for (let i=0;i<count;i++) {
          const center = add(midpoint,u,(i-(count-1)/2)*9), tip = add(center,u,4), back = add(center,u,-4);
          parallelMarks.push({from,to,group,count,center,a:add(back,n,5),tip,b:add(back,n,-5)});
        }
      }
    }
    const circles = inputCircles.map(circle => { const center = toPixel({ x: circle.cx, y: circle.cy }); return { cx: center.x, cy: center.y, r: circle.r * scale }; });
    const angles = [], markerSegments = [];
    for (const [index, input] of (diagram.angles || []).entries()) {
      const a = points.get(input.a), vertex = points.get(input.vertex), b = points.get(input.b);
      if (!a || !vertex || !b || distance(a, vertex) < 1e-7 || distance(b, vertex) < 1e-7) continue;
      const u = unit(sub(a, vertex)), v = unit(sub(b, vertex)), start = Math.atan2(u.y, u.x), sweep = signedAngle(start, Math.atan2(v.y, v.x));
      const radius = Math.min(input.right ? 17 : 39, distance(a, vertex) * .17, distance(b, vertex) * .17);
      const angle = { index, a, vertex, b, u, v, start, sweep, radius, right: !!input.right, text: labelText(input.label), segments: [] };
      if (angle.right) { const p1 = add(vertex, u, radius), p2 = add(p1, v, radius), p3 = add(vertex, v, radius); angle.segments = [{ a: p1, b: p2 }, { a: p2, b: p3 }]; }
      else { const count = Math.max(8, Math.ceil(Math.abs(sweep) * 14)); for (let i = 0; i < count; i++) angle.segments.push({ a: add(vertex, directionAt(start + sweep * i / count), radius), b: add(vertex, directionAt(start + sweep * (i + 1) / count), radius) }); }
      markerSegments.push(...angle.segments); angles.push(angle);
    }
    const dimensions = inputDimensions.map(d => {
      const guideStart=toPixel(d.start),guideEnd=toPixel(d.end),fromPoint=points.get(d.from),toPoint=points.get(d.to);
      const curved=d.guideStyle!=='straight';
      const a=curved?{x:fromPoint.x,y:fromPoint.y}:guideStart,b=curved?{x:toPoint.x,y:toPoint.y}:guideEnd;
      const midpoint={x:(a.x+b.x)/2,y:(a.y+b.y)/2},sourceMidpoint={x:(fromPoint.x+toPoint.x)/2,y:(fromPoint.y+toPoint.y)/2};
      const u=unit(sub(b,a));let normal={x:-u.y,y:u.x};
      let outward=sub({x:(guideStart.x+guideEnd.x)/2,y:(guideStart.y+guideEnd.y)/2},sourceMidpoint);
      if(length(outward)<1e-7){const center=[...points.values()].reduce((v,p)=>({x:v.x+p.x/points.size,y:v.y+p.y/points.size}),{x:0,y:0});outward=sub(midpoint,center);}
      if(normal.x*outward.x+normal.y*outward.y<0)normal={x:-normal.x,y:-normal.y};
      const sag=d.guideStyle==='straight'?0:clamp(distance(a,b)*.20,20,130);
      const control=add(midpoint,normal,2*sag),labelCenter=add(midpoint,normal,sag);
      const curvePoints=Array.from({length:17},(_,i)=>{const t=i/16;return{x:(1-t)**2*a.x+2*(1-t)*t*control.x+t*t*b.x,y:(1-t)**2*a.y+2*(1-t)*t*control.y+t*t*b.y};});
      return {...d,a,b,fromPoint,toPoint,control,labelCenter,curvePoints,curved};
    });
    const dimensionSegments = dimensions.flatMap(d => [...d.curvePoints.slice(1).map((b,i)=>({a:d.curvePoints[i],b})),...(d.curved?[]:[{a:d.fromPoint,b:d.a},{a:d.toPoint,b:d.b}])]);
    const geometry = [...segments, ...lines, ...ticks, ...markerSegments, ...dimensionSegments];
    const collisionCount = rect => {
      const padded = expand(rect, 3);
      return geometry.reduce((count, segment) => count + Number(segmentHitsRect(segment.a, segment.b, padded)), 0)
        + circles.reduce((count, circle) => count + Number(circleHitsRect(circle, padded)), 0)
        + [...points.values()].reduce((count, point) => count + Number(inside(point, padded)), 0);
    };
    const labels = [];
    const makeLabel = (id, kind, text, anchor, fontSize) => ({ id, kind, text, anchor, fontSize, size: textSize(text, fontSize), candidates: [] });
    const candidate = (label, center, cost, extra = {}) => { const box = rectangle(center, label.size); label.candidates.push({ center, box, cost, geometryHits: collisionCount(box), ...extra }); };

    for(const [index,line] of lines.entries())if(labelText(line.label)){
      const label=makeLabel(`line-${index}`,'line',labelText(line.label),line.b,38),u=unit(sub(line.b,line.a)),n={x:-u.y,y:u.x};
      for(const gap of [28,40,54])for(const sign of [1,-1])candidate(label,add(line.b,n,gap*sign),gap);
      labels.push(label);
    }

    // Geometry overlap never pushes text away from its intended position.
    // Keep their centers inside their own angle, nearby, even when glyphs overlap its rays.
    for (const angle of angles.filter(item => item.text).sort((a, b) => Math.abs(a.sweep) - Math.abs(b.sweep) || a.index - b.index)) {
      const label = makeLabel(`angle-${angle.index}`, 'angle', angle.text, angle.vertex, 38);
      const override=(diagram.angleLabelOverrides||[]).find(o=>o.angleIndex===angle.index&&[o.x,o.y].every(Number.isFinite));
      if(override){
        const center=toPixel(override),anchor=add(angle.vertex,directionAt(angle.start+angle.sweep*.5),angle.radius);
        candidate(label,center,0,{withinWedge:insideWedge(center,angle),...(override.leader?{leaderAnchor:anchor,leaderArrow:true}:{})});
        labels.push(label);continue;
      }
      const maxRadius = Math.max(angle.radius + 26, Math.min(angle.radius + 100, Math.min(distance(angle.a, angle.vertex), distance(angle.b, angle.vertex)) * .84));
      for (let radius = angle.radius + 26; radius <= maxRadius; radius += 7) for (const fraction of [.5, .4, .6, .3, .7]) {
        const center = add(angle.vertex, directionAt(angle.start + angle.sweep * fraction), radius);
        candidate(label, center, radius * .15 + Math.abs(fraction - .5) * 50, { withinWedge: true });
      }
      labels.push(label);
    }

    const drawingCenter = { x: (Math.min(...[...points.values()].map(p => p.x)) + Math.max(...[...points.values()].map(p => p.x))) / 2, y: (Math.min(...[...points.values()].map(p => p.y)) + Math.max(...[...points.values()].map(p => p.y))) / 2 };
    for (const input of inputPoints) {
      if(input.name.startsWith('__'))continue; // Reserved internal vertex ID; never a printed label.
      if(options.pointNames&&!options.pointNames.includes(input.name))continue;
      const anchor = points.get(input.name), label = makeLabel(`point-${input.name}`, 'point', labelText(input.name), anchor, options.pointFontSize||39);
      const adjacent = [];
      for (const segment of segments) if (pointSegmentDistance(anchor, segment.a, segment.b) < .01) {
        for (const endpoint of [segment.a, segment.b]) if (distance(endpoint, anchor) > 1e-7) adjacent.push(unit(sub(endpoint, anchor)));
      }
      const away = unit(adjacent.reduce((value, direction) => ({ x: value.x - direction.x, y: value.y - direction.y }), { x: 0, y: 0 }));
      const explicit = Number.isFinite(input.labelDx) || Number.isFinite(input.labelDy);
      const hint = explicit ? { x: Number.isFinite(input.labelDx) ? input.labelDx : 0, y: Number.isFinite(input.labelDy) ? input.labelDy : 0 } : away;
      const preferred = length(hint) > .01 ? unit(hint) : unit(sub(anchor, drawingCenter));
      for (const extra of [0, 8, 17, 29, 45, 66, 94, 130]) for (let i = 0; i < 32; i++) {
        const direction = directionAt(Math.atan2(preferred.y, preferred.x) + i * TAU / 32);
        const gap = Math.abs(direction.x) * label.size.width / 2 + Math.abs(direction.y) * label.size.height / 2 + 9 + extra;
        const center = add(anchor, direction, gap);
        const angularCost = 1 - (preferred.x * direction.x + preferred.y * direction.y);
        candidate(label, center, extra * 1.1 + angularCost * (explicit ? 10 : 7), extra > 66 ? { leaderAnchor: anchor } : {});
      }
      labels.push(label);
    }

    for (const [index, input] of (diagram.labels || []).entries()) {
      if (!Number.isFinite(input.x) || !Number.isFinite(input.y) || !labelText(input.text)) continue;
      const anchor = toPixel(input), label = makeLabel(`label-${index}`, 'label', labelText(input.text), anchor, Number.isFinite(input.fontSize) ? clamp(input.fontSize, 16, 60) : 38);
      candidate(label, anchor, 0);
      // Explicit source coordinates always win, including legacy labels without fixed.
      labels.push(label);
    }

    // Dimension labels stay on their own guide; a white text outline keeps dashes readable.
    for(const [index,d] of dimensions.entries())if(labelText(d.label)){
      const center=d.labelCenter;
      const label=makeLabel(`dimension-${index}`,'dimension',labelText(d.label),center,38);
      candidate(label,center,0);labels.unshift(label);
    }
    const placed = [];
    for (const label of labels) {
      let best = null, bestScore = Infinity;
      for (const item of label.candidates) {
        const labelHits = placed.reduce((count, previous) => count + Number(overlaps(item.box, previous.box, 5)), 0);
        const score = labelHits * 1e7 + item.cost;
        if (score < bestScore) { best = item; bestScore = score; }
      }
      if (best) placed.push({ id: label.id, kind: label.kind, text: label.text, anchor: label.anchor, fontSize: label.fontSize, ...best });
    }
    // Revisit any constrained choice after other labels have found their own space.
    for (let pass = 0; pass < 3; pass++) for (let index = placed.length - 1; index >= 0; index--) {
      const label = labels.find(item => item.id === placed[index].id), others = placed.filter((_, at) => at !== index);
      const current = placed[index];
      let best = current, bestScore = others.reduce((n, other) => n + Number(overlaps(current.box, other.box, 5)), 0) * 1e7 + current.cost;
      for (const item of label.candidates) {
        const score = others.reduce((n, other) => n + Number(overlaps(item.box, other.box, 5)), 0) * 1e7 + item.cost;
        if (score < bestScore) { best = { id: label.id, kind: label.kind, text: label.text, anchor: label.anchor, fontSize: label.fontSize, ...item }; bestScore = score; }
      }
      placed[index] = best;
    }
    // Place monochrome symbols only after text and dimensions have settled.
    // Every corner stays inside its angle and clear of text, strokes and other marks.
    const symbolBoxes=[];
    for(const mark of equalAngleMarks)if(useSymbols){
      mark.symbols=[];const size=7,obstacles=[...segments,...lines,...markerSegments];
      for(let number=0;number<(mark.symbolCount||1);number++){
        let chosen=null;
        for(let radius=28;radius<=mark.maxRadius&&!chosen;radius+=7)for(const fraction of [.5,.42,.58,.34,.66,.26,.74]){
          const center=add(mark.vertex,directionAt(mark.start+mark.sweep*fraction),radius),box=rectangle(center,{width:size*2+5,height:size*2+5});
          if(!corners(box).every(p=>insideWedge(p,mark))||placed.some(l=>overlaps(box,l.box,3))||symbolBoxes.some(b=>overlaps(box,b,4))||obstacles.some(s=>segmentHitsRect(s.a,s.b,expand(box,2)))||circles.some(c=>circleHitsRect(c,box)))continue;
          chosen={...center,size};symbolBoxes.push(box);break;
        }
        if(chosen)mark.symbols.push(chosen);
        else {equalAngleIssues.push({group:mark.group,text:'[등각 그룹 확인 필요] '+mark.group+' 기호를 각 내부에 겹침 없이 배치할 공간이 없습니다.'});mark.symbols=[];break;}
      }
    }
    if(useSymbols){const blocked=new Set(equalAngleMarks.filter(m=>!m.symbols.length).map(m=>m.displayGroup));for(const m of equalAngleMarks)if(blocked.has(m.displayGroup))m.symbols=[];}
    const collisions = [];
    for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) if (overlaps(placed[i].box, placed[j].box, 5)) collisions.push({ label: placed[i].id, other: placed[j].id, type: 'label' });
    const permittedGeometryOverlaps = placed.filter(label => label.geometryHits).map(label => ({label:label.id,count:label.geometryHits}));
    const left = Math.min(0, ...placed.map(label => label.box.left - 22));
    const right = Math.max(width, ...placed.map(label => label.box.right + 22));
    // Keep the drawing scale and coordinates, but remove empty vertical canvas.
    // Include strokes, text, guides, leaders and mathematical marks before cropping.
    const vertical = [...points.values()].flatMap(p => [p.y-4,p.y+4]);
    for (const s of geometry) vertical.push(s.a.y,s.b.y);
    for (const c of circles) vertical.push(c.cy-c.r,c.cy+c.r);
    for (const region of shadedRegions) for (const ring of region.rings) for (const p of ring) vertical.push(p.y);
    for (const d of dimensions) vertical.push(d.control.y,d.a.y-12,d.a.y+12,d.b.y-12,d.b.y+12);
    for (const a of angles) if (!a.right) vertical.push(a.vertex.y-a.radius,a.vertex.y+a.radius);
    for (const m of parallelMarks) vertical.push(m.a.y,m.tip.y,m.b.y);
    for (const m of equalAngleMarks) {
      if (m.symbols) for (const p of m.symbols) vertical.push(p.y-p.size-2,p.y+p.size+2);
      else { const radius=m.radius+(m.count-1)*7+4; vertical.push(m.vertex.y-radius,m.vertex.y+radius); }
    }
    for (const l of placed) {
      vertical.push(l.box.top-4,l.box.bottom+4);
      if (l.leaderAnchor) vertical.push(l.leaderAnchor.y-14,l.leaderAnchor.y+14);
    }
    const top = options.trimVertical === false ? Math.min(0,...placed.map(l=>l.box.top-22)) : Math.floor(Math.min(...vertical)-18);
    const bottom = options.trimVertical === false ? Math.max(height,...placed.map(l=>l.box.bottom+22)) : Math.ceil(Math.max(...vertical)+18);
    return { width: Math.ceil(right - left), height: Math.ceil(bottom - top), viewBox: [left, top, right - left, bottom - top], points: [...points.values()], segments, lines, ticks, parallelMarks, shadedRegions, equalAngleMarks, equalAngleIssues, dimensions, circles, angles, labels: placed, collisions, permittedGeometryOverlaps, transform: { scale, minX, maxY, x: origin.x, y: origin.y } };
  }

  function diagramSvg(diagram, options = {}) {
    const layout = layoutDiagram(diagram, options); if (!layout) return null;
    const xy = point => `${round(point.x)},${round(point.y)}`;
    const ss=options.solutionStyle,printUnit=ss?layout.width/(ss.printWidthPt||220):1;
    const edgeStyle=segment=>{if(!ss)return segment.dashed?' stroke-dasharray="8 7"':'';const role=(options.segmentRoles||[]).find(s=>(s.from===segment.from&&s.to===segment.to)||(s.to===segment.from&&s.from===segment.to))?.role||'edge';return ` class="solution-line ${role}" stroke="${role==='emphasis'?'#2B608D':role==='auxiliary'?'#5B6570':'#151a1d'}" stroke-width="${round(printUnit*(role==='emphasis'?1.3:role==='auxiliary'?.8:1.5))}"${role==='auxiliary'?` stroke-dasharray="${round(printUnit*3)} ${round(printUnit*2)}"`:''}`;};
    const result = [`<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="${layout.viewBox.map(round).join(' ')}" role="img" aria-label="조건에 맞춰 그린 도형"><rect x="${round(layout.viewBox[0])}" y="${round(layout.viewBox[1])}" width="${layout.width}" height="${layout.height}" fill="white"/><g stroke="#151a1d" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">`];
    for(const region of layout.shadedRegions){const d=region.rings.map(ring=>'M '+ring.map(xy).join(' L ')+' Z').join(' ');result.push(`<path class="shaded-region" d="${d}" fill="${region.color}" fill-rule="evenodd" stroke="none"/>`);}
    for (const segment of layout.segments) result.push(`<polyline points="${xy(segment.a)} ${xy(segment.b)}"${edgeStyle(segment)}/>`);
    for(const line of layout.lines)result.push(`<polyline class="geometry-line" points="${xy(line.a)} ${xy(line.b)}"${line.dashed?' stroke-dasharray="8 7"':''}/>`);
    for(const tick of layout.ticks)result.push(`<polyline class="equal-length-tick" data-group="${escapeXml(tick.group)}" points="${xy(tick.a)} ${xy(tick.b)}"/>`);
    for(const mark of layout.parallelMarks)result.push(`<polyline class="parallel-mark" data-group="${escapeXml(mark.group)}" points="${xy(mark.a)} ${xy(mark.tip)} ${xy(mark.b)}"/>`);
    for(const d of layout.dimensions){
      result.push(`<path class="dimension-guide" d="M ${xy(d.a)} ${d.guideStyle==='straight'?`L ${xy(d.b)}`:`Q ${xy(d.control)} ${xy(d.b)}`}" stroke-dasharray="8 7"/>`);
      if(!d.curved)result.push(`<path class="dimension-extension" d="M ${xy(d.fromPoint)} L ${xy(d.a)} M ${xy(d.toPoint)} L ${xy(d.b)}" stroke-dasharray="5 5" stroke-width="1.8"/>`);
      const u=unit(sub(d.b,d.a)),n={x:-u.y,y:u.x};
      if(!d.curved&&d.endpointStyle==='tick')for(const p of [d.a,d.b])result.push(`<polyline class="dimension-endpoint" points="${xy(add(p,n,-7))} ${xy(add(p,n,7))}"/>`);
      if(!d.curved&&d.endpointStyle==='arrow')for(const tip of [d.a,d.b]){const dir=unit(sub(d.control,tip)),normal={x:-dir.y,y:dir.x},back=add(tip,dir,10);result.push(`<polyline class="dimension-endpoint" points="${xy(add(back,normal,5))} ${xy(tip)} ${xy(add(back,normal,-5))}"/>`);}
    }
    for (const circle of layout.circles) result.push(`<circle cx="${round(circle.cx)}" cy="${round(circle.cy)}" r="${round(circle.r)}"/>`);
    for (const angle of layout.angles) {
      if (angle.right) result.push(`<polyline points="${xy(angle.segments[0].a)} ${xy(angle.segments[0].b)} ${xy(angle.segments[1].b)}" stroke-width="1.8"/>`);
      else result.push(`<path d="M ${xy(angle.segments[0].a).replace(',', ' ')} A ${round(angle.radius)} ${round(angle.radius)} 0 0 ${angle.sweep > 0 ? 1 : 0} ${xy(angle.segments.at(-1).b).replace(',', ' ')}" stroke-width="1.7"/>`);
    }
    for(const mark of layout.equalAngleMarks){
      if(mark.symbols){for(const p of mark.symbols){const x=round(p.x),y=round(p.y),r=p.size;
        const shape=mark.symbol==='circle'?`<circle cx="${x}" cy="${y}" r="${r}"/>`:
          mark.symbol==='double-circle'?`<circle cx="${x}" cy="${y}" r="${r}"/><circle cx="${x}" cy="${y}" r="${r*.52}"/>`:
          mark.symbol==='cross'?`<path d="M ${x-r} ${y-r} L ${x+r} ${y+r} M ${x-r} ${y+r} L ${x+r} ${y-r}"/>`:
          mark.symbol==='plus'?`<path d="M ${x-r} ${y} H ${x+r} M ${x} ${y-r} V ${y+r}"/>`:
          mark.symbol==='triangle'?`<path d="M ${x} ${y-r} L ${x+r} ${y+r} L ${x-r} ${y+r} Z"/>`:
          mark.symbol==='diamond'?`<path d="M ${x} ${y-r} L ${x+r} ${y} L ${x} ${y+r} L ${x-r} ${y} Z"/>`:
          `<rect x="${x-r}" y="${y-r}" width="${2*r}" height="${2*r}"/>`;
        result.push(`<g class="equal-angle-symbol" data-group="${escapeXml(mark.group)}" data-symbol="${escapeXml(mark.symbol)}" stroke="#111111" stroke-width="2.3" fill="none">${shape}</g>`);
      }continue;}

      for(let i=0;i<(mark.style==='arc'?mark.count:1);i++){const radius=mark.radius+i*7,a=add(mark.vertex,directionAt(mark.start),radius),b=add(mark.vertex,directionAt(mark.start+mark.sweep),radius);result.push(`<path class="equal-angle-arc" d="M ${xy(a)} A ${round(radius)} ${round(radius)} 0 0 ${mark.sweep>0?1:0} ${xy(b)}" stroke-width="1.6"/>`);}
      if(mark.style==='dot')for(const p of mark.dots)result.push(`<circle class="equal-angle-dot" cx="${round(p.x)}" cy="${round(p.y)}" r="4" fill="#14191c" stroke="none"/>`);
    }
    result.push('</g>');
    // Shared point markers for the preview and Word export, including isolated centers.
    const dots = layout.points.filter(p => p.name.trim()&&(!options.pointNames||options.pointNames.includes(p.name)));
    for (const c of layout.circles) if (!dots.some(p => Math.hypot(p.x-c.cx,p.y-c.cy)<1)) dots.push({x:c.cx,y:c.cy,name:''});
    result.push('<g fill="#14191c" stroke="none">');
    for (const p of dots) result.push(`<circle class="geometry-point" data-point="${escapeXml(p.name)}" cx="${round(p.x)}" cy="${round(p.y)}" r="3.4"/>`);
    result.push('</g>');
    for (const label of layout.labels) if (label.leaderAnchor) {
      const toward = sub(label.leaderAnchor, label.center), u = unit(toward);
      const dx = Math.abs(toward.x) < 1e-9 ? Infinity : (label.box.right - label.box.left) / 2 / Math.abs(u.x);
      const dy = Math.abs(toward.y) < 1e-9 ? Infinity : (label.box.bottom - label.box.top) / 2 / Math.abs(u.y);
      const edge = add(label.center, u, Math.min(dx, dy) + 3);
      result.push(`<path${label.leaderArrow ? ' class="angle-label-leader"' : ''} d="M ${xy(label.leaderAnchor).replace(',', ' ')} L ${xy(edge).replace(',', ' ')}" stroke="#7a8177" stroke-width="1.2" stroke-dasharray="3 3" fill="none"/>`);
      if (label.leaderArrow) {
        const tip=label.leaderAnchor,back=add(tip,u,-9),normal={x:-u.y,y:u.x};
        result.push(`<path class="angle-label-arrow" d="M ${xy(add(back,normal,4)).replace(',', ' ')} L ${xy(tip).replace(',', ' ')} L ${xy(add(back,normal,-4)).replace(',', ' ')}" stroke="#59645b" stroke-width="1.6" fill="none"/>`);
      }
    }
    result.push('<g fill="#14191c" font-family="Times New Roman,Malgun Gothic,serif" text-anchor="middle">');
    for (const label of layout.labels) result.push(labelSvg(label));
    result.push('</g></svg>'); return result.join('');
  }
  // Image observations are approximate. Recover only a printed perpendicular
  // foot supported by all three independent records: its right-angle mark,
  // perpendicular constraint and containing side. Keep the source untouched;
  // callers must still validate every constraint on the returned copy.
  function prepareObservedPerpendicularFeet(diagram) {
    if (diagram?.coordinateSystem !== 'image_y_down' || !Array.isArray(diagram.points)) return diagram;
    const points = new Map(diagram.points.map(p => [p.name, p]));
    if (points.size !== diagram.points.length || diagram.points.some(p => !p.name || !Number.isFinite(p.x) || !Number.isFinite(p.y))) return diagram;
    const span = Math.hypot(Math.max(...diagram.points.map(p => p.x)) - Math.min(...diagram.points.map(p => p.x)), Math.max(...diagram.points.map(p => p.y)) - Math.min(...diagram.points.map(p => p.y)));
    if (!Number.isFinite(span) || span < 1e-9) return diagram;
    const edge = (a, b) => [a, b].sort().join('\u0000'), corrections = new Map();
    for (const mark of diagram.angles || []) {
      if (!mark.right) continue;
      const foot = mark.vertex;
      if (![mark.a, foot, mark.b].every(n => points.has(n)) || new Set([mark.a, foot, mark.b]).size !== 3) return diagram;
      const sides = (diagram.constraints || []).filter(c => c.type === 'collinear' && c.points?.length === 3 && new Set(c.points).size === 3 && c.points.includes(foot) && c.points.every(n => points.has(n)) && c.points.includes(mark.a) !== c.points.includes(mark.b));
      if (sides.length !== 1) continue;
      const side = sides[0].points.filter(n => n !== foot), center = sides[0].points.includes(mark.a) ? mark.b : mark.a;
      const sideNames = new Set([...side, foot]), leg = edge(foot, center);
      const supported = (diagram.constraints || []).some(c => {
        if (c.type !== 'perpendicular') return false;
        if (c.points?.length === 3) return c.points[1] === foot && [c.points[0], c.points[2]].includes(center) && sideNames.has(c.points[0] === center ? c.points[2] : c.points[0]);
        if (c.points?.length !== 4) return false;
        const pairs = [c.points.slice(0, 2), c.points.slice(2, 4)];
        return pairs.some((p, i) => edge(...p) === leg && pairs[1-i][0] !== pairs[1-i][1] && pairs[1-i].every(n => sideNames.has(n)));
      });
      if (!supported) continue;
      // Do not move an anchor that another foot construction depends on.
      if (corrections.has(center) || side.some(n => corrections.has(n))) return diagram;
      const a = points.get(side[0]), b = points.get(side[1]), source = points.get(center), direction = sub(b, a), squared = direction.x ** 2 + direction.y ** 2;
      if (squared < 1e-12) return diagram;
      const t = ((source.x - a.x) * direction.x + (source.y - a.y) * direction.y) / squared;
      const projected = { x: a.x + t * direction.x, y: a.y + t * direction.y };
      // This bounds an evidence-based correction; it never relaxes the strict
      // geometry validator. Large, ambiguous or contradictory observations fail.
      if (t <= 0 || t >= 1 || distance(points.get(foot), projected) > span * .02) return diagram;
      const previous = corrections.get(foot);
      if (previous && (previous.center !== center || edge(...previous.side) !== edge(...side))) return diagram;
      corrections.set(foot, { foot, center, side, projected });
    }
    if (!corrections.size) return diagram;
    for (const c of corrections.values()) if (c.side.some(n => corrections.has(n)) || corrections.has(c.center)) return diagram;
    const segments = (diagram.segments || []).map(s => ({ ...s }));
    for (const c of corrections.values()) {
      if (segments.some(s => edge(s.from, s.to) === edge(c.foot, c.center))) continue;
      // OCR may encode a printed path through the named intersection as one
      // endpoint-to-endpoint segment. Split that path at the existing center;
      // preserve its line style and require a unique nearby observed path.
      const paths = segments.flatMap((s, index) => {
        const peer = s.from === c.foot ? s.to : s.to === c.foot ? s.from : null;
        if (!peer || c.side.includes(peer) || !points.has(peer)) return [];
        const a = points.get(c.foot), b = points.get(peer), p = points.get(c.center), v = sub(b, a), squared = v.x ** 2 + v.y ** 2;
        if (squared < 1e-12) return [];
        const t = ((p.x - a.x) * v.x + (p.y - a.y) * v.y) / squared, offset = Math.abs(v.x * (p.y - a.y) - v.y * (p.x - a.x)) / Math.sqrt(squared);
        return t > 0 && t < 1 && offset <= span * .05 ? [{ index, segment: s }] : [];
      });
      if (paths.length !== 1) return diagram;
      const { index, segment } = paths[0];
      segments.splice(index, 1, { ...segment, to: c.center }, { ...segment, from: c.center });
    }
    return { ...diagram, points: diagram.points.map(p => corrections.has(p.name) ? { ...p, ...corrections.get(p.name).projected } : { ...p }), segments };
  }
  function confirmObservedIntersection(diagram,{pointName,paths,sourceConfirmed}={}) {
    if(sourceConfirmed!==true||diagram?.coordinateSystem!=='image_y_down'||!Array.isArray(paths)||!paths.length)throw Error('원본에서 확인한 교차점과 인쇄 선분이 필요합니다.');
    const out=structuredClone(diagram),points=new Map(out.points.map(p=>[p.name,p])),point=points.get(pointName);
    if(!point)throw Error('관측 교차점이 없습니다.');
    const selected=new Map();
    for(const pair of paths){
      if(!Array.isArray(pair)||pair.length!==2||pair.includes(pointName))throw Error('교차점을 지나는 원본 선분을 선택하세요.');
      const a=points.get(pair[0]),b=points.get(pair[1]);if(!a||!b)throw Error('선분 끝점이 없습니다.');
      const v=sub(b,a),length=distance(a,b),t=((point.x-a.x)*v.x+(point.y-a.y)*v.y)/(length*length),offset=Math.abs(v.x*(point.y-a.y)-v.y*(point.x-a.x))/length;
      if(!length||t<=0||t>=1||offset>length*.05)throw Error('원본 교차점과 관측 선분의 위치를 다시 확인하세요.');
      const candidates=out.segments.flatMap((s,i)=>((s.from===pair[0]&&s.to===pair[1])||(s.from===pair[1]&&s.to===pair[0]))?[i]:[]);
      if(candidates.length!==1||selected.has(candidates[0]))throw Error('유일한 인쇄 선분을 선택하세요.');selected.set(candidates[0],pointName);
    }
    out.segments=out.segments.flatMap((s,i)=>selected.has(i)?[{...s,to:pointName},{...s,from:pointName}]:[s]);return out;
  }
  function questionDiagram(question) {
    if (question.diagram) return requiredLines(question.diagram,question.body);
    if (!question.observedDiagram) return null;
    return requiredLines({ shadedRegions:[],equalAngleMarks:[],lines:[],equalLengthMarks:[],angleLabelOverrides:null,...question.observedDiagram, dimensions:(question.observedDiagram.dimensions||[]).map(d=>({guideStyle:null,...d})), coordinateSystem: question.observedDiagram.coordinateSystem || 'image_y_down', angleLabelLeaders: question.observedDiagram.angleLabelLeaders || 'auto' },question.body);
  }
  function requiredLines(diagram,body){
    const lines=[...(diagram.lines||[])],points=new Map((diagram.points||[]).map(p=>[p.name,p]));
    // Unambiguous named straight lines only. An unnamed l/ℓ needs observed
    // placement from the model; never fabricate it or change a numeral to l.
    for(const match of labelText(body).matchAll(/직선\s*([A-Z])\s*([A-Z])(?![A-Za-z])/g)){
      const a=points.get(match[1]),b=points.get(match[2]);
      if(!a||!b||distance(a,b)<1e-9||lines.some(l=>l.through?.includes(a.name)&&l.through?.includes(b.name)))continue;
      lines.push({start:{x:a.x,y:a.y},end:{x:b.x,y:b.y},through:[a.name,b.name],label:'',dashed:false,origin:diagram.coordinateSystem==='image_y_down'?'printed':'constructed'});
    }
    return lines.length===(diagram.lines||[]).length?diagram:{...diagram,lines};
  }
  return { layoutDiagram, diagramSvg, labelText, textSize, questionDiagram, equalLengthMarks, prepareObservedPerpendicularFeet, confirmObservedIntersection };
});
