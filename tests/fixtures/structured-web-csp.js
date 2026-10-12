import {questionContent} from '../../web-bank/print-question.js';
import geometry from '../../app/geometry.cjs';
import structure from '../../app/structured-layout.js';
const node=(id,type,parentId=null,extra={})=>({id,type,parentId,origin:'printed',align:'center',widthRatio:1,figureId:null,diagram:null,inlines:[],...extra});
const text=text=>({kind:'text',text,label:'',border:'none',widthEm:0,align:'left',origin:'printed'});
const diagram={points:[{name:'__a',x:50,y:0},{name:'__b',x:0,y:80},{name:'__c',x:100,y:80}],segments:[{from:'__a',to:'__b'},{from:'__b',to:'__c'},{from:'__c',to:'__a'}],coordinateSystem:'image_y_down'};
const nodes=[node('intro','paragraph',null,{inlines:[text('도형 6개의 3열 배치 및 빈칸 표시 검사')]}),node('box','box'),node('caption','paragraph','box',{inlines:[text('<보기>')]})];
for(let row=0;row<2;row++){nodes.push(node('row'+row,'figureGroup','box'));for(let col=0;col<3;col++)nodes.push(node('figure'+row+col,'figure','row'+row,{widthRatio:1/3,diagram:structuredClone(diagram)}));}
nodes.push(node('blank','paragraph',null,{inlines:[text('빈칸 '),{kind:'blank',text:'',label:'(가)',border:'box',widthEm:2,align:'center',origin:'printed'}]}));
const q={body:'',choices:['2','3','4','5','6'],layoutMode:'structure',layoutDocument:{version:1,features:['multipleFigures','multiElementBox'],nodes}};
const figures=nodes.filter(n=>n.diagram).map(n=>{const image=document.createElement('img');image.src=URL.createObjectURL(new Blob([geometry.diagramSvg(n.diagram,structure.diagramOptions(q,n))],{type:'image/svg+xml'}));return{structureId:n.id,node:image};});
document.querySelector('main').append(questionContent(q,figures));
window.ready=Promise.all([document.fonts.ready,...[...document.images].map(i=>i.decode())]);
