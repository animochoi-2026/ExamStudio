const test=require('node:test'),assert=require('node:assert/strict');
const {subparts,positionRequest,presentationOnly}=require('../app/question-presentation.js');
const {normalizeQuestion}=require('../app/store.cjs');
const {Workflow}=require('../app/workflow.cjs');
const {documentHtml}=require('../app/pdf-export.cjs');
const {item,recognition}=require('./workflow-fixtures.cjs');
test('blank lines and repeated subquestion sequences create independent figure slots without splitting math',()=>{
 const {flowParts,figureSlot}=require('../app/question-presentation.js');
 const body='물음에 답하시오.\n\n(1) 첫째 카드\n\n(2) 둘째 카드\n\n(1) 첫째 물음\n\n(2) 둘째 물음';
 const parts=flowParts(body);assert.equal(parts.length,5);assert.equal(parts[1].text,'(1) 첫째 카드');
 const q={body,figurePlacements:{one:parts[1].slot,two:parts[2].slot},materialImages:[{id:'one',label:'그림하나',dataUrl:'data:image/png;base64,AA=='},{id:'two',label:'그림둘',dataUrl:'data:image/png;base64,AA=='}]};
 const html=documentHtml({title:'삽입',settings:{},questions:[q]});
 const positions=['물음에 답하시오.','그림하나','(1) 첫째 카드','그림둘','(2) 둘째 카드'].map(s=>html.indexOf(s));assert.deepEqual(positions,[...positions].sort((a,b)=>a-b));
 assert.equal(figureSlot({...q,body:'본문 수정'},'one'),'after');
 assert.equal(flowParts('본문 $$x=1\n\ny=2$$ 끝').length,1);
 const old='조건\n(1) 첫째\n(2) 둘째';assert.equal(flowParts(old).at(-1).slot,'part:1');
});
test('layout requests distinguish document placement from labels and math edits',()=>{
 for(const text of ['그림을 문제 위로 옮겨줘','도형을 위에 배치해줘','문제 위에 그림을 넣어줘'])assert.equal(positionRequest(text),'before');
 for(const text of ['그림을 아래로 옮겨줘','도형을 본문 뒤로 배치해줘'])assert.equal(positionRequest(text),'after');
 assert.equal(positionRequest('그림을 위로 옮기지 말아줘'),null);
 assert.equal(positionRequest('22도를 그림 위로 빼줘'),null);
 assert.equal(presentationOnly('그림을 문제 위로 옮겨줘'),true);
 assert.equal(presentationOnly('수치를 바꾸고 그림을 위로 배치해줘'),false);
});
test('subquestions split only consecutive numbered prose, preserving equations and references',()=>{
 const text='조건 $f(1)=2$\n(1) 길이를 구하시오.\n(2) 넓이를 구하시오.\n(3) 이유를 쓰시오.';
 assert.equal(subparts(text).length,3);assert.ok(subparts(text)[0].includes('$f(1)=2$'));
 for(const text of ['점 (1)에서 점 (2)로 이동','$ (1) + (2) $','(2)만 풀어라','(1) 조건\n(3) 조건'])assert.deepEqual(subparts(text),[text]);
 assert.equal(subparts('(1) 첫째 (2) 둘째').length,2);
});
test('presentation updates preserve math, approvals, includes, and unrelated questions without AI',()=>{
 const q={id:'q',body:'본문',answer:'2',solution:'풀이',include:true,approval:{status:'approved'},checks:{program:{status:'partial'}}};
 let project={problems:[{id:'p',original:q,variants:[{...structuredClone(q),id:'v'}],messages:[]}]};
 const store={updateProblem:(_,id,fn)=>{fn(project.problems.find(p=>p.id===id));return structuredClone(project);}};
 const workflow=Object.create(Workflow.prototype);workflow.store=store;
 workflow.setPresentation({projectId:'project',problemId:'p',targetIds:['q'],diagramPosition:'before',text:'그림을 위로 옮겨줘'});
 assert.deepEqual(project.problems[0].original,{...q,diagramPosition:'before'});
 assert.equal(project.problems[0].variants[0].diagramPosition,undefined);
 assert.equal(project.problems[0].messages.length,2);
 assert.equal(normalizeQuestion({...q,diagramPosition:'before'},'p','original').diagramPosition,'before');
 assert.throws(()=>workflow.setPresentation({projectId:'project',problemId:'p',targetIds:['missing'],diagramPosition:'before'}));
});
test('PDF respects before/after ordering and adds only subquestion display spacing',()=>{
 const question={...item().question,diagram:recognition().observedDiagram,body:'(1) 첫째 물음\n(2) 둘째 물음',kind:'original'};
 for(const diagramPosition of ['before','after']){
  const html=documentHtml({title:'검사',settings:{workspaceLines:0},questions:[{...question,diagramPosition}]});
  const body=html.indexOf('첫째 물음'),figure=html.indexOf('<svg');assert.ok(figure>0);
  assert.equal(figure<body,diagramPosition==='before');
  assert.equal((html.match(/class="subquestion-part(?: subquestion-following)?"/g)||[]).length,2);
  assert.match(html,/subquestion-part\+\.subquestion-part\{margin-top:1em/);
 }
});

test('figure slots preserve legacy positions, clamp removed subquestions and keep objects independent',()=>{
 const {figureSlot,validSlot}=require('../app/question-presentation.js');
 const q={body:'(1) 첫째\n(2) 둘째',diagramPosition:'before',figurePlacements:{diagram:'part:1','material-a':'after'}};
 assert.equal(figureSlot(q,'diagram'),'part:1');assert.equal(figureSlot(q,'material-a'),'after');
 assert.equal(figureSlot({...q,body:'한 문항'},'diagram'),'before');
 assert.equal(validSlot('part:0',2),false);assert.equal(validSlot('part:2',2),false);
});

test('individual figure placement validates every target before changing data',()=>{
 const {materialId}=require('../app/source-materials.cjs');
 const material={label:'방법 1',regionIndex:0,bounds:null};
 const q={id:'q',kind:'original',body:'(1) 첫째\n(2) 둘째',answer:'2',solution:'풀이',include:true,approval:{status:'approved'},figurePlacements:{diagram:'after'}};
 const p={id:'p',original:q,variants:[{...structuredClone(q),id:'v',kind:'variant'}],cropPaths:['source.png'],recognition:{materials:[material]},messages:[]};
 const workflow=Object.create(Workflow.prototype);workflow.store={updateProblem:(_,id,fn)=>{fn(p);return structuredClone(p);}};
 const request={projectId:'project',problemId:'p',targetIds:['q']},id=materialId(material,p),initial=structuredClone(p);
 for(const bad of [{figureId:'foreign',slot:'before'},{figureId:id,slot:'part:2'},{targetIds:['q','v'],figureId:id,slot:'before'}]){
  assert.throws(()=>workflow.setPresentation({...request,...bad}));assert.deepEqual(p,initial);
 }
 workflow.setPresentation({...request,figureId:id,slot:'before'});
 workflow.setPresentation({...request,figureId:'diagram',slot:'part:1'});
 assert.deepEqual(q,{...initial.original,figurePlacements:{diagram:'part:1',[id]:'before'},figurePlacementManual:{[id]:true,diagram:true}});
 assert.deepEqual(p.variants,initial.variants);assert.deepEqual(p.messages,[]);
});

test('PDF places independently stored materials around an inter-subquestion diagram',()=>{
 const question={...item().question,diagram:recognition().observedDiagram,body:'(1) 첫째 물음\n(2) 둘째 물음',kind:'original',materialImages:[{id:'m1',label:'방법 하나',dataUrl:'data:image/png;base64,AA=='},{id:'m2',label:'방법 둘',dataUrl:'data:image/png;base64,AA=='}],figurePlacements:{m1:'before',diagram:'part:1',m2:'after'}};
 const html=documentHtml({title:'검사',settings:{workspaceLines:0},questions:[question]});
 const positions=['방법 하나','첫째 물음','<svg','둘째 물음','방법 둘'].map(s=>html.indexOf(s));
 assert.ok(positions.every(n=>n>=0));assert.deepEqual(positions,[...positions].sort((a,b)=>a-b));
});

test('recognition soft wraps join prose while box and diagram keep source order in PDF',()=>{
 const {normalizePrintLineBreaks}=require('../app/question-text.cjs');
 const {documentHtml}=require('../app/pdf-export.cjs');
 const body=normalizePrintLineBreaks('$\\triangle ABC$\n에서 조건을 읽으시오.\n\n뒤 문장을 보시오.');
 assert.equal(body,'$\\triangle ABC$에서 조건을 읽으시오.\n뒤 문장을 보시오.');
 assert.equal(normalizePrintLineBreaks('∠C=∠F=90°\n인 두 직각삼각형에서 길이를 구하시오.'),'∠C=∠F=90°인 두 직각삼각형에서 길이를 구하시오.');
 const q={id:'flow',kind:'original',body,statementBox:['ㄱ. 첫 조건','ㄴ. 둘째 조건'],boxSlot:'line:1',bodyBorder:true,choices:['① 답'],answer:'①',solution:'풀이',diagramMode:'source',sourceFigureDataUrl:'data:image/png;base64,AA==',figurePlacements:{diagram:'line:1'}};
 const html=documentHtml({title:'배치',questions:[q],settings:{}});
 const before=html.indexOf('에서 조건을 읽으시오.'),box=html.indexOf('ㄱ. 첫 조건'),figure=html.indexOf('alt="원본 그림"'),after=html.indexOf('뒤 문장을 보시오.');
 assert.ok(before<box&&box<figure&&figure<after,{before,box,figure,after});
 assert.equal((html.match(/ㄱ\. 첫 조건/g)||[]).length,1);
 assert.ok(html.indexOf('class="printed-question-border"')<before);
});

test('one-line paragraph boundary accepts a movable figure without changing legacy blank-line slots',()=>{
 const {flowParts,figureSlot}=require('../app/question-presentation.js');
 const body='∠C=∠F=90°\n△ABC와 △DEF에서 AB=DE, AC=DF라 하자.\n다음 중 옳은 것은?';
 assert.deepEqual(flowParts(body).map(p=>p.slot),['before','line:1','line:2']);
 const q={...item().question,body,diagram:recognition().observedDiagram,figurePlacements:{diagram:'line:2'}};
 assert.equal(figureSlot(q,'diagram'),'line:2');
 const html=documentHtml({title:'배치',questions:[q],settings:{}});
 assert.ok(html.indexOf('AC=DF라 하자.')<html.indexOf('<svg'));
 assert.ok(html.indexOf('<svg')<html.indexOf('다음 중 옳은 것은?'));
 const legacy=flowParts('첫 문단\n\n둘째 문단\n셋째 문단');
 assert.equal(legacy[1].slot,'gap:1');
 assert.equal(legacy[2].slot,'line:1');
});
