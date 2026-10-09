'use strict';
// Manually transcribed from the preserved source PDF, page 2, question 5.
// Coordinates below are fixture drawing placement, never production recognition rules.
const {recognition}=require('../workflow-fixtures.cjs');
const text=text=>({kind:'text',text,label:'',border:'none',widthEm:0,align:'left',origin:'printed'});
const math=value=>({...text(value),kind:'math'});
const blank=(label,widthEm=8)=>({...text(''),kind:'blank',label,border:'box',widthEm,align:'center'});
const reason=value=>({...text(value),kind:'reason'});
const node=(id,type,parentId=null,inlines=[],extra={})=>({id,type,parentId,inlines,origin:'printed',align:'left',widthRatio:1,figureId:null,diagram:null,...extra});
function figures(){
 const template=recognition().observedDiagram;
 const point=(name,x,y)=>({name,x,y,labelDx:null,labelDy:null});
 const edge=(from,to)=>({from,to,dashed:false});
 const right=(a,vertex,b)=>({a,vertex,b,label:'',right:true});
 const tick=(from,to,count)=>({from,to,count,group:count===2?'hypotenuse':'leg',position:null,origin:'printed'});
 const left={...template,points:[point('A',4,0),point('B',0,7),point('C',4,7),point('D',10,0),point('E',6,7),point('F',10,7)],segments:[edge('A','B'),edge('B','C'),edge('C','A'),edge('D','E'),edge('E','F'),edge('F','D')],angles:[right('A','C','B'),right('D','F','E')],equalLengthMarks:[tick('A','B',2),tick('D','E',2)],labels:[],constraints:[]};
 const joined={...template,points:[point('A(D)',4,0),point('B',0,7),point('C(F)',4,7),point('E',8,7)],segments:[edge('A(D)','B'),edge('B','C(F)'),edge('C(F)','E'),edge('E','A(D)'),edge('A(D)','C(F)')],angles:[right('A(D)','C(F)','B')],equalLengthMarks:[tick('A(D)','B',2),tick('A(D)','E',2),tick('A(D)','C(F)',1)],labels:[],constraints:[]};
 return {left,joined};
}
function question(){
 const {left,joined}=figures();
 const body='다음은 빗변의 길이와 다른 한 변의 길이가 각각 같은 두 직각삼각형은 서로 합동임을 보이는 과정이다. ㉠~㉤에 들어갈 내용으로 옳은 것은?';
 const nodes=[
 node('intro','paragraph',null,[text(body)]),node('proof-box','box'),
 node('conditions','paragraph','proof-box',[math('\\angle C=\\angle F=90^\\circ'),text('인 두 직각삼각형 ABC와 DEF에서 '),math('\\overline{AB}=\\overline{DE},\\;\\overline{AC}=\\overline{DF}'),text('라고 하자.')]),
 node('figures','figureGroup','proof-box'),node('separate','figure','figures',[],{diagram:left,widthRatio:.5,align:'center'}),node('arrow','arrow','figures',[text('➜')],{widthRatio:.08,align:'center'}),node('joined','figure','figures',[],{diagram:joined,widthRatio:.42,align:'center'}),
 node('flip','paragraph','proof-box',[math('\\triangle DEF'),text('를 뒤집어 '),math('\\overline{AC}'),text('와 '),math('\\overline{DF}'),text('가 맞닿도록 놓으면')]),
 node('blank-line','paragraph','proof-box',[blank('㉠',14)],{align:'center'}),
 node('collinear','paragraph','proof-box',[text('이므로 세 점 B, C(F), E는 한 직선 위에 있게 된다. 이때')]),
 node('first','proofStep','proof-box',[math('\\overline{AB}=\\overline{AE}'),text('   …… '),reason('①')],{align:'center'}),
 node('triangle','paragraph','proof-box',[text('이므로 '),math('\\triangle ABE'),text('는 '),blank('㉡',7),text('이다. 그러므로')]),
 node('second','proofStep','proof-box',[blank('㉢',7),text('   …… '),reason('②')],{align:'center'}),
 node('third','proofStep','proof-box',[text('또,   '),math('\\angle C=\\angle F=90^\\circ'),text('   …… '),reason('③')]),
 node('reasons','paragraph','proof-box',[reason('①, ②, ③'),text('에 의해서')]),
 node('congruence','proofStep','proof-box',[math('\\triangle ABC\\equiv\\triangle DEF'),text('('),blank('㉣',3),text('합동)')],{align:'center'}),
 node('conclusion','paragraph','proof-box',[text('따라서 빗변의 길이와 '),blank('㉤',9),text('가 각각 같은 두 직각삼각형은 서로 합동이다.')])];
 return {id:'source-q5',sourceId:'source',kind:'original',body,statementBox:[],choices:['㉠: $\\angle ABC+\\angle DEF=180^\\circ$','㉡: 정삼각형','㉢: $\\overline{AC}=\\overline{DF}$','㉣: RHS','㉤: 다른 한 변의 길이'],answer:'',solution:'',layout:'auto',layoutMode:'auto',layoutDocument:{version:1,features:['multiElementBox','inlineBlanks','multipleFigures','interleavedFlow','proofSteps'],nodes}};
}
module.exports={question,node,text,math,blank,reason,figures};
