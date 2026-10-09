const test=require('node:test'),assert=require('node:assert/strict'),{infer}=require('../app/task-intent.js'),{inspectDiagram}=require('../app/geometry.cjs');
test('natural requests infer operation and variant; explicit chat quantities are retained without duplicate controls',()=>{
 assert.deepEqual(infer('수치만 바꿔서 중상 난이도로 3개 만들어줘'),{variant:'numeric_only',task:'generation',count:3});
 assert.equal(infer('도형 좌우 반전해서 두 문제 만들어줘').variant,'mirror_numeric');assert.equal(infer('도형 좌우 반전해서 두 문제 만들어줘').count,2);
 assert.equal(infer('조건과 정답이 맞는지 검토해줘').task,'validation');assert.equal(infer('이 원문을 풀어줘').task,'solve');assert.equal(infer('문장만 다시 인식해줘').recognitionTarget,'text');assert.equal(infer('그림을 다시 그려줘').recognitionTarget,'diagram');
 assert.equal(infer('유사문제 2번 그림 다시 그려줘').variantIndex,1);assert.equal(infer('11개 만들어줘').count,11);assert.equal(infer('이건 왜 그래?').task,undefined);
});

test('audit 4: variant references do not turn solution or review requests into generation',()=>{
 for(const text of ['유사문제 1번 풀이를 합동으로 다시 풀어줘','풀이를 재생성해줘','합동으로 풀고 검산해줘'])assert.equal(infer(text).task,'solve',text);
 assert.equal(infer('유사문제 1번 정답을 재검수해줘').task,'validation');
 assert.equal(infer('유사문제 1번의 풀이가 맞는지 검토해줘').task,'validation');
 assert.equal(infer('유사문제 1번처럼 새 문제 2개 만들고 풀이도 작성해줘').task,'generation');
 assert.equal(infer('유사문제 1번의 수치를 바꿔줘').task,'revision');
});

test('chat quantities distinguish problem numbers and unrelated geometry numbers; quick actions stay single',()=>{
 const {generationCount}=require('../app/task-intent.js');
 for(const text of ['3개 만들어줘','유사문제 3개를 동일 난이도로 만들어줘','세 문제 만들어줘','3문항 생성해줘','유사문제 3문제 만들어줘','유사문제 2번처럼 새 문제 3개 만들어줘'])assert.equal(generationCount({text}),3,text);
 assert.equal(generationCount({text:'22도를 사용한 유사문제를 만들어줘'}),1);
 assert.equal(generationCount({text:'유사문제 2번처럼 만들어줘'}),1);
 assert.equal(generationCount({text:'유사문제 3개 만들어줘',requestKind:'suggestion',count:9}),1);
 assert.equal(generationCount({text:'3개 만들어줘',regenerateOf:'variant'}),3);
 assert.equal(generationCount({text:'다시 시도',count:3}),3);
 assert.throws(()=>generationCount({text:'0개 만들어줘'}),/생성 개수/);
 assert.throws(()=>generationCount({count:1.5}),/생성 개수/);
});
test('collinearity handles 4+ points, identifies missing points and detects off-line points',()=>{
 const d={points:['A','B','C','D'].map((name,x)=>({name,x,y:0})),constraints:[{type:'collinear',points:['A','B','C','D'],value:null}]};assert.equal(inspectDiagram(d).ok,true);
 d.points[3].y=1;assert.match(inspectDiagram(d).errors.join(' '),/한 직선/);d.points.pop();assert.match(inspectDiagram(d).errors.join(' '),/그림에 없는 점: D/);assert.doesNotMatch(inspectDiagram(d).errors.join(' '),/collinear/);
});

test('direct chat and popup instructions override defaults while generated button text is not promoted',()=>{
 const {generationDifficulty,directInstructions,generationCount}=require('../app/task-intent.js');
 assert.equal(generationDifficulty({text:'중상 난이도로 3개 만들어줘',difficulty:'same'}),'중상');
 assert.equal(generationDifficulty({text:'난이도 상으로 만들어줘'}),'상');
 assert.equal(generationDifficulty({text:'난이도 중하로 만들어줘'}),'중하');
 assert.equal(generationDifficulty({requestKind:'suggestion',text:'중상 난이도로 만들어줘'}),'same');
 assert.equal(generationDifficulty({requestKind:'suggestion',regenerateOf:'q',difficulty:'상',regenerationInstructions:'중하 난이도로 만들어줘'}),'중하');
 assert.equal(generationCount({requestKind:'suggestion',regenerateOf:'q',regenerationInstructions:'3개 만들어줘'}),3);
 assert.equal(directInstructions({requestKind:'suggestion',text:'자동 실행 안내'}),'');
 assert.equal(directInstructions({requestKind:'retry',text:'다시 시도',userInstructions:'닮음을 이용해 풀어줘'}),'닮음을 이용해 풀어줘');
});

test('mixed variant requests add their quantities without counting a repeated total',()=>{
 const {generationCount,requestedBatches}=require('../app/task-intent.js');
 for(const text of ['수치만 바꾼 유사문제 2개, 수치와 도형을 좌우반전한거 1개 만들어줘','숫자 변경 두 문제와 좌우 반전 한 문제 만들어줘','수치 변경 2개 + 좌우 반전 1개, 총 3개 만들어줘']){assert.equal(generationCount({text}),3,text);assert.equal(requestedBatches(text).length,2);}
 assert.equal(generationCount({text:'각 2개가 같은 도형으로 유사문제 3개 만들어줘'}),3);
});
